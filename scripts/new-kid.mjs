// Scaffold a new kid:  npm run new-kid -- "Minh Anh"   (optional 2nd arg: slug)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "./slug.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [name, slugArg] = process.argv.slice(2);
if (!name) {
  console.error('Cách dùng: npm run new-kid -- "Tên bé" [duong-dan]');
  process.exit(1);
}

const slug = slugArg ? slugify(slugArg) : slugify(name);
const dir = join(ROOT, "kids", slug);
if (existsSync(dir)) {
  console.error(`Đã có thư mục kids/${slug}/`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "kid.json"), JSON.stringify({
  name,
  date: "20/10/2026",
}, null, 2) + "\n");

console.log(`✔ Đã tạo kids/${slug}/kid.json
Tiếp theo:
  1. Chép ảnh vào  kids/${slug}/avatar.png  (hoặc .jpg / .webp)
  2. Chép ghi âm   kids/${slug}/audio.m4a   (hoặc .mp3 / .wav)
  3. npm run build   → trang: /${slug}/
     Lời chúc được tự chuyển từ ghi âm vào kids/${slug}/transcript.json –
     đọc lại và sửa "text" nếu sai (hoặc ghi "wish" trong kid.json để dùng bản gõ tay).`);
