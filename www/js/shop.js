// Elreda.lt parduotuvės prekės su kainomis – TIK administratoriams (pasiūlymams).
// Darbuotojai ir brigadininkai jų nemato: jiems lieka medžiagų katalogas („Prekių katalogas“, lentelė products).
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc;
  S.shop = [];
  const f = { text: "", cat: "" };

  DZ.loadShop = async () => {
    if (!DZ.isAdmin() || !DZ.sb) { S.shop = []; return; }
    try {
      const { data, error } = await DZ.sb.from("shop_products").select("*").eq("active", true).order("name", { ascending: true });
      if (!error && data) S.shop = data;
    } catch (_) {}
  };
  DZ.hooks.afterLoad.push(() => { DZ.loadShop().then(() => { if (S.view === "shop" && !DZ.sheet) DZ.render(); }); });
  DZ.findShop = name => { const n = DZ.norm(name); return n && DZ.isAdmin() ? S.shop.find(p => DZ.norm(p.name) === n) || null : null; };

  DZ.views.shop = {
    html() {
      if (!DZ.isAdmin()) return `<section class="stack16"><p class="note">Tik administratoriams.</p></section>`;
      const words = DZ.norm(f.text).split(/\s+/).filter(Boolean);
      const cats = [...new Set(S.shop.map(p => p.category || "Kita"))].sort(DZ.byName);
      const list = S.shop.filter(p => (!f.cat || (p.category || "Kita") === f.cat) && words.every(w => DZ.norm([p.name, p.sku, p.category].join(" ")).includes(w)));
      const groups = new Map(); for (const p of list) { const c = p.category || "Kita"; (groups.get(c) || groups.set(c, []).get(c)).push(p); }
      const last = S.shop.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), "");
      return `<section class="stack16">
        <div class="view-head"><button class="icon-btn" data-act="back" aria-label="Atgal">‹</button><h2>Elreda.lt prekės</h2><span class="meta">${S.shop.length}</span></div>
        <div class="card">
          <input id="sh-q" type="search" placeholder="Ieškoti: pavadinimas, kodas" value="${esc(f.text)}" autocomplete="off">
          <div class="chips"><button class="chip-btn" data-act="sh-cat" data-v="" aria-pressed="${!f.cat}">Visos</button>${cats.map(c => `<button class="chip-btn" data-act="sh-cat" data-v="${esc(c)}" aria-pressed="${f.cat === c}">${esc(c)}</button>`).join("")}</div>
          <div class="row-between"><span class="note">${last ? "Atnaujinta " + esc(DZ.shortDate(last.slice(0, 10))) : "Dar neatnaujinta"} · mato tik administratoriai</span><button class="btn" data-act="shop-sync">Atnaujinti iš elreda.lt</button></div>
        </div>
        <p class="note">Kainos – iš elreda.lt parduotuvės (su PVM) ir perskaičiuotos be PVM. Pasiūlyme įvedus prekės pavadinimą, kaina be PVM įrašoma automatiškai.</p>
        ${list.length ? [...groups.entries()].map(([c, ps]) => `<div class="card"><span class="lbl">${esc(c)} · ${ps.length}</span>
          <table class="mat-table shop-table"><tbody>${ps.map(p => `<tr>
            <td>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}${p.sku ? `<br><span class="muted">${esc(p.sku)}</span>` : ""}</td>
            <td class="q">${p.price != null ? `${p.variable ? "nuo " : ""}${DZ.money(p.price)}<br><span class="muted">${DZ.money(p.price_vat)} su PVM</span>` : `<span class="muted">pagal užklausą</span>`}</td>
          </tr>`).join("")}</tbody></table></div>`).join("")
        : `<div class="empty"><strong>${S.shop.length ? "Nerasta" : "Prekių dar nėra"}</strong><span>${S.shop.length ? "Pakeiskite paiešką." : "Spauskite „Atnaujinti iš elreda.lt“."}</span></div>`}
      </section>`;
    },
    after() {
      let t = null; const q = $("#sh-q"); if (!q) return;
      q.addEventListener("input", ev => { clearTimeout(t); t = setTimeout(() => { f.text = ev.target.value; DZ.render(); const i = $("#sh-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    }
  };
  DZ.actions["sh-cat"] = t => { f.cat = t.dataset.v; DZ.render(); };
  DZ.actions["shop-sync"] = async t => {
    t.disabled = true; DZ.toast("Atnaujinama iš elreda.lt…");
    try {
      const r = await fetch(DZ.fnBase.replace(/drive-photo.*$/, "shop-sync"), { method: "POST", headers: { ...(await DZ.authHeaders()), "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
      await DZ.loadShop();
      DZ.toast(`Atnaujinta: ${j.count} prekės (su kaina ${j.priced})${j.inactive ? `, išimta ${j.inactive}` : ""}`);
      DZ.render();
    } catch (e) { DZ.toast("Nepavyko: " + (e.message || e), true); t.disabled = false; }
  };
})();
