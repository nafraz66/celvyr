/* Celvyr — shared site code. Settings and gems live in catalogue.js. */
(function () {
  const C = window.CELVYR, GEMS = window.GEMS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const page = document.body.dataset.page;

  /* ---------- storage (safe) ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const getBag = () => store.get("celvyr_bag", []).filter((id) => GEMS.some((g) => g.id === id));
  const setBag = (b) => { store.set("celvyr_bag", b); updateBagCount(); };
  const getFavs = () => store.get("celvyr_favs", []);
  const getCur = () => store.get("celvyr_cur", "LKR");

  /* ---------- money ---------- */
  function money(lkr) {
    if (getCur() === "USD") return "≈ USD " + Math.round(lkr / C.usdRate).toLocaleString("en-US");
    return "LKR " + lkr.toLocaleString("en-US");
  }
  const gem = (id) => GEMS.find((g) => g.id === id);

  /* ---------- faceted gem drawing ---------- */
  function rand(seed) { let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function gemSVG(g, variant = 0) {
    const r = rand(g.id + variant), [deep, base, light, hi] = g.colours;
    const oval = g.cut === "Oval", N = 16, step = (Math.PI * 2) / N;
    const ry = oval ? 1 : 1, rx = oval ? 0.93 : 1;
    const P = (rad, a) => [100 + Math.cos(a) * 90 * rad * rx, 100 + Math.sin(a) * 90 * rad * ry];
    const outer = [...Array(N)].map((_, i) => P(1, i * step - Math.PI / 2));
    const mid = [...Array(N)].map((_, i) => P(0.64, (i + 0.5) * step - Math.PI / 2));
    const inner = [...Array(8)].map((_, k) => P(0.32, k * 2 * step - Math.PI / 2));
    const c = [100, 100], tris = [];
    for (let k = 0; k < 8; k++) {
      tris.push([c, inner[k], inner[(k + 1) % 8]]);
      tris.push([inner[k], mid[(2 * k + N - 1) % N], mid[2 * k]]);
      tris.push([inner[k], mid[2 * k], mid[2 * k + 1]]);
      tris.push([inner[k], inner[(k + 1) % 8], mid[2 * k + 1]]);
    }
    for (let i = 0; i < N; i++) {
      tris.push([outer[i], outer[(i + 1) % N], mid[i]]);
      tris.push([mid[i], mid[(i + 1) % N], outer[(i + 1) % N]]);
    }
    const pal = [deep, deep, base, base, base, light, light, hi];
    const polys = tris.map((t) => {
      const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
      const lightBias = ((200 - cx - cy) / 200) * 2.2; // brighter top-left
      let idx = Math.floor(r() * pal.length + lightBias);
      idx = Math.max(0, Math.min(pal.length - 1, idx));
      const col = pal[idx], pts = t.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
      return `<polygon points="${pts}" fill="${col}" stroke="${col}" stroke-width=".6" stroke-linejoin="round"/>`;
    }).join("");
    const shadow = variant === 1 ? `<ellipse cx="118" cy="196" rx="70" ry="9" fill="#000" opacity=".12"/>` : "";
    const tf = variant === 1 ? ` transform="rotate(-18 100 100)"` : "";
    return `<svg viewBox="0 0 200 ${variant === 1 ? 210 : 200}" role="img" aria-label="${g.name} illustration">${shadow}<g${tf}>${polys}</g></svg>`;
  }

  /* ---------- header + footer ---------- */
  const navItems = [["index.html", "Home", "home"], ["gemstones.html", "Gemstones", "gemstones"], ["story.html", "Our story", "story"], ["contact.html", "Contact", "contact"]];
  function header() {
    const cur = getCur();
    return `<div class="topbar">A gemstone story, rooted in Sri Lanka</div>
    <header class="header"><div class="wrap">
      <a class="logo" href="index.html" aria-label="Celvyr home"><b>CELVYR</b><small>FINE GEMS · SRI LANKA</small></a>
      <nav class="nav">${navItems.map(([h, t, k]) => `<a href="${h}" class="${page === k || (page === "gem" && k === "gemstones") ? "active" : ""}">${t}</a>`).join("")}</nav>
      <div class="head-right">
        <button class="cur" id="curToggle" title="Switch currency"><span class="${cur === "LKR" ? "on" : ""}">LKR</span> / <span class="${cur === "USD" ? "on" : ""}">USD</span></button>
        <a class="bag-btn" href="bag.html">Bag (<span id="bagCount">0</span>)</a>
        <button class="burger" aria-label="Menu"><span></span></button>
      </div>
    </div></header>`;
  }
  function footer() {
    return `<footer class="footer"><div class="wrap">
      <div class="foot-grid">
        <div><a class="logo" href="index.html"><b style="color:#fff">CELVYR</b><small>FINE GEMS · SRI LANKA</small></a>
          <p>Extraordinary colour. Enduring character.<br>A personal journey to your next gemstone.</p></div>
        <div><h5>Explore</h5><ul><li><a href="gemstones.html">All gemstones</a></li><li><a href="gem.html?id=ceylon-blue-sapphire">The featured sapphire</a></li><li><a href="story.html">Our story</a></li></ul></div>
        <div><h5>Let us help</h5><ul><li><a href="contact.html">Contact Celvyr</a></li><li><a href="contact.html?topic=Delivery">Delivery enquiries</a></li><li><a href="contact.html?topic=Guidance">Gemstone guidance</a></li></ul></div>
        <div><h5>A more personal search</h5><p style="margin-top:0">Have a particular colour or cut in mind?</p><ul style="margin-top:12px"><li><a href="contact.html" class="arrow">Speak with Celvyr</a></li></ul></div>
      </div>
      <div class="foot-base"><span>© ${new Date().getFullYear()} Celvyr · Fine gems from Sri Lanka</span><span>Every stone, one of a kind · Prices in LKR</span></div>
    </div></footer><div class="toast" id="toast"></div>`;
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2400); }
  function updateBagCount() { const el = $("#bagCount"); if (el) el.textContent = getBag().length; }

  /* ---------- product card ---------- */
  function card(g) {
    const fav = getFavs().includes(g.id);
    return `<a class="card" href="gem.html?id=${g.id}">
      <div class="card-img"><span class="tag">${g.tag}</span><button class="heart ${fav ? "on" : ""}" data-fav="${g.id}" aria-label="Save">${fav ? "♥" : "♡"}</button>${gemSVG(g)}</div>
      <div class="card-meta">${g.carat.toFixed(2)} ct · ${g.cut} cut</div>
      <h3>${g.name}</h3>
      <div class="card-foot"><span>${money(g.price)}</span><span>Explore</span></div></a>`;
  }
  function bindHearts(root = document) {
    $$("[data-fav]", root).forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      let f = getFavs(); const id = b.dataset.fav;
      f = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      store.set("celvyr_favs", f);
      b.classList.toggle("on"); b.textContent = b.classList.contains("on") ? "♥" : "♡";
      toast(b.classList.contains("on") ? "Saved to your favourites" : "Removed from favourites");
    }));
  }
  function renderGrid(el, list) { el.innerHTML = list.length ? list.map(card).join("") : `<p class="empty">No stones match just yet — <a class="link-under" href="contact.html">ask us to find one</a></p>`; bindHearts(el); }

  /* ---------- WhatsApp / email ---------- */
  const waLink = (text) => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}`;
  const mailLink = (subject, text) => `mailto:${C.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  /* ---------- pages ---------- */
  const pages = {
    home() { renderGrid($("#featured"), GEMS.slice(0, 3)); },

    gemstones() {
      const state = { type: "All", shade: "", cut: "", price: "", sort: "featured" };
      const shades = [...new Set(GEMS.map((g) => g.shade))];
      $("#fShade").innerHTML = `<option value="">All</option>` + shades.map((s) => `<option>${s}</option>`).join("");
      const draw = () => {
        let list = GEMS.filter((g) =>
          (state.type === "All" || g.type === state.type) && (!state.shade || g.shade === state.shade) && (!state.cut || g.cut === state.cut) &&
          (!state.price || (state.price === "lo" ? g.price < 250000 : state.price === "mid" ? g.price >= 250000 && g.price <= 400000 : g.price > 400000)));
        if (state.sort === "lo") list = [...list].sort((a, b) => a.price - b.price);
        if (state.sort === "hi") list = [...list].sort((a, b) => b.price - a.price);
        if (state.sort === "ct") list = [...list].sort((a, b) => b.carat - a.carat);
        renderGrid($("#grid"), list);
        $("#count").textContent = `${list.length} gemstone${list.length === 1 ? "" : "s"}`;
      };
      $$(".chip").forEach((b) => b.addEventListener("click", () => { $$(".chip").forEach((x) => x.classList.remove("on")); b.classList.add("on"); state.type = b.dataset.type; draw(); }));
      [["#fShade", "shade"], ["#fCut", "cut"], ["#fPrice", "price"], ["#fSort", "sort"]].forEach(([s, k]) => $(s).addEventListener("change", (e) => { state[k] = e.target.value; draw(); }));
      const t = new URLSearchParams(location.search).get("type");
      if (t) { const chip = $(`.chip[data-type="${t}"]`); if (chip) chip.click(); else draw(); } else draw();
    },

    gem() {
      const g = gem(new URLSearchParams(location.search).get("id")) || GEMS[0];
      document.title = `${g.name} — ${g.carat} ct | Celvyr`;
      $("#crumbName").textContent = g.name;
      $("#gTag").textContent = g.tag;
      $("#gRef").textContent = `${g.type} / ${g.ref}`;
      $("#gName").textContent = g.name;
      $("#gLine").textContent = g.line;
      $("#gPrice").textContent = money(g.price);
      $("#gSpecs").innerHTML = [["Carat weight", g.carat.toFixed(2) + " ct"], ["Shape / cut", g.cutDetail], ["Origin", g.origin], ["Dimensions", g.dims], ["Treatment", g.treatment], ["Lab report", g.lab]]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      $("#n1").textContent = g.note; $("#n1t").textContent = g.noteText;
      const main = $("#gMain");
      const show = (v) => { main.innerHTML = gemSVG(g, v); $$(".thumb").forEach((t, i) => t.classList.toggle("on", i === v)); };
      $("#thumbs").innerHTML = `<button class="thumb on">${gemSVG(g, 0)}</button><button class="thumb">${gemSVG(g, 1)}</button><button class="thumb">Turn it</button>`;
      $$(".thumb").forEach((t, i) => t.addEventListener("click", () => {
        if (i < 2) return show(i);
        show(0); let a = 0; const svg = $("svg", main); $$(".thumb").forEach((x, j) => x.classList.toggle("on", j === 2));
        const spin = () => { a += 6; svg.style.transform = `rotate(${a}deg)`; if (a < 360) requestAnimationFrame(spin); else svg.style.transform = ""; }; spin();
      }));
      show(0);
      const inBag = () => getBag().includes(g.id);
      const addBtn = $("#addBag");
      const sync = () => { addBtn.textContent = inBag() ? "In your bag — view bag" : "Add to bag"; };
      addBtn.addEventListener("click", () => { if (inBag()) return (location.href = "bag.html"); setBag([...getBag(), g.id]); sync(); toast(`${g.name} is in your bag`); });
      sync();
      $("#askGem").href = `contact.html?gem=${g.id}`;
      renderGrid($("#others"), GEMS.filter((x) => x.id !== g.id).slice(0, 3));
    },

    bag() {
      const draw = () => {
        const items = getBag().map(gem);
        const total = items.reduce((s, g) => s + g.price, 0);
        $("#bagSub").textContent = `Your shopping bag · ${items.length} gemstone${items.length === 1 ? "" : "s"}`;
        $("#lines").innerHTML = items.length ? items.map((g) => `
          <div class="line"><div class="line-gem"><a class="line-thumb" href="gem.html?id=${g.id}">${gemSVG(g)}</a>
            <div><h3>${g.name}</h3><div class="small">${g.carat.toFixed(2)} ct · ${g.cut} cut<br>Reference ${g.ref}</div><button class="rm" data-rm="${g.id}">Remove</button></div></div>
            <div><span class="qty">1 · one of a kind</span></div><div>${money(g.price)}</div></div>`).join("")
          : `<div class="line" style="display:block"><p class="lead">Your bag is waiting for its first stone.</p><p style="margin-top:18px"><a class="btn btn-dark" href="gemstones.html">Find your colour</a></p></div>`;
        $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { setBag(getBag().filter((x) => x !== b.dataset.rm)); draw(); }));
        $("#sumSub").textContent = money(total); $("#sumTotal").textContent = money(total);
        $("#toCheckout").style.pointerEvents = items.length ? "" : "none"; $("#toCheckout").style.opacity = items.length ? 1 : 0.4;
      };
      const note = $("#bagNote"); note.value = store.get("celvyr_note", ""); note.addEventListener("input", () => store.set("celvyr_note", note.value));
      draw();
      renderGrid($("#more"), GEMS.slice(0, 3));
    },

    checkout() {
      const items = getBag().map(gem), total = items.reduce((s, g) => s + g.price, 0);
      $("#coItems").innerHTML = items.map((g) => `<div class="mini"><div class="line-thumb">${gemSVG(g)}</div><div><h4>${g.name}</h4><div class="small muted" style="font-size:12px">${g.carat.toFixed(2)} ct · ${g.cut} · Qty 1</div></div></div>`).join("") || `<p class="muted" style="margin-bottom:20px">Your bag is empty. <a class="link-under" href="gemstones.html">Browse gemstones</a></p>`;
      $("#coSub").textContent = money(total); $("#coTotal").textContent = money(total);
      const form = $("#coForm");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!items.length) return toast("Add a gemstone to your bag first");
        const d = Object.fromEntries(new FormData(form));
        const text = `Hello Celvyr — I'd like to reserve:\n${items.map((g) => `• ${g.name} (${g.ref}) — ${g.carat} ct — LKR ${g.price.toLocaleString("en-US")}`).join("\n")}\nTotal: LKR ${total.toLocaleString("en-US")}\n\nName: ${d.first} ${d.last}\nEmail: ${d.email}\nPhone: ${d.phone}\nAddress: ${d.street}${d.apt ? ", " + d.apt : ""}, ${d.city} ${d.postal}, ${d.country}\nPayment preference: ${d.pay}\n${store.get("celvyr_note", "") ? "Note: " + store.get("celvyr_note", "") : ""}`;
        const via = e.submitter && e.submitter.dataset.via;
        window.open(via === "email" ? mailLink("Gemstone reservation", text) : waLink(text), "_blank");
        toast("Opening your message — just press send");
      });
    },

    contact() {
      const q = new URLSearchParams(location.search), g = gem(q.get("gem"));
      if (g) { $("#cInterest").value = "A specific gemstone"; $("#cMsg").value = `I'd love to know more about the ${g.name} (${g.ref}, ${g.carat} ct).`; }
      if (q.get("topic") === "Delivery") $("#cInterest").value = "Delivery & shipping";
      if (q.get("topic") === "Guidance") $("#cInterest").value = "Gemstone guidance";
      $("#waDirect").href = waLink("Hello Celvyr, I have a question about your gemstones.");
      $("#mailDirect").href = `mailto:${C.email}`; $("#mailDirect").textContent = C.email;
      const form = $("#cForm");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        const text = `Hello Celvyr,\n\n${d.message}\n\nInterested in: ${d.interest}${d.budget ? "\nBudget: " + d.budget : ""}\n\n${d.name}\n${d.email}${d.phone ? "\n" + d.phone : ""}`;
        const via = e.submitter && e.submitter.dataset.via;
        window.open(via === "email" ? mailLink("Gemstone enquiry from " + d.name, text) : waLink(text), "_blank");
        toast("Opening your message — just press send");
      });
    },
  };

  /* ---------- boot ---------- */
  $("#site-header").outerHTML = header();
  $("#site-footer").outerHTML = footer();
  updateBagCount();
  $(".burger").addEventListener("click", () => $(".header").classList.toggle("open"));
  $("#curToggle").addEventListener("click", () => { store.set("celvyr_cur", getCur() === "LKR" ? "USD" : "LKR"); location.reload(); });
  $$("[data-cfg-wa]").forEach((a) => (a.href = waLink(a.dataset.cfgWa)));
  if (pages[page]) pages[page]();

  /* ---------- page-to-page loader ---------- */
  const loader = document.createElement("div");
  loader.className = "page-loader";
  loader.innerHTML = '<div class="ld-gem"></div><div class="ld-word"></div><div class="ld-bar"></div>';
  document.body.appendChild(loader);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.target === "_blank") return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    e.preventDefault();
    loader.classList.add("on");
    setTimeout(() => (location.href = url.href), 320);
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) loader.classList.remove("on"); });
})();
