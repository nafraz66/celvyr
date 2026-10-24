/* Celvyr back office — runs on Cloudflare Pages (free).
   Stores products, page text, settings and photos in Cloudflare KV (binding: DATA).
   Everything that isn't /api/* or /img/* is served from the static site files. */

const JSON_HDR = { "content-type": "application/json; charset=utf-8" };
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...JSON_HDR, "cache-control": "no-store", ...extra } });
const bad = (msg, status = 400) => json({ error: msg }, status);

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randHex = (n = 32) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(saltHex), iterations: 100000 }, key, 256);
  return b64(bits);
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(msg))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const getCookie = (req, name) => {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
};

const SESSION_DAYS = 14;
async function makeSession(env) {
  const secret = await env.DATA.get("auth:secret");
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const token = exp + "." + (await hmac(secret, "session:" + exp));
  return `cv_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}
async function isAuthed(req, env) {
  const tok = getCookie(req, "cv_admin");
  if (!tok) return false;
  const [exp, sig] = tok.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const secret = await env.DATA.get("auth:secret");
  if (!secret) return false;
  return safeEqual(sig, await hmac(secret, "session:" + exp));
}

async function readJSON(env, key, fallback = null) {
  const v = await env.DATA.get(key, "json");
  return v ?? fallback;
}

/* Login rate limit: 8 tries per 15 minutes per IP */
async function tooManyTries(req, env) {
  const ip = req.headers.get("cf-connecting-ip") || "x";
  const key = "rl:" + ip;
  const n = Number((await env.DATA.get(key)) || 0);
  return { n, key, blocked: n >= 8 };
}

const slug = (s) => String(s || "gem").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "gem";

function cleanProduct(p) {
  const num = (v, d = 0) => (v === "" || v == null || isNaN(Number(v)) ? d : Number(v));
  const str = (v, max = 2000) => String(v ?? "").slice(0, max);
  return {
    id: slug(p.id || p.name),
    name: str(p.name, 140) || "Untitled gemstone",
    status: p.status === "draft" ? "draft" : "active",
    available: p.available !== false,
    featured: !!p.featured,
    type: str(p.type, 60),
    shade: str(p.shade, 40),
    ref: str(p.ref, 40),
    carat: num(p.carat),
    cut: str(p.cut, 40),
    cutDetail: str(p.cutDetail, 80),
    price: num(p.price),
    comparePrice: num(p.comparePrice, 0),
    dims: str(p.dims, 80),
    origin: str(p.origin, 80),
    treatment: str(p.treatment, 120),
    lab: str(p.lab, 120),
    tag: str(p.tag, 40),
    line: str(p.line, 300),
    description: str(p.description, 6000),
    note: str(p.note, 80),
    noteText: str(p.noteText, 400),
    colours: Array.isArray(p.colours) && p.colours.length === 4 ? p.colours.map((c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#2437B8")) : ["#141E63", "#2437B8", "#4A63E0", "#8EA2F2"],
    images: Array.isArray(p.images) ? p.images.filter((k) => /^[a-z0-9-]+$/i.test(k)).slice(0, 12) : [],
    seoTitle: str(p.seoTitle, 120),
    seoDesc: str(p.seoDesc, 320),
    updatedAt: Date.now(),
  };
}

async function api(req, env, url) {
  const path = url.pathname;
  const method = req.method;

  /* ---------- public ---------- */
  if (path === "/api/store" && method === "GET") {
    const [products, settings, content] = await Promise.all([
      readJSON(env, "products"), readJSON(env, "settings", {}), readJSON(env, "content", {}),
    ]);
    return json(
      { products: products ? products.filter((p) => p.status !== "draft") : null, settings, content },
      200, { "cache-control": "public, max-age=15" });
  }

  /* ---------- auth ---------- */
  if (path === "/api/admin/status" && method === "GET") {
    const hasPassword = !!(await env.DATA.get("auth:hash"));
    return json({ setup: hasPassword, authed: hasPassword && (await isAuthed(req, env)) });
  }
  if (path === "/api/admin/setup" && method === "POST") {
    if (await env.DATA.get("auth:hash")) return bad("Admin password already set", 403);
    const { password } = await req.json().catch(() => ({}));
    if (!password || String(password).length < 10) return bad("Use at least 10 characters");
    const salt = randHex(16);
    await env.DATA.put("auth:salt", salt);
    await env.DATA.put("auth:hash", await hashPassword(String(password), salt));
    await env.DATA.put("auth:secret", randHex(32));
    return json({ ok: true }, 200, { "set-cookie": await makeSession(env) });
  }
  if (path === "/api/admin/login" && method === "POST") {
    const rl = await tooManyTries(req, env);
    if (rl.blocked) return bad("Too many attempts. Try again in 15 minutes.", 429);
    const { password } = await req.json().catch(() => ({}));
    const [salt, hash] = await Promise.all([env.DATA.get("auth:salt"), env.DATA.get("auth:hash")]);
    if (!hash) return bad("Admin not set up yet", 403);
    if (!password || !safeEqual(await hashPassword(String(password), salt), hash)) {
      await env.DATA.put(rl.key, String(rl.n + 1), { expirationTtl: 900 });
      return bad("Wrong password", 401);
    }
    return json({ ok: true }, 200, { "set-cookie": await makeSession(env) });
  }
  if (path === "/api/admin/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "cv_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
  }

  /* ---------- everything below needs login ---------- */
  if (!path.startsWith("/api/admin/")) return bad("Not found", 404);
  if (!(await isAuthed(req, env))) return bad("Please log in", 401);
  // simple CSRF guard: admin writes must come from this site
  if (method !== "GET") {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== url.host) return bad("Bad origin", 403);
  }

  if (path === "/api/admin/data" && method === "GET") {
    const [products, settings, content] = await Promise.all([
      readJSON(env, "products"), readJSON(env, "settings", {}), readJSON(env, "content", {}),
    ]);
    return json({ products, settings, content });
  }

  if (path === "/api/admin/products" && method === "PUT") {
    // replace the whole list (used for seeding, reordering)
    const list = await req.json();
    if (!Array.isArray(list)) return bad("Expected a list");
    const clean = list.map(cleanProduct);
    await env.DATA.put("products", JSON.stringify(clean));
    return json({ ok: true, products: clean });
  }

  const pm = path.match(/^\/api\/admin\/products\/([a-z0-9-]+)$/);
  if (pm || (path === "/api/admin/products" && method === "POST")) {
    const list = (await readJSON(env, "products", [])) || [];
    if (method === "POST") {
      const p = cleanProduct(await req.json());
      let id = p.id, i = 2;
      while (list.some((x) => x.id === id)) id = `${p.id}-${i++}`;
      p.id = id;
      list.unshift(p);
      await env.DATA.put("products", JSON.stringify(list));
      return json({ ok: true, product: p });
    }
    const idx = list.findIndex((x) => x.id === pm[1]);
    if (idx < 0) return bad("Product not found", 404);
    if (method === "PUT") {
      const body = await req.json();
      const p = cleanProduct({ ...list[idx], ...body, id: list[idx].id });
      list[idx] = p;
      await env.DATA.put("products", JSON.stringify(list));
      return json({ ok: true, product: p });
    }
    if (method === "DELETE") {
      const [gone] = list.splice(idx, 1);
      await env.DATA.put("products", JSON.stringify(list));
      await Promise.all((gone.images || []).map((k) => env.DATA.delete("img:" + k)));
      return json({ ok: true });
    }
  }

  if (path === "/api/admin/settings" && method === "PUT") {
    const s = await req.json();
    const clean = {
      whatsapp: String(s.whatsapp || "").replace(/\D/g, "").slice(0, 15),
      email: String(s.email || "").slice(0, 120),
      usdRate: Number(s.usdRate) > 0 ? Number(s.usdRate) : 300,
      announcement: String(s.announcement || "").slice(0, 160),
      footerTagline: String(s.footerTagline || "").slice(0, 300),
      bankAccountName: String(s.bankAccountName || "").slice(0, 80),
      bankAccountNumber: String(s.bankAccountNumber || "").slice(0, 40),
      bankName: String(s.bankName || "").slice(0, 80),
      bankBranch: String(s.bankBranch || "").slice(0, 80),
      paymentNote: String(s.paymentNote || "").slice(0, 400),
    };
    await env.DATA.put("settings", JSON.stringify(clean));
    return json({ ok: true, settings: clean });
  }

  if (path === "/api/admin/content" && method === "PUT") {
    const c = await req.json();
    if (typeof c !== "object" || Array.isArray(c)) return bad("Expected an object");
    const clean = {};
    for (const [k, v] of Object.entries(c)) {
      if (/^[a-z0-9._-]{1,80}$/i.test(k) && typeof v === "string") clean[k] = v.slice(0, 4000);
    }
    await env.DATA.put("content", JSON.stringify(clean));
    return json({ ok: true, content: clean });
  }

  if (path === "/api/admin/upload" && method === "POST") {
    const type = req.headers.get("content-type") || "";
    if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(type)) return bad("Only images please");
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return bad("Image too large (max 8 MB)");
    const key = Date.now().toString(36) + "-" + randHex(4);
    await env.DATA.put("img:" + key, buf, { metadata: { type } });
    return json({ ok: true, key, url: "/img/" + key });
  }
  const im = path.match(/^\/api\/admin\/img\/([a-z0-9-]+)$/i);
  if (im && method === "DELETE") {
    await env.DATA.delete("img:" + im[1]);
    return json({ ok: true });
  }

  if (path === "/api/admin/password" && method === "POST") {
    const { current, next } = await req.json().catch(() => ({}));
    const [salt, hash] = await Promise.all([env.DATA.get("auth:salt"), env.DATA.get("auth:hash")]);
    if (!current || !safeEqual(await hashPassword(String(current), salt), hash)) return bad("Current password is wrong", 401);
    if (!next || String(next).length < 10) return bad("Use at least 10 characters");
    const ns = randHex(16);
    await env.DATA.put("auth:salt", ns);
    await env.DATA.put("auth:hash", await hashPassword(String(next), ns));
    await env.DATA.put("auth:secret", randHex(32)); // signs out every other device
    return json({ ok: true }, 200, { "set-cookie": await makeSession(env) });
  }

  return bad("Not found", 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/img/")) {
        const key = url.pathname.slice(5);
        if (!/^[a-z0-9-]+$/i.test(key) || !env.DATA) return new Response("Not found", { status: 404 });
        const { value, metadata } = await env.DATA.getWithMetadata("img:" + key, "arrayBuffer");
        if (!value) return new Response("Not found", { status: 404 });
        return new Response(value, {
          headers: { "content-type": metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
        });
      }
      if (url.pathname.startsWith("/api/")) {
        if (!env.DATA) return bad("Storage not connected yet", 503);
        return await api(req, env, url);
      }
    } catch (e) {
      return bad("Something went wrong: " + (e && e.message ? e.message : "unknown"), 500);
    }
    const res = await env.ASSETS.fetch(req);
    if (url.pathname.startsWith("/admin")) {
      const h = new Headers(res.headers);
      h.set("x-robots-tag", "noindex, nofollow");
      h.set("cache-control", "no-store");
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
};
