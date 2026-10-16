// "Huyền My" → "huyen-my"
export const slugify = (s) => s
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const isSlug = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

// "huyen-my" → "Huyen My" (only a fallback: a slug has lost its diacritics)
export const titleFromSlug = (slug) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
