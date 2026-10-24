/* Celvyr admin — Shopify-style back office */
(function () {
  const app = document.getElementById("app");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => "LKR " + Number(n || 0).toLocaleString("en-US");

  const PAGES = [
    ["index.html", "Home", "home"],
    ["gemstones.html", "Gemstones (collection)", "gemstones"],
    ["story.html", "Our story", "story"],
    ["contact.html", "Contact", "contact"],
    ["bag.html", "Shopping bag", "bag"],
    ["checkout.html", "Reserve / checkout", "checkout"],
    ["gem.html?id=ceylon-blue-sapphire", "Product page (text shared by all gems)", "gem"],
  ];
  const TYPES = ["Sapphire", "Spinel", "Tourmaline", "Ruby", "Garnet", "Topaz", "Aquamarine", "Chrysoberyl", "Moonstone", "Zircon", "Other"];
  const SHADES = ["Blue", "Pink", "Yellow", "Green", "Purple", "Orange", "Red", "White", "Teal", "Multi"];
  const CUTS = ["Oval", "Round", "Cushion", "Emerald", "Pear", "Heart", "Princess", "Marquise", "Trillion", "Cabochon"];

  let state = { products: [], settings: {}, content: {} };
  let dirty = null; // { save: fn, discard: fn }

  /* ---------- API ---------- */
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: opts.raw ? { "content-type": opts.type } : { "content-type": "application/json" },
      body: opts.raw ? opts.raw : opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && !path.includes("login") && !path.includes("password")) { showLogin(); throw new Error("Please log in"); }
    if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
    return data;
  }

  function toast(msg, err) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("on");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), 2600);
  }

  /* ---------- gem drawing (same as storefront) ---------- */
  function rand(seed) { let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function gemSVG(g) {
    const r = rand(g.id || "x"), [deep, base, light, hi] = g.colours || ["#141E63", "#2437B8", "#4A63E0", "#8EA2F2"];
    const N = 16, step = (Math.PI * 2) / N, rx = g.cut === "Oval" ? 0.93 : 1;
    const P = (rad, a) => [100 + Math.cos(a) * 90 * rad * rx, 100 + Math.sin(a) * 90 * rad];
    const outer = [...Array(N)].map((_, i) => P(1, i * step - Math.PI / 2)), mid = [...Array(N)].map((_, i) => P(0.64, (i + 0.5) * step - Math.PI / 2)), inner = [...Array(8)].map((_, k) => P(0.32, k * 2 * step - Math.PI / 2));
    const c = [100, 100], tris = [];
    for (let k = 0; k < 8; k++) { tris.push([c, inner[k], inner[(k + 1) % 8]], [inner[k], mid[(2 * k + N - 1) % N], mid[2 * k]], [inner[k], mid[2 * k], mid[2 * k + 1]], [inner[k], inner[(k + 1) % 8], mid[2 * k + 1]]); }
    for (let i = 0; i < N; i++) tris.push([outer[i], outer[(i + 1) % N], mid[i]], [mid[i], mid[(i + 1) % N], outer[(i + 1) % N]]);
    const pal = [deep, deep, base, base, base, light, light, hi];
    return `<svg viewBox="0 0 200 200">${tris.map((t) => { const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3; let i = Math.max(0, Math.min(7, Math.floor(r() * 8 + ((200 - cx - cy) / 200) * 2.2))); return `<polygon points="${t.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="${pal[i]}" stroke="${pal[i]}" stroke-width=".6"/>`; }).join("")}</svg>`;
  }
  const thumb = (p) => (p.images && p.images[0] ? `<img src="/img/${esc(p.images[0])}" alt="">` : gemSVG(p));

  /* ---------- icons ---------- */
  const I = {
    home: '<svg viewBox="0 0 20 20"><path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1V9.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    tag: '<svg viewBox="0 0 20 20"><path d="M3 3h7l7 7-7 7-7-7V3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/></svg>',
    page: '<svg viewBox="0 0 20 20"><path d="M5 2.5h7l3.5 3.5v11.5h-10.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.5 9.5h5M7.5 12.5h5" stroke="currentColor" stroke-width="1.5"/></svg>',
    gear: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 20 20"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    back: '<svg viewBox="0 0 20 20" width="18"><path d="M12 4 6 10l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="5.5" fill="none" stroke="#fff" stroke-width="1.6"/><path d="m13 13 4 4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    out: '<svg viewBox="0 0 20 20"><path d="M8 4H4v12h4M12 6l4 4-4 4M16 10H8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    upload: '<svg viewBox="0 0 20 20" width="22"><path d="M10 13V4M6 8l4-4 4 4M4 14v2h12v-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ---------- auth screens ---------- */
  function authScreen({ title, sub, button, setup }) {
    app.innerHTML = `<div class="auth"><form class="box" autocomplete="on">
      <img src="assets/logo-wordmark.webp" alt="Celvyr Gems">
      <h1>${title}</h1><p>${sub}</p>
      <div class="err" id="err"></div>
      <div class="f"><label for="pw">${setup ? "Create a password" : "Password"}</label>
        <div class="pw"><input type="password" id="pw" required minlength="${setup ? 10 : 1}" autocomplete="${setup ? "new-password" : "current-password"}"><button type="button" id="show">Show</button></div></div>
      ${setup ? `<div class="f"><label for="pw2">Type it again</label><input type="password" id="pw2" required autocomplete="new-password"></div><p class="hint" style="text-align:left;margin:0 0 8px">At least 10 characters. Only you will know it.</p>` : ""}
      <button class="btn primary" type="submit">${button}</button>
    </form></div>`;
    $("#show").onclick = () => { const i = $("#pw"); i.type = i.type === "password" ? "text" : "password"; $("#show").textContent = i.type === "password" ? "Show" : "Hide"; };
    $("form").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("#err"); err.classList.remove("on");
      const pw = $("#pw").value;
      if (setup && pw !== $("#pw2").value) { err.textContent = "The two passwords don't match."; err.classList.add("on"); return; }
      try {
        await api(setup ? "/api/admin/setup" : "/api/admin/login", { method: "POST", body: { password: pw } });
        start();
      } catch (x) { err.textContent = x.message; err.classList.add("on"); }
    };
    $("#pw").focus();
  }
  const showLogin = () => authScreen({ title: "Log in", sub: "Celvyr store admin", button: "Log in" });

  /* ---------- shell ---------- */
  function shell(active, inner) {
    const nav = (href, icon, label, key, sub) => `<a href="${href}" class="${active === key ? "on" : ""} ${sub ? "sub" : ""}">${sub ? "" : I[icon]}${label}</a>`;
    app.innerHTML = `
      <div class="savebar" id="savebar"><div class="msg">Unsaved changes<span>&nbsp;</span></div><div class="acts"><button class="btn ghost" id="discard">Discard</button><button class="btn go" id="save">Save</button></div></div>
      <div class="top">
        <button class="menu-btn" id="menuBtn" aria-label="Menu">☰</button>
        <a class="brand" href="#/"><img src="assets/logo-emblem.webp" alt="">Celvyr</a>
        <div class="search">${I.search}<input id="q" placeholder="Search gemstones" autocomplete="off"></div>
        <div class="who"><div class="avatar">IA</div><span class="hide-m">Inthikaf</span></div>
      </div>
      <div class="shell">
        <aside class="side" id="side">
          ${nav("#/", "home", "Home", "home")}
          ${nav("#/products", "tag", "Products", "products")}
          ${active.startsWith("products") ? nav("#/products/new", "", "Add product", "products-new", true) : ""}
          ${nav("#/pages", "page", "Online store pages", "pages")}
          ${nav("#/settings", "gear", "Settings", "settings")}
          <div class="sep"></div>
          <div class="label">Sales channels</div>
          <a href="/" target="_blank" rel="noopener">${I.eye}View your store ↗</a>
          <a href="#" id="logout">${I.out}Log out</a>
        </aside>
        <main class="main">${inner}</main>
      </div>`;
    $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
    $("#logout").onclick = async (e) => { e.preventDefault(); await api("/api/admin/logout", { method: "POST" }); showLogin(); };
    $("#q").onkeydown = (e) => { if (e.key === "Enter") location.hash = "#/products?q=" + encodeURIComponent(e.target.value); };
    $("#discard").onclick = () => dirty && dirty.discard();
    $("#save").onclick = () => dirty && dirty.save();
  }
  function setDirty(on, handlers) {
    dirty = on ? handlers : null;
    const bar = $("#savebar"); if (bar) bar.classList.toggle("on", !!on);
  }

  /* ---------- views ---------- */
  function viewHome() {
    const ps = state.products;
    const active = ps.filter((p) => p.status === "active").length, drafts = ps.length - active;
    const sold = ps.filter((p) => !p.available).length;
    const value = ps.filter((p) => p.status === "active" && p.available).reduce((s, p) => s + Number(p.price || 0), 0);
    shell("home", `<div class="page">
      <div class="ph"><h1>Welcome back, Inthikaf</h1></div>
      <div class="stats">
        <div class="stat"><small>Live gemstones</small><b>${active}</b></div>
        <div class="stat"><small>Drafts</small><b>${drafts}</b></div>
        <div class="stat"><small>Sold</small><b>${sold}</b></div>
        <div class="stat"><small>Stock value (listed)</small><b style="font-size:18px">${fmt(value)}</b></div>
      </div>
      <div class="quick">
        <a href="#/products/new"><b>Add a gemstone</b><span>Photos, price, carat, cut and story.</span></a>
        <a href="#/products"><b>Manage gemstones</b><span>Edit prices, mark as sold, hide drafts.</span></a>
        <a href="#/pages"><b>Edit page text & photos</b><span>Home hero, Our story, Contact and more.</span></a>
        <a href="#/settings"><b>Store settings</b><span>WhatsApp number, email, USD rate.</span></a>
      </div></div>`);
  }

  function viewProducts(query) {
    const params = new URLSearchParams(query || "");
    let tab = params.get("tab") || "all", q = params.get("q") || "";
    shell("products", `<div class="page">
      <div class="ph"><h1>Products</h1><div class="grow"></div><a class="btn primary" href="#/products/new">Add product</a></div>
      <div class="card flush">
        <div class="filters">
          ${[["all", "All"], ["active", "Active"], ["draft", "Draft"], ["sold", "Sold"]].map(([k, l]) => `<button class="tab ${tab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}
          <input id="fq" placeholder="Search by name or reference" value="${esc(q)}">
        </div>
        <table class="tbl"><thead><tr><th style="width:56px"></th><th>Gemstone</th><th>Status</th><th class="hide-m">Type</th><th class="hide-m">Carat</th><th>Price</th></tr></thead><tbody id="rows"></tbody></table>
      </div>
      <p class="hint" style="color:#616161">Tip: the first 4 products marked <b>Featured</b> show on the home page.</p></div>`);
    const draw = () => {
      const list = state.products.filter((p) =>
        (tab === "all" || (tab === "active" && p.status === "active") || (tab === "draft" && p.status === "draft") || (tab === "sold" && !p.available)) &&
        (!q || (p.name + " " + p.ref + " " + p.type).toLowerCase().includes(q.toLowerCase())));
      $("#rows").innerHTML = list.length ? list.map((p) => `<tr data-id="${esc(p.id)}">
        <td><div class="thumb">${thumb(p)}</div></td>
        <td><div class="name">${esc(p.name)}</div><div class="muted">${esc(p.ref || "")}${p.featured ? ' · <span class="badge star">Featured</span>' : ""}</div></td>
        <td><span class="badge ${p.status === "active" ? "ok" : ""}">${p.status === "active" ? "Active" : "Draft"}</span>${!p.available ? ' <span class="badge sold">Sold</span>' : ""}</td>
        <td class="hide-m muted">${esc(p.type)}</td><td class="hide-m muted">${Number(p.carat || 0).toFixed(2)} ct</td>
        <td>${fmt(p.price)}${p.comparePrice > p.price ? `<div class="muted" style="text-decoration:line-through;font-size:12px">${fmt(p.comparePrice)}</div>` : ""}</td></tr>`).join("")
        : `<tr><td colspan="6"><div class="empty"><b>No gemstones here</b>Try another filter or add a new gemstone.</div></td></tr>`;
      $$("#rows tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = "#/products/" + tr.dataset.id)));
    };
    $$(".tab").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; $$(".tab").forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
    $("#fq").oninput = (e) => { q = e.target.value; draw(); };
    draw();
  }

  /* image resize before upload: max 1800px, WebP */
  async function prepImage(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, "image/webp", 0.86));
      if (blob && blob.size) return blob;
    } catch {}
    return file;
  }
  async function uploadFile(file) {
    const blob = await prepImage(file);
    const r = await api("/api/admin/upload", { method: "POST", raw: blob, type: blob.type || file.type });
    return r.key;
  }

  function viewProduct(id) {
    const isNew = id === "new";
    const orig = isNew
      ? { name: "", status: "draft", available: true, featured: false, type: "Sapphire", shade: "Blue", ref: "", carat: "", cut: "Oval", cutDetail: "", price: "", comparePrice: "", dims: "", origin: "Sri Lanka", treatment: "Disclosed on request", lab: "Available on request", tag: "Loose gemstone", line: "", description: "", note: "", noteText: "", colours: ["#141E63", "#2437B8", "#4A63E0", "#8EA2F2"], images: [], seoTitle: "", seoDesc: "" }
      : state.products.find((p) => p.id === id);
    if (!orig) { location.hash = "#/products"; return; }
    let p = JSON.parse(JSON.stringify(orig));
    const opt = (list, v) => [...new Set([v, ...list].filter(Boolean))].map((x) => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("");
    const inp = (k, label, type = "text", extra = "") => `<div class="f"><label for="f_${k}">${label}</label><input type="${type}" id="f_${k}" data-k="${k}" value="${esc(p[k])}" ${extra}></div>`;

    shell("products", `<div class="page">
      <div class="ph"><a class="back" href="#/products">${I.back}</a><h1>${isNew ? "Add product" : esc(p.name)}</h1>
        ${!isNew ? `<span class="badge ${p.status === "active" ? "ok" : ""}">${p.status === "active" ? "Active" : "Draft"}</span>` : ""}
        <div class="grow"></div>${!isNew ? `<a class="preview-link" href="/gem.html?id=${esc(p.id)}" target="_blank" rel="noopener">${I.eye} View</a>` : ""}</div>
      <div class="layout">
        <div>
          <div class="card">
            ${inp("name", "Title", "text", 'placeholder="e.g. Ceylon Blue Sapphire"')}
            ${inp("line", "Short tagline (shown under the title)", "text", 'placeholder="A rich, velvety blue…"')}
            <div class="f"><label for="f_description">Description</label><textarea id="f_description" data-k="description" class="tall" placeholder="Tell the stone's story: colour, sparkle, where it's from, what it would make beautiful…">${esc(p.description)}</textarea><div class="hint">Shown on the product page. Leave a blank line between paragraphs.</div></div>
          </div>
          <div class="card">
            <h2>Media</h2>
            <div class="media" id="media"></div>
            <input type="file" id="file" accept="image/*" multiple hidden>
            <div class="hint">Drag photos to reorder. The first photo is the cover. Photos are resized automatically for fast loading. With no photos, the gem drawing below is shown.</div>
          </div>
          <div class="card">
            <h2>Pricing</h2>
            <div class="grid2">
              <div class="f"><label for="f_price">Price</label><div class="money"><span>LKR</span><input type="number" min="0" step="1000" id="f_price" data-k="price" value="${esc(p.price)}"></div></div>
              <div class="f"><label for="f_comparePrice">Compare-at price</label><div class="money"><span>LKR</span><input type="number" min="0" step="1000" id="f_comparePrice" data-k="comparePrice" value="${esc(p.comparePrice || "")}"></div></div>
            </div>
            <div class="hint">To show a reduced price, put the original price in compare-at. It shows crossed out on the site.</div>
          </div>
          <div class="card">
            <h2>Gemstone details</h2>
            <div class="grid3">
              ${inp("carat", "Carat weight", "number", 'step="0.01" min="0"')}
              <div class="f"><label for="f_cut">Shape</label><select id="f_cut" data-k="cut">${opt(CUTS, p.cut)}</select></div>
              ${inp("cutDetail", "Shape / cut description", "text", 'placeholder="Oval / Mixed cut"')}
            </div>
            <div class="grid3">
              ${inp("dims", "Dimensions", "text", 'placeholder="8.6 × 6.8 × 4.9 mm"')}
              ${inp("origin", "Origin")}
              ${inp("ref", "Reference / SKU", "text", 'placeholder="CV-BS-0234"')}
            </div>
            <div class="grid2">
              ${inp("treatment", "Treatment", "text", 'placeholder="Unheated / Heated / Disclosed on request"')}
              ${inp("lab", "Lab report", "text", 'placeholder="GIA / GRS / Available on request"')}
            </div>
          </div>
          <div class="card">
            <h2>Colour story (product page section)</h2>
            <div class="grid2">${inp("note", "Heading", "text", 'placeholder="Blue, with depth."')}<div></div></div>
            <div class="f"><label for="f_noteText">Text</label><textarea id="f_noteText" data-k="noteText">${esc(p.noteText)}</textarea></div>
          </div>
          <div class="card">
            <h2>Search engine listing</h2>
            ${inp("seoTitle", "Page title", "text", 'placeholder="Leave blank to use the product title"')}
            <div class="f"><label for="f_seoDesc">Meta description</label><textarea id="f_seoDesc" data-k="seoDesc" placeholder="Leave blank to use the tagline">${esc(p.seoDesc)}</textarea></div>
          </div>
        </div>
        <div>
          <div class="card">
            <h2>Status</h2>
            <div class="f"><select id="f_status" data-k="status"><option value="active" ${p.status === "active" ? "selected" : ""}>Active</option><option value="draft" ${p.status !== "active" ? "selected" : ""}>Draft</option></select></div>
            <div class="hint">Drafts are hidden from your store.</div>
          </div>
          <div class="card">
            <h2>Availability</h2>
            <label class="check"><input type="checkbox" id="f_available" data-k="available" ${p.available ? "checked" : ""}> Available to reserve</label>
            <div class="hint">Untick when sold. The stone stays on the site with a "Sold" label.</div>
            <label class="check" style="margin-top:12px"><input type="checkbox" id="f_featured" data-k="featured" ${p.featured ? "checked" : ""}> Feature on home page</label>
          </div>
          <div class="card">
            <h2>Product organization</h2>
            <div class="f"><label for="f_type">Type</label><select id="f_type" data-k="type">${opt(TYPES, p.type)}</select></div>
            <div class="f"><label for="f_shade">Colour</label><select id="f_shade" data-k="shade">${opt(SHADES, p.shade)}</select></div>
            ${inp("tag", "Label on photo", "text", 'placeholder="Celvyr selection"')}
          </div>
          <div class="card">
            <h2>Gem drawing colours</h2>
            <div class="colours">${p.colours.map((c, i) => `<input type="color" data-ci="${i}" value="${esc(c)}" title="${["Deepest", "Main", "Light", "Highlight"][i]}">`).join("")}</div>
            <div class="hint">Used only when there are no photos. Deepest → highlight.</div>
            <div id="gemPrev" style="width:96px;margin-top:10px">${gemSVG(p)}</div>
          </div>
          ${!isNew ? `<button class="btn danger" id="del" style="width:100%">Delete product</button>` : ""}
        </div>
      </div></div>`);

    const snapshot = () => JSON.stringify(p);
    const base = isNew ? null : snapshot();
    const check = () => setDirty(isNew ? true : snapshot() !== base, { save, discard });

    $$("[data-k]").forEach((el) => {
      const ev = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(ev, () => {
        const k = el.dataset.k;
        p[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
        if (k === "cut") $("#gemPrev").innerHTML = gemSVG(p);
        check();
      });
    });
    $$("[data-ci]").forEach((el) => el.addEventListener("input", () => { p.colours[+el.dataset.ci] = el.value; $("#gemPrev").innerHTML = gemSVG(p); check(); }));

    // media
    const media = $("#media"), file = $("#file");
    let pending = 0;
    const drawMedia = () => {
      media.innerHTML = p.images.map((k, i) => `<div class="m" draggable="true" data-i="${i}"><img src="/img/${esc(k)}" alt="">${i === 0 ? '<span class="cover">Cover</span>' : ""}<button class="x" data-x="${i}" title="Remove">✕</button></div>`).join("")
        + (pending ? [...Array(pending)].map(() => '<div class="m uploading">Uploading…</div>').join("") : "")
        + `<div class="drop ${p.images.length ? "" : "big"}" id="drop" style="${p.images.length ? "" : "grid-column:1/-1"}">${I.upload}<b>Add photos</b><span>or drop images here</span></div>`;
      $("#drop").onclick = () => file.click();
      const drop = $("#drop");
      ["dragover", "dragenter"].forEach((t) => drop.addEventListener(t, (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); drop.classList.add("over"); } }));
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
      $$("[data-x]", media).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); p.images.splice(+b.dataset.x, 1); drawMedia(); check(); }));
      let from = null;
      $$(".m[draggable]", media).forEach((m) => {
        m.addEventListener("dragstart", () => { from = +m.dataset.i; m.classList.add("dragging"); });
        m.addEventListener("dragend", () => m.classList.remove("dragging"));
        m.addEventListener("dragover", (e) => { if (from !== null) e.preventDefault(); });
        m.addEventListener("drop", (e) => { e.preventDefault(); const to = +m.dataset.i; if (from === null || from === to) return; const [x] = p.images.splice(from, 1); p.images.splice(to, 0, x); from = null; drawMedia(); check(); });
      });
    };
    async function addFiles(files) {
      const list = [...files].filter((f) => f.type.startsWith("image/"));
      if (!list.length) return;
      pending += list.length; drawMedia();
      for (const f of list) {
        try { const key = await uploadFile(f); p.images.push(key); }
        catch (e) { toast(e.message, true); }
        pending--; drawMedia(); check();
      }
    }
    file.onchange = () => { addFiles(file.files); file.value = ""; };
    drawMedia();

    async function save() {
      if (!String(p.name).trim()) { toast("Add a title first", true); $("#f_name").focus(); return; }
      if (pending) { toast("Wait for photos to finish uploading", true); return; }
      $("#save").disabled = true;
      try {
        if (isNew) {
          const r = await api("/api/admin/products", { method: "POST", body: p });
          state.products.unshift(r.product);
          setDirty(false); toast("Product created");
          location.hash = "#/products/" + r.product.id;
        } else {
          const r = await api("/api/admin/products/" + encodeURIComponent(orig.id), { method: "PUT", body: p });
          const removed = (orig.images || []).filter((k) => !r.product.images.includes(k));
          await Promise.all(removed.map((k) => api("/api/admin/img/" + k, { method: "DELETE" }).catch(() => {})));
          const i = state.products.findIndex((x) => x.id === orig.id); state.products[i] = r.product;
          setDirty(false); toast("Product saved"); viewProduct(orig.id);
        }
      } catch (e) { toast(e.message, true); }
      const sb = $("#save"); if (sb) sb.disabled = false;
    }
    function discard() {
      const added = p.images.filter((k) => !(orig.images || []).includes(k));
      added.forEach((k) => api("/api/admin/img/" + k, { method: "DELETE" }).catch(() => {}));
      setDirty(false);
      isNew ? (location.hash = "#/products") : viewProduct(orig.id);
    }
    const del = $("#del");
    if (del) del.onclick = async () => {
      if (!confirm(`Delete "${orig.name}"? This can't be undone.`)) return;
      try {
        await api("/api/admin/products/" + encodeURIComponent(orig.id), { method: "DELETE" });
        state.products = state.products.filter((x) => x.id !== orig.id);
        setDirty(false); toast("Product deleted"); location.hash = "#/products";
      } catch (e) { toast(e.message, true); }
    };
    if (isNew) { check(); $("#f_name").focus(); }
  }

  /* ---------- pages ---------- */
  function viewPages() {
    shell("pages", `<div class="page narrow">
      <div class="ph"><h1>Online store pages</h1></div>
      <div class="card flush plist">${PAGES.map(([f, name, key]) => {
        const n = Object.keys(state.content).filter((k) => k.startsWith(key + ".")).length;
        return `<a href="#/pages/${key}"><span><b>${name}</b><br><small>${n ? n + " edited section" + (n > 1 ? "s" : "") : "Original text"}</small></span><span>›</span></a>`;
      }).join("")}</div>
      <p class="hint" style="color:#616161">Products are edited in <a href="#/products" style="color:#005bd3">Products</a>. The announcement bar and WhatsApp number are in <a href="#/settings" style="color:#005bd3">Settings</a>.</p></div>`);
  }

  async function viewPage(key) {
    const pg = PAGES.find((x) => x[2] === key);
    if (!pg) { location.hash = "#/pages"; return; }
    shell("pages", `<div class="page narrow"><div class="ph"><a class="back" href="#/pages">${I.back}</a><h1>${pg[1]}</h1><div class="grow"></div><a class="preview-link" href="/${pg[0]}" target="_blank" rel="noopener">${I.eye} View page</a></div><div class="card"><div class="empty">Loading page sections…</div></div></div>`);
    let html;
    try { html = await (await fetch("/" + pg[0] + "?admin=" + Date.now(), { cache: "no-store" })).text(); }
    catch { toast("Couldn't load the page", true); return; }
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fields = $$("[data-c],[data-ci]", doc).map((el) => {
      const isImg = el.hasAttribute("data-ci");
      const k = el.getAttribute(isImg ? "data-ci" : "data-c");
      const def = isImg ? el.getAttribute("src") : el.innerHTML.replace(/<br\s*\/?>\s*/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").trim();
      return { k, isImg, def, label: el.getAttribute("data-l") || k, group: el.getAttribute("data-g") || "" };
    });
    const content = { ...state.content };
    const edit = { ...content };
    let groups = [...new Set(fields.map((f) => f.group))];
    const card = $(".card");
    const body = groups.map((g) => `<div class="card"><h2>${esc(g || "Page")}</h2>${fields.filter((f) => f.group === g).map((f) => {
      const v = edit[f.k] ?? f.def;
      if (f.isImg) return `<div class="field-row" data-row="${f.k}"><div class="lab"><label>${esc(f.label)}</label>${edit[f.k] != null ? '<span class="changed">Edited</span>' : ""}</div>
        <div class="img-field"><img src="${esc(v)}" alt=""><div><button class="btn" data-up="${f.k}">Replace image</button> ${edit[f.k] != null ? `<button class="btn plain" data-reset="${f.k}">Reset</button>` : ""}<input type="file" accept="image/*" hidden data-file="${f.k}"></div></div></div>`;
      const long = v.length > 70 || v.includes("\n");
      return `<div class="field-row" data-row="${f.k}"><div class="lab"><label for="c_${f.k}">${esc(f.label)}</label>${edit[f.k] != null ? `<span><span class="changed">Edited</span> <button class="btn plain" data-reset="${f.k}">Reset</button></span>` : ""}</div>
        <div class="f">${long ? `<textarea id="c_${f.k}" data-ck="${f.k}">${esc(v)}</textarea>` : `<input type="text" id="c_${f.k}" data-ck="${f.k}" value="${esc(v)}">`}</div></div>`;
    }).join("")}</div>`).join("");
    card.outerHTML = fields.length ? body : `<div class="card"><div class="empty"><b>No editable sections</b>This page is built from your products and settings.</div></div>`;
    const defs = Object.fromEntries(fields.map((f) => [f.k, f.def]));
    const check = () => setDirty(JSON.stringify(edit) !== JSON.stringify(content), { save, discard });
    $$("[data-ck]").forEach((el) => el.addEventListener("input", () => {
      const k = el.dataset.ck;
      if (el.value.trim() === defs[k]) delete edit[k]; else edit[k] = el.value;
      check();
    }));
    $$("[data-reset]").forEach((b) => (b.onclick = () => { delete edit[b.dataset.reset]; save(true); }));
    $$("[data-up]").forEach((b) => (b.onclick = () => $(`[data-file="${b.dataset.up}"]`).click()));
    $$("[data-file]").forEach((inp) => (inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const row = $(`[data-row="${inp.dataset.file}"] img`); row.style.opacity = .4;
      try { const key = await uploadFile(f); edit[inp.dataset.file] = "/img/" + key; row.src = "/img/" + key; check(); }
      catch (e) { toast(e.message, true); }
      row.style.opacity = 1;
    }));
    async function save(quiet) {
      try {
        const r = await api("/api/admin/content", { method: "PUT", body: edit });
        state.content = r.content; setDirty(false); toast(quiet === true ? "Reset to original" : "Page saved");
        viewPage(key);
      } catch (e) { toast(e.message, true); }
    }
    function discard() { setDirty(false); viewPage(key); }
  }

  /* ---------- settings ---------- */
  function viewSettings() {
    const C0 = window.CELVYR || {};
    const s = { whatsapp: "", email: "", usdRate: 300, announcement: "", footerTagline: "", bankAccountName: C0.bankAccountName || "", bankAccountNumber: C0.bankAccountNumber || "", bankName: C0.bankName || "", bankBranch: C0.bankBranch || "", paymentNote: C0.paymentNote || "", ...Object.fromEntries(Object.entries(state.settings).filter(([, v]) => v !== "" && v != null)) };
    const orig = JSON.stringify(s);
    shell("settings", `<div class="page narrow">
      <div class="ph"><h1>Settings</h1></div>
      <div class="card"><h2>Contact</h2>
        <div class="f"><label for="s_wa">WhatsApp number</label><input type="tel" id="s_wa" data-s="whatsapp" value="${esc(s.whatsapp)}" placeholder="94728993096"><div class="hint">Country code and number, digits only. Every WhatsApp button on the site uses this.</div></div>
        <div class="f"><label for="s_email">Email address</label><input type="email" id="s_email" data-s="email" value="${esc(s.email)}" placeholder="hello@celvyr.com"></div>
      </div>
      <div class="card"><h2>Bank transfer (shown on checkout)</h2>
        <div class="grid2">
          <div class="f"><label for="s_ban">Account name</label><input type="text" id="s_ban" data-s="bankAccountName" value="${esc(s.bankAccountName)}"></div>
          <div class="f"><label for="s_bano">Account number</label><input type="text" id="s_bano" data-s="bankAccountNumber" value="${esc(s.bankAccountNumber)}"></div>
          <div class="f"><label for="s_bn">Bank</label><input type="text" id="s_bn" data-s="bankName" value="${esc(s.bankName)}"></div>
          <div class="f"><label for="s_bb">Branch</label><input type="text" id="s_bb" data-s="bankBranch" value="${esc(s.bankBranch)}"></div>
        </div>
        <div class="f"><label for="s_pn">Message after payment</label><textarea id="s_pn" data-s="paymentNote">${esc(s.paymentNote)}</textarea></div>
      </div>
      <div class="card"><h2>Currency</h2>
        <div class="f"><label for="s_rate">1 USD = how many LKR?</label><input type="number" id="s_rate" data-s="usdRate" value="${esc(s.usdRate)}" min="1"><div class="hint">Used when visitors switch prices to USD.</div></div>
      </div>
      <div class="card"><h2>Store text</h2>
        <div class="f"><label for="s_ann">Announcement bar (top of every page on computers)</label><input type="text" id="s_ann" data-s="announcement" value="${esc(s.announcement)}" placeholder="A gemstone story, rooted in Sri Lanka"></div>
        <div class="f"><label for="s_ft">Footer tagline</label><textarea id="s_ft" data-s="footerTagline" placeholder="Extraordinary colour. Enduring character.&#10;A personal journey to your next gemstone.">${esc(s.footerTagline)}</textarea></div>
      </div>
      <div class="card"><h2>Admin password</h2>
        <div class="grid2"><div class="f"><label for="pw_c">Current password</label><input type="password" id="pw_c" autocomplete="current-password"></div><div class="f"><label for="pw_n">New password</label><input type="password" id="pw_n" autocomplete="new-password" minlength="10"></div></div>
        <button class="btn" id="pwBtn">Change password</button><div class="hint">Changing it signs out every other device.</div>
      </div></div>`);
    const check = () => setDirty(JSON.stringify(s) !== orig, { save, discard });
    $$("[data-s]").forEach((el) => el.addEventListener("input", () => { s[el.dataset.s] = el.type === "number" ? Number(el.value) : el.value; check(); }));
    async function save() {
      try { const r = await api("/api/admin/settings", { method: "PUT", body: s }); state.settings = r.settings; setDirty(false); toast("Settings saved"); viewSettings(); }
      catch (e) { toast(e.message, true); }
    }
    function discard() { setDirty(false); viewSettings(); }
    $("#pwBtn").onclick = async () => {
      try { await api("/api/admin/password", { method: "POST", body: { current: $("#pw_c").value, next: $("#pw_n").value } }); $("#pw_c").value = $("#pw_n").value = ""; toast("Password changed"); }
      catch (e) { toast(e.message, true); }
    };
  }

  /* ---------- router ---------- */
  let skipRoute = false;
  function route() {
    if (skipRoute) { skipRoute = false; return; }
    if (dirty && !confirm("You have unsaved changes. Leave without saving?")) { skipRoute = true; history.back(); return; }
    setDirty(false);
    window.scrollTo(0, 0);
    const [path, query] = location.hash.replace(/^#/, "").split("?");
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return viewHome();
    if (parts[0] === "products") return parts[1] ? viewProduct(parts[1]) : viewProducts(query);
    if (parts[0] === "pages") return parts[1] ? viewPage(parts[1]) : viewPages();
    if (parts[0] === "settings") return viewSettings();
    viewHome();
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  async function start() {
    let d;
    try { d = await api("/api/admin/data"); } catch (e) { if (e.message !== "Please log in") app.innerHTML = `<div class="auth"><div class="box"><h1>Can't reach the store</h1><p>${esc(e.message)}</p></div></div>`; return; }
    // first run: copy the demo gemstones and settings into storage
    if (!d.products) {
      const seed = (window.GEMS || []).map((g, i) => ({ ...g, status: "active", available: true, featured: i < 4, comparePrice: 0, images: [], description: "" }));
      d.products = (await api("/api/admin/products", { method: "PUT", body: seed })).products;
    }
    if (!d.settings || !d.settings.whatsapp) {
      const C = window.CELVYR || {};
      d.settings = (await api("/api/admin/settings", { method: "PUT", body: { whatsapp: C.whatsapp, email: C.email, usdRate: C.usdRate, announcement: "A gemstone story, rooted in Sri Lanka", footerTagline: "Extraordinary colour. Enduring character.\nA personal journey to your next gemstone.", ...(d.settings || {}) } })).settings;
    }
    state = { products: d.products, settings: d.settings, content: d.content || {} };
    route();
  }

  (async function init() {
    try {
      const s = await api("/api/admin/status");
      if (!s.setup) return authScreen({ title: "Welcome to your store admin", sub: "Create the password you'll use to log in. Only you will know it.", button: "Create password & enter", setup: true });
      if (!s.authed) return showLogin();
      start();
    } catch (e) {
      app.innerHTML = `<div class="auth"><div class="box"><img src="assets/logo-wordmark.webp" alt="Celvyr Gems"><h1>Admin is almost ready</h1><p>${esc(e.message)}</p></div></div>`;
    }
  })();
})();
