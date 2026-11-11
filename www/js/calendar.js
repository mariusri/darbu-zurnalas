// Objektų kalendorius (pasiūlymas, montavimas, darbai, atlikta) ir objekto dokumentai (pasiūlymo nuotrauka ir kt.).
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc;
  const KINDS = {
    offer: { l: "Pasiūlymas", c: "var(--k-offer)" },
    install: { l: "Montavimas", c: "var(--k-install)" },
    work: { l: "Darbai", c: "var(--k-work)" },
    done: { l: "Atlikta", c: "var(--k-done)" }
  };
  DZ.DOC_TYPES = { pasiulymas: "Pasiūlymas", sutartis: "Sutartis", kita: "Kita" };
  const cal = { month: DZ.today().slice(0, 7), sel: DZ.today(), show: { offer: true, install: true, work: true, done: true } };
  try { Object.assign(cal.show, JSON.parse(DZ.lsGet("cal_show") || "{}")); } catch (_) {}

  // Įvykiai: datos iš objekto kortelės + darbų dienos iš įrašų
  DZ.calEvents = () => {
    const ev = [];
    const objs = new Map(S.objects.map(o => [o.id, o]));
    for (const o of S.objects) {
      if (o.offer_date) ev.push({ date: o.offer_date, kind: "offer", o });
      if (o.install_date) ev.push({ date: o.install_date, kind: "install", o });
      if (o.done_date) ev.push({ date: o.done_date, kind: "done", o });
    }
    const seen = new Set();
    for (const e of S.entries) {
      const id = DZ.entryObjectId(e); const o = id && objs.get(id);
      if (!o || seen.has(id + e.date)) continue;
      seen.add(id + e.date);
      ev.push({ date: e.date, kind: "work", o });
    }
    return ev.filter(x => cal.show[x.kind]);
  };

  DZ.calendarHtml = () => {
    const [y, m] = cal.month.split("-").map(Number);
    const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const byDay = new Map();
    for (const x of DZ.calEvents()) { if (!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date).push(x); }
    const order = { offer: 0, install: 1, work: 2, done: 3 };
    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span class="cal-cell empty"></span>`;
    for (let d = 1; d <= days; d++) {
      const s = cal.month + "-" + DZ.pad(d);
      const list = (byDay.get(s) || []).sort((a, b) => order[a.kind] - order[b.kind]);
      const kinds = [...new Set(list.map(x => x.kind))];
      cells += `<button class="cal-cell${s === DZ.today() ? " today" : ""}" data-act="cal-day" data-v="${s}" ${s === cal.sel ? 'aria-current="date"' : ""} aria-label="${esc(DZ.longDate(s))}${list.length ? ", " + list.length + " įvykiai" : ""}">
        <b>${d}</b>
        <span class="cal-bars">${kinds.map(k => `<i style="background:${KINDS[k].c}"></i>`).join("")}</span>
        ${list.length > 1 ? `<small>${list.length}</small>` : ""}
      </button>`;
    }
    const dayList = (byDay.get(cal.sel) || []).sort((a, b) => order[a.kind] - order[b.kind]);
    // Mėnesio suvestinė
    const inMonth = [...byDay.entries()].filter(([d]) => d.startsWith(cal.month)).flatMap(([, l]) => l);
    const count = k => new Set(inMonth.filter(x => x.kind === k).map(x => x.o.id)).size;
    return `<section class="stack16">
      <div class="view-head"><h2>Objektai</h2>
        <div class="seg small" role="group"><button data-act="o-mode" data-v="list" aria-pressed="false">Sąrašas</button><button data-act="o-mode" data-v="cal" aria-pressed="true">Kalendorius</button></div>
      </div>
      <div class="card">
        <div class="week-head"><button class="icon-btn" data-act="cal-month" data-v="-1" aria-label="Ankstesnis mėnuo">‹</button><h2 class="grow">${DZ.MON_NOM[m - 1]} ${y}</h2><button class="icon-btn" data-act="cal-month" data-v="1" aria-label="Kitas mėnuo">›</button></div>
        <div class="chips">${Object.entries(KINDS).map(([k, v]) => `<button class="chip-btn kind" data-act="cal-kind" data-v="${k}" aria-pressed="${!!cal.show[k]}"><i style="background:${v.c}"></i>${v.l}${cal.show[k] && count(k) ? " · " + count(k) : ""}</button>`).join("")}</div>
        <div class="cal-grid">${DZ.WD_S.map(w => `<span class="cal-wd">${w}</span>`).join("")}${cells}</div>
      </div>
      <div class="day-title"><h2>${cal.sel === DZ.today() ? "Šiandien, " : ""}${esc(DZ.longDate(cal.sel))}</h2></div>
      ${dayList.length ? `<div class="obj-list">${dayList.map(x => `<button class="obj-card ev" data-act="obj-open" data-id="${esc(x.o.id)}" style="border-left-color:${KINDS[x.kind].c}">
          <span class="row-between"><b>${esc(x.o.name)}</b><span class="pill kind" style="border-color:${KINDS[x.kind].c}">${KINDS[x.kind].l}</span></span>
          ${x.o.address || x.o.client_name ? `<span class="note">${esc([x.o.address, x.o.client_name].filter(Boolean).join(" · "))}</span>` : ""}
          ${x.o.power_kw ? `<span class="meta">${DZ.fmtQ(x.o.power_kw)} kW</span>` : ""}
        </button>`).join("")}</div>` : `<div class="empty"><span>Šią dieną įvykių nėra.</span></div>`}
      <p class="note">Pasiūlymo, montavimo ir atlikimo datos įrašomos objekto kortelėje („Redaguoti“). Keičiant būseną, tos dienos data įrašoma automatiškai. „Darbai“ – dienos, kai objekte buvo darbų įrašų.</p>
    </section>`;
  };
  DZ.actions["cal-month"] = t => {
    const [y, m] = cal.month.split("-").map(Number); const d = new Date(y, m - 1 + Number(t.dataset.v), 1);
    cal.month = d.getFullYear() + "-" + DZ.pad(d.getMonth() + 1);
    cal.sel = cal.month === DZ.today().slice(0, 7) ? DZ.today() : cal.month + "-01";
    DZ.render();
  };
  DZ.actions["cal-day"] = t => { cal.sel = t.dataset.v; DZ.render(); };
  DZ.actions["cal-kind"] = t => { cal.show[t.dataset.v] = !cal.show[t.dataset.v]; DZ.lsSet("cal_show", JSON.stringify(cal.show)); DZ.render(); };

  // ---------- Dokumentai (tik administratoriams; lentelė object_docs) ----------
  S.docs = [];
  DZ.loadDocs = async () => {
    if (!DZ.isAdmin() || !DZ.sb) { S.docs = []; return; }
    try {
      const { data, error } = await DZ.sb.from("object_docs").select("*").order("created_at", { ascending: true });
      if (!error && data) S.docs = data;
    } catch (_) {}
  };
  DZ.hooks.afterLoad.push(() => { DZ.loadDocs().then(() => { if (S.view === "object" && !DZ.sheet) DZ.render(); }); });
  const objDocs = id => S.docs.filter(d => d.object_id === id);
  DZ.objDocsHtml = o => {
    if (!DZ.isAdmin()) return "";
    const docs = objDocs(o.id);
    return `<div class="card">
      <span class="lbl">Dokumentai (mato tik administratoriai)</span>
      ${docs.length ? `<div class="thumbs docs">${docs.map((d, i) => `<div class="th doc"><button data-act="doc-view" data-id="${esc(o.id)}" data-i="${i}" aria-label="Atidaryti: ${esc(DZ.DOC_TYPES[d.type] || d.type)}">${DZ.imgTag(d.path, 'loading="lazy"')}</button><span class="doc-l">${esc(DZ.DOC_TYPES[d.type] || d.type)}<br>${esc(DZ.shortDate(d.date))}</span><button type="button" class="x" data-act="doc-rm" data-doc="${esc(d.id)}" aria-label="Pašalinti">×</button></div>`).join("")}</div>` : `<p class="note">Dokumentų dar nėra. Nufotografuokite pasiūlymą ar sutartį.</p>`}
      <div class="doc-up">
        <select id="doc-type" aria-label="Dokumento tipas">${Object.entries(DZ.DOC_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <label class="btn">Fotografuoti<input type="file" accept="image/*" capture="environment" data-doc-file="${esc(o.id)}"></label>
        <label class="btn">Iš galerijos<input type="file" accept="image/*" multiple data-doc-file="${esc(o.id)}"></label>
      </div><p class="note" id="doc-status"></p>
    </div>`;
  };
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const max = 2200, s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return (await new Promise(r => c.toBlob(r, "image/jpeg", 0.85))) || file;
    } catch (_) { return file; }
  }
  document.addEventListener("change", async ev => {
    const inp = ev.target; const id = inp.dataset && inp.dataset.docFile;
    if (!id || !DZ.isAdmin()) return;
    const o = S.objects.find(x => x.id === id); if (!o) return;
    const files = [...inp.files]; if (!files.length) return;
    const type = ($("#doc-type") || {}).value || "pasiulymas";
    const st = $("#doc-status");
    let n = 0;
    for (let i = 0; i < files.length; i++) {
      if (st) { st.className = "note"; st.textContent = `Keliama ${i + 1}/${files.length}…`; }
      let path;
      try { path = await DZ.uploadPhoto(await shrink(files[i]), DZ.today(), o.name); }
      catch (e) { if (st) { st.className = "err"; st.textContent = "Nepavyko įkelti: " + (e.message || e); } continue; }
      const { data, error } = await DZ.sb.from("object_docs").insert({ object_id: o.id, path, type, date: DZ.today() }).select().single();
      if (error) { DZ.removePhotos([path]); if (st) { st.className = "err"; st.textContent = "Nepavyko išsaugoti: " + error.message; } continue; }
      S.docs.push(data); n++;
    }
    if (!n) return;
    if (type === "pasiulymas" && !o.offer_date) {
      const { error } = await DZ.sb.from("objects").update({ offer_date: DZ.today() }).eq("id", o.id);
      if (!error) o.offer_date = DZ.today();
    }
    DZ.toast(n > 1 ? `Įkelta: ${n}` : "Įkelta");
    DZ.render();
  });
  DZ.actions["doc-view"] = t => { const docs = objDocs(t.dataset.id); if (docs.length) DZ.openLb(docs.map(d => d.path), +t.dataset.i); };
  DZ.actions["doc-rm"] = t => {
    const d = S.docs.find(x => x.id === t.dataset.doc); if (!d) return;
    DZ.confirm("Pašalinti dokumentą?", `${DZ.DOC_TYPES[d.type] || d.type}, ${DZ.shortDate(d.date)}. Nuotrauka bus perkelta į Google Drive šiukšlinę.`, "Pašalinti", async () => {
      const { error } = await DZ.sb.from("object_docs").delete().eq("id", d.id);
      if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
      S.docs = S.docs.filter(x => x.id !== d.id); DZ.removePhotos([d.path]); DZ.toast("Pašalinta"); DZ.render();
    });
  };
})();
