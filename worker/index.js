// Heart counter API (everything else is served from public/ as static assets):
//   GET  /api/likes          { "<slug>": count, … } for every kid
//   GET  /api/likes/<slug>   { count, liked }  – liked: this visitor's IP gave a heart
//   POST /api/likes/<slug>   { liked: true | false } → { count, liked }
// One heart per IP: the IP (hashed) is the key, so liking twice changes nothing.
import slugs from "../scripts/.generated.json";

const KIDS = new Set(slugs);
const SALT = "loi-chuc-gui-me:likes:";
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

// Salted SHA-256 of the visitor's IP, so the table never holds raw addresses
const ipKey = async (request) => {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + ip));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const state = async (env, slug, ip) => {
  const row = await env.DB.prepare(
    "SELECT count(*) AS count, coalesce(sum(ip = ?2), 0) AS liked FROM likes WHERE slug = ?1",
  ).bind(slug, ip).first();
  return { count: row.count, liked: row.liked > 0 };
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const m = pathname.match(/^\/api\/likes(?:\/([a-z0-9-]+))?\/?$/);
    if (!m) return json({ error: "not found" }, 404);
    const slug = m[1];

    if (!slug) {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      const { results } = await env.DB.prepare("SELECT slug, count(*) AS count FROM likes GROUP BY slug").all();
      return json(Object.fromEntries(results.map((r) => [r.slug, r.count])));
    }
    if (!KIDS.has(slug)) return json({ error: "unknown kid" }, 404);
    const ip = await ipKey(request);

    if (request.method === "GET") return json(await state(env, slug, ip));
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (typeof body.liked !== "boolean") return json({ error: "liked must be true or false" }, 400);
      await env.DB.prepare(body.liked
        ? "INSERT OR IGNORE INTO likes (slug, ip) VALUES (?1, ?2)"
        : "DELETE FROM likes WHERE slug = ?1 AND ip = ?2").bind(slug, ip).run();
      return json(await state(env, slug, ip));
    }
    return json({ error: "method not allowed" }, 405);
  },
};
