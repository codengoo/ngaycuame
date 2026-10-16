// Builds one greeting page per kid.
//
//   kids/<slug>/kid.json      { "name", "wish"?, "date"?, "avatarFocus"? } – created if missing
//   kids/<slug>/avatar.*      png / jpg / jpeg / webp    (any file name; renamed; optional)
//   kids/<slug>/audio.*       m4a / mp3 / wav / ogg / aac (any file name; renamed)
//   kids/<slug>/transcript.json  generated from audio.* (see transcribe.mjs);
//                             used as the wish when kid.json has none, and for
//                             the per-word timing of the karaoke reveal
//
// Output (all under public/, served as static assets):
//   public/<slug>/index.html, avatar.webp, og.jpg, audio.<ext>
//   public/index.html, og.jpg = list of all kids (template/home.html)
//   public/sitemap.xml, public/robots.txt
//   QR/<slug>.png = QR code (transparent background) of each kid's prod link – not deployed, git-ignored
//
// Needs a local Chrome/Edge (set CHROME_PATH if it isn't found).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import QRCode from "qrcode";
import { withChrome } from "./chrome.mjs";
import { isSlug, slugify, titleFromSlug } from "./slug.mjs";
import { alignWish, transcribeKids } from "./transcribe.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIDS_DIR = join(ROOT, "kids");
const PUBLIC = join(ROOT, "public");
const MANIFEST = join(ROOT, "scripts", ".generated.json");
const QR_DIR = join(ROOT, "QR");

const site = JSON.parse(readFileSync(join(ROOT, "site.json"), "utf8"));
const baseUrl = site.baseUrl.replace(/\/+$/, "");
const template = readFileSync(join(ROOT, "template", "index.html"), "utf8");
const homeTemplate = readFileSync(join(ROOT, "template", "home.html"), "utf8");
// Shared CSS/JS get a content hash in their URL so browsers pick up new versions right away
const assetVersion = (file) => createHash("sha1").update(readFileSync(join(ROOT, "public", file))).digest("hex").slice(0, 8);
const CSS_V = assetVersion("style.css");
const JS_V = assetVersion("script.js");

// Illustration for kids without their own photo
const DEFAULT_AVATAR = join(ROOT, "template", "avatar.png");
const AVATAR_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const AUDIO_TYPES = { ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".aac": "audio/aac" };

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const hash = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 8);
const fail = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

// ---------- Read kids ----------
// A new kid only needs a folder with a recording (and optionally one image,
// otherwise template/avatar.png is used), e.g. kids/Huyền My/{IMG_0123.png, Huyền My.m4a}. It is tidied up in place:
// the folder becomes kids/huyen-my/ (its original name is kept as the kid's
// name), the files become avatar.* / audio.*, and kid.json is created.

// The single file of a kind in the folder, renamed to <base>.<ext>;
// `fallback` is used when the folder has none
const claimFile = (dir, label, base, exts, fallback) => {
  const found = readdirSync(dir).filter((f) => exts.includes(extname(f).toLowerCase()));
  if (!found.length && fallback) return fallback;
  if (!found.length) fail(`kids/${label}/: chưa có ${base === "avatar" ? "ảnh" : "file ghi âm"} (${exts.join(" ")})`);
  if (found.length > 1) fail(`kids/${label}/: có ${found.length} file ${base === "avatar" ? "ảnh" : "ghi âm"} (${found.join(", ")}) – chỉ để lại 1 file`);
  const target = base + extname(found[0]).toLowerCase();
  if (found[0] !== target) {
    renameSync(join(dir, found[0]), join(dir, target));
    console.log(`↻ kids/${label}/${found[0]} → ${target}`);
  }
  return join(dir, target);
};

const kids = readdirSync(KIDS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((folder) => {
    let slug = folder;
    if (!isSlug(folder)) {
      slug = slugify(folder);
      if (!slug) fail(`Không đặt được đường dẫn cho thư mục kids/${folder}/ – đổi tên thư mục`);
      if (existsSync(join(KIDS_DIR, slug))) fail(`kids/${folder}/ sẽ thành kids/${slug}/ nhưng thư mục đó đã có`);
      renameSync(join(KIDS_DIR, folder), join(KIDS_DIR, slug));
      console.log(`↻ kids/${folder}/ → kids/${slug}/`);
    }
    const dir = join(KIDS_DIR, slug);
    const avatar = claimFile(dir, slug, "avatar", AVATAR_EXT, DEFAULT_AVATAR);
    const audio = claimFile(dir, slug, "audio", Object.keys(AUDIO_TYPES));
    const jsonPath = join(dir, "kid.json");
    if (!existsSync(jsonPath)) {
      const name = folder === slug ? titleFromSlug(slug) : folder.trim();
      writeFileSync(jsonPath, JSON.stringify({ name, date: "20/10/2026" }, null, 2) + "\n");
      console.log(`✚ Đã tạo kids/${slug}/kid.json – tên "${name}"${folder === slug ? " (sửa lại nếu thiếu dấu)" : ""}`);
    }
    const kid = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (!kid.name?.trim()) fail(`kids/${slug}/kid.json: thiếu "name"`);
    return { slug, dir, avatar, audio, ...kid };
  });

if (!kids.length) fail("Chưa có cháu nào trong thư mục kids/");

// ---------- Transcripts ----------
await transcribeKids(kids, hash);
for (const kid of kids) {
  kid.wish = kid.wish?.trim() || kid.transcript?.text?.trim();
  if (!kid.wish) fail(`kids/${kid.slug}/: chưa có lời chúc – thêm "wish" vào kid.json hoặc "text" vào transcript.json`);
  // [start, end] seconds per word of the wish; without it the page follows the waveform
  kid.timing = alignWish(kid.wish, kid.transcript?.words);
  if (kid.transcript && !kid.timing) console.warn(`⚠ kids/${kid.slug}/: lời chúc khác nhiều so với ghi âm – chữ sẽ chạy theo sóng âm`);
}

// ---------- Remove pages of kids that were deleted ----------
const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : [];
for (const slug of previous) {
  if (!kids.some((k) => k.slug === slug)) {
    rmSync(join(PUBLIC, slug), { recursive: true, force: true });
    console.log(`– Đã xoá trang cũ /${slug}/`);
  }
}

// ---------- Images (avatar WebP + share preview) via headless Chrome ----------
let homeOgHash;
await withChrome(async (page) => {
  await page.viewport(1200, 630);
  await page.goto(pathToFileURL(join(ROOT, "scripts", "og.html")).href);
  for (const kid of kids) {
    const out = join(PUBLIC, kid.slug);
    mkdirSync(out, { recursive: true });
    const src = pathToFileURL(kid.avatar).href;

    const a = await page.eval(`processAvatar(${JSON.stringify(src)})`);
    const avatarBuf = Buffer.from(a.dataUrl.split(",")[1], "base64");
    writeFileSync(join(out, "avatar.webp"), avatarBuf);
    Object.assign(kid, { avatarW: a.width, avatarH: a.height, isPhoto: !a.hasAlpha, avatarHash: hash(avatarBuf) });

    await page.eval(`renderPreview(${JSON.stringify(src)}, ${JSON.stringify(kid.avatarFocus || "50% 30%")})`);
    const og = await page.screenshotJpeg(90);
    writeFileSync(join(out, "og.jpg"), og);
    kid.ogHash = hash(og);
  }

  // Share preview of the home page, from the shared illustration
  await page.eval(`renderPreview(${JSON.stringify(pathToFileURL(DEFAULT_AVATAR).href)}, "50% 30%")`);
  const og = await page.screenshotJpeg(90);
  writeFileSync(join(PUBLIC, "og.jpg"), og);
  homeOgHash = hash(og);
});

// ---------- Pages ----------
const ROBOTS = site.indexable === false ? "noindex, nofollow" : "index, follow, max-image-preview:large";
// "</" is escaped so text can never close the <script> tag
const jsonLdBlock = (data) => JSON.stringify(data, null, 2).replace(/<\//g, "<\\/").replace(/^/gm, "  ");
const fill = (tpl, values) => tpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
  if (!(key in values)) fail(`Template có ô {{${key}}} chưa được điền`);
  return values[key];
});
const wishLines = (kid) => kid.wish.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const audioUrlOf = (kid) => `/${kid.slug}/audio${extname(kid.audio).toLowerCase()}?v=${kid.audioHash}`;
const avatarUrlOf = (kid) => `/${kid.slug}/avatar.webp?v=${kid.avatarHash}`;

const render = (kid, pageUrl) => {
  const lines = wishLines(kid);
  const oneLine = lines.join(" ");
  const audioExt = extname(kid.audio).toLowerCase();
  const audioUrl = audioUrlOf(kid);
  const avatarUrl = avatarUrlOf(kid);
  const ogUrl = `${baseUrl}/${kid.slug}/og.jpg?v=${kid.ogHash}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Lời chúc nhỏ của ${kid.name} gửi mẹ`,
    headline: `Con, ${kid.name}, có một lời chúc nhỏ dành cho mẹ!`,
    description: `Thiệp 20/10 ${kid.name} gửi mẹ kèm lời chúc ghi âm.`,
    inLanguage: "vi",
    url: pageUrl,
    image: ogUrl,
    about: { "@type": "Event", name: "Ngày Phụ nữ Việt Nam 20/10", startDate: "2026-10-20" },
    mainEntity: {
      "@type": "AudioObject",
      name: `Lời chúc 20/10 của ${kid.name} gửi mẹ`,
      contentUrl: baseUrl + audioUrl,
      encodingFormat: AUDIO_TYPES[audioExt],
      inLanguage: "vi",
      transcript: oneLine,
    },
  };

  const values = {
    NAME: esc(kid.name),
    WISH_HTML: lines.map(esc).join("<br>\n        "),
    WISH_ONE_LINE: esc(oneLine),
    WISH_TIMING: kid.timing ? esc(JSON.stringify(kid.timing)) : "",
    DATE: esc(kid.date || "20/10/2026"),
    PAGE_URL: esc(pageUrl),
    OG_IMAGE_URL: esc(ogUrl),
    AVATAR_URL: esc(avatarUrl),
    AVATAR_W: String(kid.avatarW),
    AVATAR_H: String(kid.avatarH),
    AVATAR_FOCUS: esc(kid.avatarFocus || "50% 30%"),
    AUDIO_URL: esc(audioUrl),
    CSS_V,
    JS_V,
    BODY_CLASS: kid.isPhoto ? "kid-photo" : "kid-illustration",
    ROBOTS,
    JSON_LD: jsonLdBlock(jsonLd),
  };
  return fill(template, values);
};

// Home page: a card per kid, sorted by name
const renderHome = () => {
  const sorted = [...kids].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const cards = sorted.map((kid) => `      <li class="kid">
        <span class="kid__avatar"><img src="${esc(avatarUrlOf(kid))}" width="64" height="64" alt="" loading="lazy" style="--focus: ${esc(kid.avatarFocus || "50% 25%")}"></span>
        <div class="kid__body">
          <h2 class="kid__name"><a href="/${kid.slug}/">${esc(kid.name)}</a></h2>
          <p class="kid__wish">“${esc(wishLines(kid).join(" "))}”</p>
        </div>
        <button class="kid__play" type="button" data-src="${esc(audioUrlOf(kid))}" data-name="${esc(kid.name)}" aria-pressed="false" aria-label="Nghe lời chúc của bé ${esc(kid.name)}">
          <svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>
        </button>
      </li>`).join("\n");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Lời chúc nhỏ gửi mẹ",
    description: `${kids.length} lời chúc 20/10 các con ghi âm gửi mẹ.`,
    inLanguage: "vi",
    url: `${baseUrl}/`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: sorted.map((kid, i) => ({ "@type": "ListItem", position: i + 1, name: kid.name, url: `${baseUrl}/${kid.slug}/` })),
    },
  };
  return fill(homeTemplate, {
    COUNT: String(kids.length),
    CARDS: cards,
    PAGE_URL: esc(`${baseUrl}/`),
    OG_IMAGE_URL: esc(`${baseUrl}/og.jpg?v=${homeOgHash}`),
    ROBOTS,
    CSS_V,
    JSON_LD: jsonLdBlock(jsonLd),
  });
};

for (const kid of kids) {
  const out = join(PUBLIC, kid.slug);
  const ext = extname(kid.audio).toLowerCase();
  // Remove a previous recording with a different extension
  for (const e of Object.keys(AUDIO_TYPES)) {
    if (e !== ext) rmSync(join(out, "audio" + e), { force: true });
  }
  copyFileSync(kid.audio, join(out, "audio" + ext));
  kid.audioHash = hash(readFileSync(kid.audio));
  writeFileSync(join(out, "index.html"), render(kid, `${baseUrl}/${kid.slug}/`));
}

writeFileSync(join(PUBLIC, "index.html"), renderHome());

// ---------- Sitemap / robots ----------
const today = new Date().toISOString().slice(0, 10);
if (site.indexable === false) {
  rmSync(join(PUBLIC, "sitemap.xml"), { force: true });
  writeFileSync(join(PUBLIC, "robots.txt"), "User-agent: *\nDisallow: /\n");
} else {
  const urls = ["", ...kids.map((k) => `${k.slug}/`)]
    .map((path) => `  <url>\n    <loc>${baseUrl}/${path}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join("\n");
  writeFileSync(join(PUBLIC, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  writeFileSync(join(PUBLIC, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
}

// ---------- QR codes of the prod links (rebuilt from scratch so deleted kids disappear) ----------
rmSync(QR_DIR, { recursive: true, force: true });
mkdirSync(QR_DIR);
for (const kid of kids) {
  await QRCode.toFile(join(QR_DIR, `${kid.slug}.png`), `${baseUrl}/${kid.slug}/`, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000ff", light: "#00000000" },
  });
}

writeFileSync(MANIFEST, JSON.stringify(kids.map((k) => k.slug), null, 2) + "\n");

console.log(`✔ Đã tạo ${kids.length} trang:`);
for (const k of kids) {
  console.log(`  ${k.name.padEnd(16)} ${baseUrl}/${k.slug}/  (${k.isPhoto ? "ảnh chụp" : "ảnh minh hoạ"})`);
}
console.log(`  Trang chủ  ${baseUrl}/  – danh sách ${kids.length} bé`);
console.log(`  Mã QR      QR/<tên>.png – ${kids.length} file`);
