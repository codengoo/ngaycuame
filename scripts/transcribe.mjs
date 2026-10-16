// Speech-to-text for the kids' recordings via Cloudflare Workers AI (Whisper).
//
// Result is cached in kids/<slug>/transcript.json
//   { "audioHash", "text", "words": [[word, start, end], …] }
// It is only re-run when the recording changes, so the "text" can be fixed by
// hand and the edit is kept. Delete the file to transcribe again.
//
// The word timestamps drive the karaoke reveal of the wish: alignWish() maps
// them onto the words of the wish, even where Whisper misheard a few letters.
//
// Auth: CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID), otherwise the account
// you're logged into with `npx wrangler login`.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODEL = "@cf/openai/whisper-large-v3-turbo";
// Short context only: it fixes "20 tháng 10" and stops Whisper from inventing
// YouTube outros on unclear speech. A full sample wish made it copy the sample
// and drop the mums' names.
const PROMPT = "Lời chúc ngày 20 tháng 10 của con gửi mẹ.";

const wrangler = (args) => JSON.parse(execSync(`npx wrangler ${args} --json`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));

let auth;
const getAuth = () => {
  if (auth) return auth;
  const token = process.env.CLOUDFLARE_API_TOKEN || wrangler("auth token").token;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || wrangler("whoami").accounts[0].id;
  return (auth = { token, accountId });
};

const whisper = async (audioBuf) => {
  const { token, accountId } = getAuth();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audio: audioBuf.toString("base64"), language: "vi", initial_prompt: PROMPT }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`);
  return {
    // One sentence per line, like the hand-written wishes
    text: json.result.text.trim().replace(/([.!?])\s+/g, "$1\n"),
    words: json.result.segments.flatMap((s) => s.words || []).map((w) => [w.word.trim(), w.start, w.end]),
  };
};

// One word per line keeps the file readable
const serialize = ({ audioHash, text, words }) => `{
  "audioHash": ${JSON.stringify(audioHash)},
  "text": ${JSON.stringify(text)},
  "words": [
${words.map((w) => "    " + JSON.stringify(w)).join(",\n")}
  ]
}
`;

// Sets kid.transcript ({ text, words } or undefined) for every kid; never throws.
export const transcribeKids = async (kids, hash) => {
  for (const kid of kids) {
    const file = join(kid.dir, "transcript.json");
    const audioHash = hash(readFileSync(kid.audio));
    const cached = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    if (cached?.audioHash === audioHash && cached.words) {
      kid.transcript = cached;
      continue;
    }
    try {
      const result = await whisper(readFileSync(kid.audio));
      // Recording unchanged (only the timestamps were missing): keep a hand-fixed text
      if (cached?.audioHash === audioHash && cached.text) result.text = cached.text;
      writeFileSync(file, serialize({ audioHash, ...result }));
      kid.transcript = result;
      console.log(`✎ Đã chuyển ghi âm thành chữ: kids/${kid.slug}/transcript.json (nên đọc lại và sửa nếu sai)`);
    } catch (err) {
      console.warn(`⚠ Không chuyển được ghi âm của kids/${kid.slug}/ thành chữ: ${err.message}`);
    }
  }
};

// ---------- Aligning the wish with the recognised words ----------

// Numbers as they are spoken, so a written "20/10" lines up with "hai mươi tháng mười"
const UNITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const readNumber = (digits) => {
  const n = Number(digits);
  if (digits.length > 2) return [...digits].map((d) => UNITS[d]).join(" ");
  if (n < 10) return UNITS[n];
  const [t, u] = [Math.floor(n / 10), n % 10];
  const unit = u === 0 ? "" : u === 5 ? " lăm" : t > 1 && u === 1 ? " mốt" : t > 1 && u === 4 ? " tư" : " " + UNITS[u];
  return (t === 1 ? "mười" : UNITS[t] + " mươi") + unit;
};
const spoken = (s) => s.replace(/(\d+)\/(\d+)/g, "$1 tháng $2").replace(/\d+/g, readNumber);

// Letters/digits only, without Vietnamese diacritics, so "xinh" ≈ "xin", "lắm" ≈ "nắm"
const letters = (s) => [...spoken(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase()]
  .filter((c) => /[\p{L}\p{N}]/u.test(c));

// Returns [start, end] seconds for every whitespace-separated word of `text`,
// or null when the text doesn't match the recording well enough.
export const alignWish = (text, words) => {
  if (!words?.length) return null;

  // Recognised characters, each with its share of its word's time span
  const heard = [];
  for (const [w, s, e] of words) {
    const cs = letters(w);
    cs.forEach((c, j) => heard.push({ c, s: s + ((e - s) * j) / cs.length, e: s + ((e - s) * (j + 1)) / cs.length }));
  }
  const wishWords = text.split(/\s+/).filter(Boolean).map(letters);
  const wish = wishWords.flat();
  if (!wish.length || !heard.length) return null;

  // Edit-distance alignment of the two character sequences
  const n = wish.length, m = heard.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Int32Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j - 1] + (wish[i - 1] === heard[j - 1].c ? 0 : 1), d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  const time = new Array(n).fill(null);
  let same = 0;
  for (let i = n, j = m; i > 0 && j > 0;) {
    if (d[i][j] === d[i - 1][j - 1] + (wish[i - 1] === heard[j - 1].c ? 0 : 1)) {
      if (wish[i - 1] === heard[j - 1].c) same++;
      time[i - 1] = heard[j - 1];
      i--; j--;
    } else if (d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  if (same / n < 0.6) return null;

  // Characters the recording skipped share the gap between their neighbours
  for (let i = 0; i < n;) {
    if (time[i]) { i++; continue; }
    let k = i;
    while (k < n && !time[k]) k++;
    const from = i > 0 ? time[i - 1].e : heard[0].s;
    const to = k < n ? time[k].s : heard[m - 1].e;
    for (let x = i; x < k; x++) {
      time[x] = { s: from + ((to - from) * (x - i)) / (k - i), e: from + ((to - from) * (x - i + 1)) / (k - i) };
    }
    i = k;
  }

  // Back to words; a word without letters (a lone dash…) appears with its neighbour
  const r = (v) => Math.round(v * 100) / 100;
  let pos = 0, last = heard[0].s;
  return wishWords.map((cs) => {
    if (!cs.length) return [r(last), r(last)];
    const span = [r(time[pos].s), r(time[pos + cs.length - 1].e)];
    pos += cs.length;
    last = span[1];
    return span;
  });
};
