// Ataskaitos: valandos atlyginimams (CSV), medžiagos, objektų suvestinė.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc, fmtQ = DZ.fmtQ;
  const r = { mode: "month", from: "", to: "" };

  function range() {
    if (r.mode === "custom" && r.from && r.to) return [r.from, r.to];
    const [y, m] = S.month.split("-").map(Number);
    return [DZ.ymd(new Date(y, m - 1, 1)), DZ.ymd(new Date(y, m, 0))];
  }
  function periodEntries() { const [a, b] = range(); return S.entries.filter(e => e.date >= a && e.date <= b); }
  function people(list) {
    const ppl = new Map();
    for (const e of list) for (const w of e.workers || []) {
      if (!w.name) continue;
      const k = DZ.norm(w.name);
      const cur = ppl.get(k) || { name: w.name.trim(), hrs: 0, days: new Map() };
      const h = DZ.workerHours(w);
      cur.hrs += h; cur.days.set(e.date, (cur.days.get(e.date) || 0) + h);
      ppl.set(k, cur);
    }
    return [...ppl.values()].sort((a, b) => DZ.byName(a.name, b.name));
  }
  const periodLabel = () => { const [a, b] = range(); if (r.mode !== "custom") { const [y, m] = S.month.split("-").map(Number); return DZ.MON_NOM[m - 1] + " " + y; } return DZ.shortDate(a) + " – " + DZ.shortDate(b); };

  DZ.views.reports = {
    html() {
      const list = periodEntries().sort((a, b) => a.date.localeCompare(b.date));
      const ppl = people(list);
      const hrs = list.reduce((t, e) => t + DZ.entryHours(e), 0);
      const tot = DZ.totals(list);
      const rate = DZ.hourRate();
      const matSum = tot.reduce((t, m) => t + m.sum, 0);
      const byObj = new Map();
      for (const e of list) {
        const k = DZ.entryObjectId(e) || ("n:" + DZ.norm(e.object));
        const cur = byObj.get(k) || { id: DZ.entryObjectId(e), name: e.object || "Be objekto", hrs: 0, entries: [] };
        cur.hrs += DZ.entryHours(e); cur.entries.push(e); byObj.set(k, cur);
      }
      const objs = [...byObj.values()].map(o => ({ ...o, mat: DZ.totals(o.entries).reduce((t, m) => t + m.sum, 0) })).sort((a, b) => b.hrs - a.hrs);
      const [a, b] = range();
      return `<section class="stack16">
        <div class="view-head"><h2>Ataskaitos</h2></div>
        <div class="card">
          <div class="seg small" role="group"><button data-act="r-mode" data-v="month" aria-pressed="${r.mode === "month"}">Mėnuo</button><button data-act="r-mode" data-v="custom" aria-pressed="${r.mode === "custom"}">Laikotarpis</button></div>
          ${r.mode === "month" ? `<div class="week-head"><button class="icon-btn" data-act="r-month" data-v="-1" aria-label="Ankstesnis mėnuo">‹</button><h2 class="grow">${esc(periodLabel())}</h2><button class="icon-btn" data-act="r-month" data-v="1" aria-label="Kitas mėnuo">›</button></div>`
            : `<div class="row2"><label class="field"><span class="lbl">Nuo</span><input type="date" id="r-from" value="${a}"></label><label class="field"><span class="lbl">Iki</span><input type="date" id="r-to" value="${b}"></label></div>`}
        </div>
        ${!list.length ? `<div class="empty"><strong>Įrašų nėra</strong><span>Pasirinktu laikotarpiu darbų neužrašyta.</span></div>` : `
        <div class="card"><div class="stats">
          <div><b>${new Set(list.map(e => e.date)).size}</b><span class="lbl">darbo d.</span></div>
          <div><b>${list.length}</b><span class="lbl">įrašai</span></div>
          <div><b>${fmtQ(hrs)}</b><span class="lbl">valandos</span></div>
          <div><b>${objs.length}</b><span class="lbl">objektai</span></div>
        </div></div>
        <div class="card">
          <div class="row-between"><span class="lbl">Darbuotojų valandos (atlyginimams)</span><button class="btn" data-act="r-csv">Atsisiųsti CSV</button></div>
          ${ppl.length ? `<table class="mat-table"><tbody>${ppl.map(p => `<tr><td><details><summary>${esc(p.name)}</summary><div class="daylines">${[...p.days.entries()].sort().map(([d, h]) => `<span>${esc(DZ.shortDate(d))}</span><span class="q">${fmtQ(h)} val.</span>`).join("")}</div></details></td><td class="t">${p.days.size} d.</td><td class="q">${fmtQ(p.hrs)} val.</td>${rate ? `<td class="q">${DZ.money(p.hrs * rate)}</td>` : ""}</tr>`).join("")}
            <tr class="strong"><td>Iš viso</td><td></td><td class="q">${fmtQ(ppl.reduce((t, p) => t + p.hrs, 0))} val.</td>${rate ? `<td class="q">${DZ.money(ppl.reduce((t, p) => t + p.hrs, 0) * rate)}</td>` : ""}</tr></tbody></table>` : `<p class="note">Dirbusių žmonių neužrašyta.</p>`}
          <p class="note">CSV atsidaro Excel programoje: kiekviena eilutė – žmogus, data, objektas, laikas ir valandos.</p>
        </div>
        <div class="card"><span class="lbl">Objektai</span>
          <table class="mat-table"><tbody>${objs.map(o => `<tr><td>${o.id ? `<button class="linkbtn" data-act="obj-open" data-id="${esc(o.id)}">${esc(o.name)}</button>` : esc(o.name)}</td><td class="t">${fmtQ(o.hrs)} val.</td><td class="q">${o.mat ? DZ.money(o.mat) : ""}</td></tr>`).join("")}</tbody></table>
        </div>
        <div class="card">
          <div class="row-between"><span class="lbl">Sunaudotos medžiagos${matSum ? " · " + DZ.money(matSum) : ""}</span><button class="btn" data-act="r-copy">Kopijuoti suvestinę</button></div>
          ${tot.length ? DZ.matTable(tot, true) : `<p class="note">Medžiagų neužrašyta.</p>`}
          <textarea id="copy-fallback" hidden readonly style="width:100%;min-height:140px"></textarea>
        </div>
        <div class="card"><span class="lbl">Dienos</span><ul class="daylist">
          ${list.map(e => `<li><button data-act="goto-day" data-v="${e.date}"><span class="d">${esc(e.date.slice(5).replace("-", "."))}</span><span class="o">${esc(e.object || "Be pavadinimo")}</span><span class="d">${DZ.entryHours(e) ? fmtQ(DZ.entryHours(e)) + " val." : ""}</span></button></li>`).join("")}
        </ul></div>`}
      </section>`;
    },
    after() {
      const f = $("#r-from"), t = $("#r-to");
      if (f) { const upd = () => { r.from = f.value; r.to = t.value; if (r.from && r.to) DZ.render(); }; f.onchange = upd; t.onchange = upd; }
    }
  };
  DZ.actions["r-mode"] = t => { r.mode = t.dataset.v; if (r.mode === "custom" && !r.from) { const [a, b] = range(); r.from = a; r.to = b; } DZ.render(); };
  DZ.actions["r-month"] = t => { const [y, m] = S.month.split("-").map(Number); const d = new Date(y, m - 1 + Number(t.dataset.v), 1); S.month = d.getFullYear() + "-" + DZ.pad(d.getMonth() + 1); DZ.render(); };

  const csvCell = v => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  DZ.actions["r-csv"] = async () => {
    const list = periodEntries().sort((a, b) => a.date.localeCompare(b.date));
    const rate = DZ.hourRate();
    const rows = [["Darbuotojas", "Data", "Objektas", "Nuo", "Iki", "Valandos"].concat(rate ? ["Suma, €"] : [])];
    const lines = [];
    for (const e of list) for (const w of e.workers || []) if (w.name) lines.push([w.name.trim(), e.date, e.object || "", w.from || "", w.to || "", DZ.workerHours(w)]);
    lines.sort((x, y) => DZ.byName(x[0], y[0]) || x[1].localeCompare(y[1]));
    for (const l of lines) rows.push([...l.slice(0, 5), fmtQ(l[5])].concat(rate ? [fmtQ(l[5] * rate)] : []));
    rows.push([]);
    rows.push(["Suvestinė"]);
    for (const p of people(list)) rows.push([p.name, p.days.size + " d.", "", "", "", fmtQ(p.hrs)].concat(rate ? [fmtQ(p.hrs * rate)] : []));
    const csv = "﻿" + rows.map(rw => rw.map(csvCell).join(";")).join("\r\n");
    const [a, b] = range();
    try { await DZ.saveFile(`valandos_${a}_${b}.csv`, "text/csv;charset=utf-8", csv); }
    catch (e) { DZ.toast("Nepavyko išsaugoti: " + (e.message || e), true); }
  };
  DZ.actions["r-copy"] = t => {
    const list = periodEntries();
    const tot = DZ.totals(list), ppl = people(list), hrs = list.reduce((s, e) => s + DZ.entryHours(e), 0);
    const txt = periodLabel() + " — medžiagos\n" + tot.map(m => `${m.name}: ${fmtQ(m.qty)} ${m.unit}`).join("\n")
      + (ppl.length ? "\n\nDarbuotojai\n" + ppl.map(p => `${p.name}: ${fmtQ(p.hrs)} val. (${p.days.size} d.)`).join("\n") : "")
      + (hrs ? `\n\nValandos iš viso: ${fmtQ(hrs)}` : "");
    const fb = $("#copy-fallback");
    const fallback = () => { fb.hidden = false; fb.value = txt; fb.select(); };
    try { navigator.clipboard.writeText(txt).then(() => { t.textContent = "Nukopijuota"; setTimeout(() => { t.textContent = "Kopijuoti suvestinę"; }, 1800); }, fallback); } catch (_) { fallback(); }
  };
})();
