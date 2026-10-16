// Renders a kid's 9:16 wish video (public/<slug>/video.mp4): scripts/video.html
// draws each frame for an exact time t in headless Chrome, ffmpeg joins the
// frames with the recording and background music: template/music.* when there is
// one, otherwise a soft tune composed in video.html.
//
// `npm run build` renders the videos that are missing or out of date; to force one:
//   node scripts/video.mjs <slug>     (run `npm run build` first)
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;
const LEAD = 0.7; // s before the recording starts (intro)
const OUTRO = 2.6; // s after it ends (QR card)
const BARS = 56;
const VOICE_LUFS = -16; // target loudness of the voice (and of a music file)
const MUSIC_FILE = ["mp3", "m4a", "wav", "ogg"].map((e) => join(ROOT, "template", `music.${e}`)).find(existsSync);
// Files that shape every video: a change in any of them re-renders all of them
export const VIDEO_SOURCES = [join(ROOT, "scripts", "video.html"), fileURLToPath(import.meta.url), MUSIC_FILE].filter(Boolean);

// Music volume over the video: playing from the first frame, low under the voice, swelling for the
// QR card, faded out at the end. Levels differ for the composed tune and a music file.
const envelope = ({ total, voiceStart, voiceEnd, outroAt }, { low, mid, high }) => [
  [0, 0], [0.05, mid], [voiceStart - 0.2, mid], [voiceStart + 0.2, low],
  [voiceEnd, low], [outroAt + 0.4, high], [total - 1.0, high], [total, 0],
];
// The same curve as an ffmpeg expression in t (piecewise linear)
const envelopeExpr = (pts) => pts.slice(0, -1).reduceRight((rest, [t0, v0], i) => {
  const [t1, v1] = pts[i + 1];
  const seg = t1 > t0 ? `${v0}+(${v1 - v0})*(t-${t0})/${t1 - t0}` : `${v1}`;
  return `if(lt(t,${t1}),${seg},${rest})`;
}, String(pts[pts.length - 1][1]));

// Integrated loudness (LUFS) of an audio file
const loudness = (file) => new Promise((resolve, reject) => {
  const p = spawn(ffmpegPath, ["-hide_banner", "-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
  let err = "";
  p.stderr.on("data", (d) => (err += d));
  p.on("error", reject);
  p.on("close", () => {
    const m = err.match(/"input_i"\s*:\s*"(-?[\d.]+|-inf)"/);
    resolve(m && m[1] !== "-inf" ? Number(m[1]) : VOICE_LUFS);
  });
});

// kid: { slug, name, lines: [[word…]…], timing, audio (path), avatar (path), qr (path), url }
export async function renderVideo(page, kid, out) {
  await page.viewport(1080, 1920);
  await page.goto(pathToFileURL(join(ROOT, "scripts", "video.html")).href);
  const audioB64 = readFileSync(kid.audio).toString("base64");
  const { duration, peaks } = await page.eval(`audioPeaks(${JSON.stringify(audioB64)}, ${BARS})`);
  await page.eval(`setup(${JSON.stringify({
    name: kid.name, lines: kid.lines, timing: kid.timing, peaks, duration, lead: LEAD, isPhoto: kid.isPhoto,
    avatar: pathToFileURL(kid.avatar).href, qr: pathToFileURL(kid.qr).href, url: kid.url.replace(/^https?:\/\//, ""),
  })})`);

  const total = LEAD + duration + OUTRO;
  const tmp = mkdtempSync(join(tmpdir(), "loichuc-video-"));
  const times = { total, voiceStart: LEAD, voiceEnd: LEAD + duration, outroAt: LEAD + duration + 0.25 };
  // Composed tune, or just the QR chime when a music file is used
  const tune = join(tmp, "tune.wav");
  writeFileSync(tune, Buffer.from(await page.eval(`renderMusic(${JSON.stringify({
    total, outroAt: times.outroAt, tune: !MUSIC_FILE,
    envelope: envelope(times, { low: 0.2, mid: 0.45, high: 0.9 }),
  })})`), "base64"));
  const fileGain = MUSIC_FILE ? VOICE_LUFS - (await loudness(MUSIC_FILE)) : 0;

  // Voice brought to the same loudness for every kid with one fixed gain (a dynamic
  // normaliser would also pump up the breaths and room noise between words)
  const gain = Math.min(12, Math.max(-10, VOICE_LUFS - (await loudness(kid.audio))));
  const ff = spawn(ffmpegPath, [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-i", kid.audio,
    "-i", tune,
    ...(MUSIC_FILE ? ["-stream_loop", "-1", "-i", MUSIC_FILE] : []),
    "-filter_complex",
    `[1:a]volume=${gain.toFixed(2)}dB,aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(LEAD * 1000)}:all=1,apad[v];` +
    `[2:a]aformat=channel_layouts=stereo[m];` +
    (MUSIC_FILE
      ? `[3:a]silenceremove=start_periods=1:start_threshold=-50dB,volume=${fileGain.toFixed(2)}dB,aresample=44100,aformat=channel_layouts=stereo,` +
        `volume='${envelopeExpr(envelope(times, { low: 0.1, mid: 0.4, high: 0.75 }))}':eval=frame[f];` +
        `[v][m][f]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.9[a]`
      : `[v][m]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9[a]`),
    "-map", "0:v", "-map", "[a]", "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg thoát với mã ${code}`))));
  }).finally(() => rmSync(tmp, { recursive: true, force: true }));

  const frames = Math.ceil(total * FPS);
  for (let i = 0; i < frames; i++) {
    await page.eval(`renderFrame(${i / FPS})`);
    const jpg = await page.screenshotJpeg(92);
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  return { duration: total, frames };
}

// ---------- CLI: one kid ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const slug = process.argv[2];
  if (!slug) { console.error("Cách dùng: node scripts/video.mjs <slug>"); process.exit(1); }
  const { withChrome } = await import("./chrome.mjs");
  const { alignWish } = await import("./transcribe.mjs");
  const site = JSON.parse(readFileSync(join(ROOT, "site.json"), "utf8"));
  const dir = join(ROOT, "kids", slug);
  const kidJson = JSON.parse(readFileSync(join(dir, "kid.json"), "utf8"));
  const transcript = existsSync(join(dir, "transcript.json")) ? JSON.parse(readFileSync(join(dir, "transcript.json"), "utf8")) : null;
  const wish = kidJson.wish?.trim() || transcript?.text?.trim();
  const audio = join(dir, readdirSync(dir).find((f) => f.startsWith("audio.")));
  const avatar = join(ROOT, "public", slug, "avatar.webp");
  const qr = join(ROOT, "QR", `${slug}.png`);
  if (!existsSync(avatar) || !existsSync(qr)) { console.error("Chưa có avatar/QR – chạy npm run build trước"); process.exit(1); }
  const html = readFileSync(join(ROOT, "public", slug, "index.html"), "utf8");

  const out = join(ROOT, "public", slug, "video.mp4");
  const t0 = Date.now();
  await withChrome(async (page) => {
    const r = await renderVideo(page, {
      slug, name: kidJson.name, audio, avatar, qr,
      lines: wish.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/)),
      timing: alignWish(wish, transcript?.words),
      isPhoto: html.includes('class="kid-photo"'),
      url: `${site.baseUrl.replace(/\/+$/, "")}/${slug}/`,
    }, out);
    console.log(`✔ ${out} – ${r.duration.toFixed(1)}s, ${r.frames} khung hình, ${((Date.now() - t0) / 1000).toFixed(1)}s render`);
  });
}
