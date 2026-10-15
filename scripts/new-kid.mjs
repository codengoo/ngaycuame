// Scaffold a new kid:  npm run new-kid -- "Minh Anh"   (optional 2nd arg: slug)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [name, slugArg] = process.argv.slice(2);
if (!name) {
  console.error('Cách dùng: npm run new-kid -- "Tên bé" [duong-dan]');
  process.exit(1);
}

const slugify = (s) => s
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const slug = slugArg ? slugify(slugArg) : slugify(name);
const dir = join(ROOT, "kids", slug);
if (existsSync(dir)) {
  console.error(`Đã có thư mục kids/${slug}/`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "kid.json"), JSON.stringify({
  name,
  wish: "Mẹ ơi, con chúc mẹ 20/10 luôn vui vẻ và xinh đẹp!\nCon yêu mẹ nhiều lắm ạ!",
  date: "20/10/2026",
}, null, 2) + "\n");

console.log(`✔ Đã tạo kids/${slug}/kid.json
Tiếp theo:
  1. Sửa "wish" (lời chúc, xuống dòng bằng \\n) trong kids/${slug}/kid.json
  2. Chép ảnh vào  kids/${slug}/avatar.png  (hoặc .jpg / .webp)
  3. Chép ghi âm   kids/${slug}/audio.m4a   (hoặc .mp3 / .wav)
  4. npm run build   → trang: /${slug}/`);
