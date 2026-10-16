// Builds one greeting page per kid.
//
//   kids/<slug>/kid.json      { "name", "wish", "date"?, "avatarFocus"? }
//   kids/<slug>/avatar.*      png / jpg / jpeg / webp
//   kids/<slug>/audio.*       m4a / mp3 / wav / ogg / aac
//
// Output (all under public/, served as static assets):
//   public/<slug>/index.html, avatar.webp, og.jpg, audio.<ext>
//   public/index.html         = the default kid from site.json
//   public/sitemap.xml, public/robots.txt
//
// Needs a local Chrome/Edge (set CHROME_PATH if it isn't found).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withChrome } from "./chrome.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIDS_DIR = join(ROOT, "kids");
const PUBLIC = join(ROOT, "public");
const MANIFEST = join(ROOT, "scripts", ".generated.json");

const site = JSON.parse(readFileSync(join(ROOT, "site.json"), "utf8"));
const baseUrl = site.baseUrl.replace(/\/+$/, "");
const template = readFileSync(join(ROOT, "template", "index.html"), "utf8");
// Shared CSS/JS get a content hash in their URL so browsers pick up new versions right away
const assetVersion = (file) => createHash("sha1").update(readFileSync(join(ROOT, "public", file))).digest("hex").slice(0, 8);
const CSS_V = assetVersion("style.css");
const JS_V = assetVersion("script.js");

const AVATAR_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const AUDIO_TYPES = { ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".aac": "audio/aac" };

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const hash = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 8);
const findFile = (dir, base, exts) => exts.map((e) => join(dir, base + e)).find((p) => existsSync(p));
const fail = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

// ---------- Read kids ----------
const kids = readdirSync(KIDS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((slug) => {
    const dir = join(KIDS_DIR, slug);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`Tên thư mục "${slug}" chỉ được dùng chữ thường không dấu, số và dấu gạch ngang.`);
    const jsonPath = join(dir, "kid.json");
    if (!existsSync(jsonPath)) fail(`Thiếu kids/${slug}/kid.json`);
    const kid = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (!kid.name?.trim()) fail(`kids/${slug}/kid.json: thiếu "name"`);
    if (!kid.wish?.trim()) fail(`kids/${slug}/kid.json: thiếu "wish" (lời chúc)`);
    const avatar = findFile(dir, "avatar", AVATAR_EXT) || fail(`Thiếu ảnh kids/${slug}/avatar.(png|jpg|webp)`);
    const audio = findFile(dir, "audio", Object.keys(AUDIO_TYPES)) || fail(`Thiếu file ghi âm kids/${slug}/audio.(m4a|mp3|wav|ogg|aac)`);
    return { slug, dir, avatar, audio, ...kid };
  });

if (!kids.length) fail("Chưa có cháu nào trong thư mục kids/");
const defaultKid = kids.find((k) => k.slug === site.defaultKid) || kids[0];

// ---------- Remove pages of kids that were deleted ----------
const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : [];
for (const slug of previous) {
  if (!kids.some((k) => k.slug === slug)) {
    rmSync(join(PUBLIC, slug), { recursive: true, force: true });
    console.log(`– Đã xoá trang cũ /${slug}/`);
  }
}

// ---------- Images (avatar WebP + share preview) via headless Chrome ----------
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
});

// ---------- Pages ----------
const render = (kid, pageUrl) => {
  const lines = kid.wish.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const oneLine = lines.join(" ");
  const audioExt = extname(kid.audio).toLowerCase();
  const audioUrl = `/${kid.slug}/audio${audioExt}?v=${kid.audioHash}`;
  const avatarUrl = `/${kid.slug}/avatar.webp?v=${kid.avatarHash}`;
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
    ROBOTS: site.indexable === false ? "noindex, nofollow" : "index, follow, max-image-preview:large",
    // "</" is escaped so a wish can never close the <script> tag
    JSON_LD: JSON.stringify(jsonLd, null, 2).replace(/<\//g, "<\\/").replace(/^/gm, "  "),
  };

  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
    if (!(key in values)) fail(`Template có ô {{${key}}} chưa được điền`);
    return values[key];
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

// The site root shows the default kid; its canonical URL is that kid's page
writeFileSync(join(PUBLIC, "index.html"), render(defaultKid, `${baseUrl}/${defaultKid.slug}/`));

// ---------- Sitemap / robots ----------
const today = new Date().toISOString().slice(0, 10);
if (site.indexable === false) {
  rmSync(join(PUBLIC, "sitemap.xml"), { force: true });
  writeFileSync(join(PUBLIC, "robots.txt"), "User-agent: *\nDisallow: /\n");
} else {
  const urls = kids.map((k) => `  <url>\n    <loc>${baseUrl}/${k.slug}/</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join("\n");
  writeFileSync(join(PUBLIC, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  writeFileSync(join(PUBLIC, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
}

writeFileSync(MANIFEST, JSON.stringify(kids.map((k) => k.slug), null, 2) + "\n");

console.log(`✔ Đã tạo ${kids.length} trang:`);
for (const k of kids) {
  console.log(`  ${k.name.padEnd(16)} ${baseUrl}/${k.slug}/  (${k.isPhoto ? "ảnh chụp" : "ảnh minh hoạ"})`);
}
console.log(`  Trang chủ / hiển thị: ${defaultKid.name}`);
