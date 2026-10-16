// Guesses whether a kid is a boy or a girl from a Vietnamese name ("Minh Huy",
// "Huyền My", "Nguyễn Thị Lan"…). The given name (last word) weighs most, the
// middle names add a hint. Only a first guess: the build writes it into kid.json
// as "gender", where it can be corrected.
//
//   guessGender("Hoàng Yến") → { gender: "nữ", sure: true }

// Weight per word: > 0 girl, < 0 boy; ±1 leans, ±2 clear. Unisex names are left out.
const GIVEN = {
  // girls
  yến: 2, my: 2, mỹ: 2, linh: 2, lan: 2, hoa: 2, hương: 2, thảo: 2, trang: 2, nhung: 2, hà: 1, hằng: 2,
  hạnh: 2, huyền: 2, mai: 2, vy: 2, vi: 2, nhi: 2, ngân: 2, trâm: 2, quỳnh: 2, thư: 2, uyên: 2, châu: 1,
  diệp: 2, hiền: 2, thủy: 2, thuỷ: 2, nga: 2, loan: 2, phương: 2, thu: 1, như: 2, ly: 2, na: 2, hân: 2,
  san: 2, chi: 2, oanh: 2, liên: 2, nguyệt: 2, tiên: 2, yên: 1, nhàn: 2, dung: 2, kiều: 2, lam: 1, ánh: 2,
  duyên: 2, hồng: 2, trinh: 2, thùy: 2, thuỳ: 2, khuê: 2, nhã: 1, thơ: 2, ngọc: 1, diệu: 2, giao: 1, đào: 2,
  hoài: 1, xuân: 1, trà: 2, quyên: 2, thi: 2, ngoan: 2, mơ: 2, nhiên: 1, an: 1,
  // boys
  đức: -2, khoa: -2, trường: -2, huy: -2, trí: -2, phát: -2, minh: -1, lâm: -1, hùng: -2, dũng: -2,
  cường: -2, tuấn: -2, nam: -2, long: -2, hải: -1, sơn: -2, quân: -2, khang: -2, khôi: -2, kiên: -2,
  phúc: -1, thắng: -2, thành: -2, tùng: -2, việt: -2, vinh: -2, hiếu: -2, hưng: -2, hoàng: -1, duy: -2,
  đạt: -2, hào: -2, phong: -2, quang: -2, tài: -2, thiện: -2, toàn: -2, trung: -2, nhân: -1, nghĩa: -2,
  lộc: -2, lợi: -2, luân: -2, kha: -2, khải: -2, bình: -1, công: -2, danh: -2, định: -2, đông: -2,
  hậu: -2, hiệp: -2, hòa: -1, hoà: -1, khiêm: -2, mạnh: -2, nguyên: -1, phú: -2, quốc: -2, quý: -1,
  tiến: -2, thái: -2, thịnh: -2, thông: -2, tín: -2, triết: -2, văn: -2, vũ: -2, vương: -2, hiển: -2,
  hữu: -2, kiệt: -2, lực: -2, sang: -2, tấn: -2, thuận: -2, trọng: -2, bách: -2, đăng: -2, khánh: -1,
  khiết: 1, tú: -1, tâm: 0, bảo: -1, khoái: -2, nhật: -1, gia: 0, anh: 0, tuệ: 0,
};
// Middle names that hint at a gender
const MIDDLE = {
  thị: 3, ngọc: 1, thùy: 2, thuỳ: 2, mai: 2, huyền: 2, phương: 2, diệu: 2, kim: 1, hồng: 2, thu: 1, mỹ: 2, quỳnh: 2,
  văn: -3, đức: -2, mạnh: -2, tấn: -2, hữu: -2, quang: -2, minh: -1, nhật: -1, công: -2, quốc: -2, trọng: -2, việt: -1,
};

export function guessGender(name) {
  const words = name.trim().toLowerCase().normalize("NFC").split(/\s+/).filter(Boolean);
  const given = words.at(-1) ?? "";
  const score = 2 * (GIVEN[given] ?? 0) + words.slice(0, -1).reduce((s, w) => s + (MIDDLE[w] ?? (GIVEN[w] ?? 0) / 2), 0);
  return { gender: score > 0 ? "nữ" : "nam", sure: Math.abs(score) >= 3 };
}
