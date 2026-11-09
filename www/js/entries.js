// Dienos įrašai: dienos rodinys, įrašo kortelė, redaktorius, paieška, nuotraukų peržiūra.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc, fmtQ = DZ.fmtQ;

  // ---------- Įrašo kortelė ----------
  DZ.entryHtml = (e, opts = {}) => {
    const mats = (e.materials || []).filter(m => m.name);
    const photos = e.photos || [];
    const ws = (e.workers || []).filter(w => w.name);
    const eh = DZ.entryHours(e);
    const oid = DZ.entryObjectId(e);
    return `<article class="entry${e._pending ? " pending" : ""}">
      <div class="entry-head">
        <h3>${opts.showDate ? `<small class="ed">${esc(DZ.shortDate(e.date))}</small>` : ""}${oid && !opts.noObjLink ? `<button class="linkbtn h" data-act="obj-open" data-id="${esc(oid)}">${esc(e.object || "Be pavadinimo")}</button>` : esc(e.object || "Be pavadinimo")}</h3>
        ${eh ? `<span class="chip">${fmtQ(eh)} val.</span>` : ""}
      </div>
      <div class="entry-body">
        ${ws.length ? `<div><span class="lbl">Dirbo</span><table class="mat-table"><tbody>${ws.map(w => `<tr><td>${esc(w.name)}</td><td class="t">${w.from && w.to ? esc(w.from) + "–" + esc(w.to) : ""}</td><td class="q">${DZ.workerHours(w) ? fmtQ(DZ.workerHours(w)) + " val." : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
        ${e.work ? `<p class="work">${esc(e.work)}</p>` : ""}
        ${mats.length ? `<div><span class="lbl">Medžiagos</span>${DZ.matTable(mats)}</div>` : ""}
        ${photos.length ? `<div class="thumbs">${photos.map((p, i) => `<button data-act="photo" data-id="${esc(e.id)}" data-i="${i}" aria-label="Atidaryti nuotrauką ${i + 1}">${DZ.imgTag(p, 'loading="lazy"')}</button>`).join("")}</div>` : ""}
        <span class="note">${e._pending ? "⏳ Laukia išsiuntimo · " : ""}${e.author ? "Įrašė: " + esc(e.author) : ""}</span>
      </div>
      ${DZ.canEdit(e) || DZ.canDelete(e) ? `<div class="entry-actions">
        ${DZ.canDelete(e) ? `<button class="btn danger" data-act="entry-del" data-id="${esc(e.id)}">Ištrinti</button>` : ""}
        ${DZ.canEdit(e) ? `<button class="btn" data-act="entry-edit" data-id="${esc(e.id)}">Redaguoti</button>` : ""}
      </div>` : ""}
    </article>`;
  };

  // ---------- Dienos rodinys ----------
  DZ.views.day = {
    fab: () => ({ label: "+ Naujas įrašas", act: "entry-new" }),
    html() {
      const marks = new Set(S.entries.map(e => e.date));
      const today = DZ.today();
      const list = S.entries.filter(e => e.date === S.date).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
      const hrs = list.reduce((t, e) => t + DZ.entryHours(e), 0);
      const myTasks = S.tasks.filter(t => t.date === S.date && t.status !== "atlikta");
      let body;
      if (!S.loaded) body = `<p class="status">Kraunami įrašai…</p>`;
      else if (!list.length) body = `<div class="empty"><strong>Šią dieną įrašų nėra</strong><span>Užrašykite objektą, dirbusius žmones, darbus, medžiagas ir įkelkite nuotraukas.</span><button class="btn primary" data-act="entry-new">+ Naujas įrašas</button></div>`;
      else body = list.map(e => DZ.entryHtml(e)).join("");
      const tot = DZ.totals(list);
      return `<section class="stack16">
        ${DZ.weekStrip(S.date, marks, "day")}
        <div class="day-title"><h2>${S.date === today ? "Šiandien, " : ""}${esc(DZ.longDate(S.date))}</h2><span class="meta">${list.length ? list.length + " įr." + (hrs ? " · " + fmtQ(hrs) + " val." : "") : ""}</span></div>
        ${myTasks.length ? `<button class="task-hint" data-act="go-tasks" data-v="${S.date}">📋 Suplanuota užduočių: ${myTasks.length} <span>žiūrėti ›</span></button>` : ""}
        <div class="entries">${body}</div>
        ${list.length > 1 && tot.length ? `<div class="daytotal"><span class="lbl">Dienos medžiagos iš viso</span>${DZ.matTable(tot)}</div>` : ""}
      </section>`;
    }
  };
  DZ.actions["day-date"] = t => { S.date = t.dataset.v; DZ.render(); };
  DZ.actions["go-tasks"] = t => DZ.go("tasks", { taskDate: t.dataset.v });

  // ---------- Paieška ----------
  const q = { text: "", from: "", to: "" };
  function results() {
    const words = DZ.norm(q.text).split(/\s+/).filter(Boolean);
    return S.entries.filter(e => {
      if (q.from && e.date < q.from) return false;
      if (q.to && e.date > q.to) return false;
      if (!words.length) return true;
      const hay = DZ.norm([e.object, e.work, e.author, ...(e.workers || []).map(w => w.name), ...(e.materials || []).map(m => m.name)].join(" "));
      return words.every(w => hay.includes(w));
    }).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  }
  function resultsHtml() {
    if (!S.loaded) return `<p class="status">Kraunami įrašai…</p>`;
    const list = results();
    if (!list.length) return `<div class="empty"><strong>Nieko nerasta</strong><span>${q.text || q.from || q.to ? "Pabandykite trumpesnį žodį arba platesnį laikotarpį." : "Įrašų dar nėra."}</span></div>`;
    const hrs = list.reduce((t, e) => t + DZ.entryHours(e), 0);
    const tot = DZ.totals(list);
    const MAX = 60;
    let html = `<div class="card"><div class="stats">
        <div><b>${list.length}</b><span class="lbl">įrašai</span></div>
        <div><b>${new Set(list.map(e => e.date)).size}</b><span class="lbl">dienos</span></div>
        <div><b>${fmtQ(hrs)}</b><span class="lbl">valandos</span></div>
      </div>
      ${tot.length ? `<details><summary class="lbl">Medžiagos iš viso (${tot.length})</summary>${DZ.matTable(tot)}</details>` : ""}
    </div>`;
    let last = "";
    for (const e of list.slice(0, MAX)) {
      if (e.date !== last) { html += `<button class="date-sep" data-act="goto-day" data-v="${e.date}">${esc(DZ.longDate(e.date))} <span>atidaryti dieną ›</span></button>`; last = e.date; }
      html += DZ.entryHtml(e);
    }
    if (list.length > MAX) html += `<p class="status">Rodomi ${MAX} naujausi iš ${list.length}. Susiaurinkite paiešką.</p>`;
    return html;
  }
  DZ.views.search = {
    html() {
      const objs = [...new Set([...S.objects.map(o => o.name), ...S.entries.map(e => (e.object || "").trim())].filter(Boolean))].sort(DZ.byName);
      return `<section class="stack16">
        <div class="view-head"><button class="icon-btn" data-act="back" aria-label="Atgal">‹</button><h2>Paieška</h2></div>
        <form class="card" id="search-form" novalidate>
          <label class="field"><span class="lbl">Objektas, adresas, darbas, žmogus ar medžiaga</span><input id="q-text" type="search" list="obj-list" placeholder="pvz. Pavilnio" autocomplete="off" value="${esc(q.text)}"></label>
          <datalist id="obj-list">${objs.map(o => `<option value="${esc(o)}"></option>`).join("")}</datalist>
          <div class="row2">
            <label class="field"><span class="lbl">Nuo</span><input id="q-from" type="date" value="${q.from}"></label>
            <label class="field"><span class="lbl">Iki</span><input id="q-to" type="date" value="${q.to}"></label>
          </div>
          <div class="chips">
            <button type="button" class="chip-btn" data-act="q-range" data-v="week">Ši savaitė</button>
            <button type="button" class="chip-btn" data-act="q-range" data-v="month">Šis mėnuo</button>
            <button type="button" class="chip-btn" data-act="q-range" data-v="prev">Praėjęs mėnuo</button>
            <button type="button" class="chip-btn" data-act="q-range" data-v="all">Visas laikas</button>
          </div>
        </form>
        <div id="search-body" class="stack16">${resultsHtml()}</div>
      </section>`;
    },
    after() {
      let timer = null;
      const upd = () => { q.text = $("#q-text").value.trim(); q.from = $("#q-from").value; q.to = $("#q-to").value; $("#search-body").innerHTML = resultsHtml(); DZ.hydratePhotos(); };
      $("#search-form").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(upd, 200); });
      $("#search-form").addEventListener("submit", ev => { ev.preventDefault(); upd(); $("#q-text").blur(); });
    }
  };
  DZ.actions["q-range"] = t => {
    const now = new Date(), Y = now.getFullYear(), M = now.getMonth(); let a = "", b = "";
    if (t.dataset.v === "week") { a = DZ.weekStart(DZ.today()); b = DZ.addDays(a, 6); }
    else if (t.dataset.v === "month") { a = DZ.ymd(new Date(Y, M, 1)); b = DZ.ymd(new Date(Y, M + 1, 0)); }
    else if (t.dataset.v === "prev") { a = DZ.ymd(new Date(Y, M - 1, 1)); b = DZ.ymd(new Date(Y, M, 0)); }
    $("#q-from").value = a; $("#q-to").value = b;
    $("#search-form").dispatchEvent(new Event("submit"));
  };
  DZ.actions["goto-day"] = t => DZ.go("day", { date: t.dataset.v });
  DZ.actions["open-search"] = () => { DZ.go("search"); setTimeout(() => { const i = $("#q-text"); if (i && !i.value) i.focus(); }, 50); };

  // ---------- Redaktorius ----------
  let ed = null;
  DZ.editorOpen = () => !!ed;
  function knownMaterials() {
    const s = new Set(DZ.BASE_MATS);
    for (const p of S.products) if (p.active !== false) s.add(p.name);
    for (const e of S.entries) for (const m of e.materials || []) if (m.name) s.add(m.name.trim());
    return [...s].sort(DZ.byName);
  }
  function workerRows(d) {
    const names = S.crew.slice();
    for (const w of d.workers) if (w.name && !names.includes(w.name)) names.push(w.name);
    const def = d.workers.find(w => w.from && w.to) || ed.defTimes || { from: "08:00", to: "17:00" };
    return names.map((n, i) => {
      const w = d.workers.find(x => x.name === n);
      const from = w ? w.from : def.from, to = w ? w.to : def.to;
      return `<div class="w-row${w ? "" : " off"}" data-name="${esc(n)}">
        <label class="w-who"><input type="checkbox" class="w-on" id="w-on-${i}" ${w ? "checked" : ""}><span>${esc(n)}</span></label>
        <span class="h"></span>
        <div class="w-times"><input class="w-from" id="w-from-${i}" type="time" value="${esc(from)}" aria-label="${esc(n)}: pradžia"><span aria-hidden="true">–</span><input class="w-to" id="w-to-${i}" type="time" value="${esc(to)}" aria-label="${esc(n)}: pabaiga"></div>
      </div>`;
    }).join("");
  }
  // prefill: { date, object, workers:[names], work }
  DZ.openEditor = (entry, prefill) => {
    const last = S.entries.filter(DZ.isMine).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    let data;
    if (entry) data = JSON.parse(JSON.stringify({ date: entry.date, object: entry.object, work: entry.work, workers: entry.workers || [], materials: entry.materials || [], photos: entry.photos || [] }));
    else {
      data = { date: S.date, object: last ? last.object : "", work: "", workers: JSON.parse(JSON.stringify(last ? last.workers || [] : [])), materials: [], photos: [] };
      if (prefill) {
        const def = (last && (last.workers || []).find(w => w.from && w.to)) || { from: "08:00", to: "17:00" };
        if (prefill.date) data.date = prefill.date;
        if (prefill.object != null) data.object = prefill.object;
        if (prefill.work) data.work = prefill.work;
        if (prefill.workers) data.workers = prefill.workers.map(n => ({ name: n, from: def.from, to: def.to }));
      }
    }
    ed = { id: entry ? entry.id : null, data, newPhotos: new Set(), removed: new Set(), uploading: [], previews: new Map(), error: "", taskId: prefill && prefill.taskId };
    if (!ed.data.materials.length) ed.data.materials.push({ name: "", qty: "", unit: "vnt." });
    ed.defTimes = ((last && last.workers) || []).find(w => w.from && w.to) || { from: "08:00", to: "17:00" };
    drawEditor();
  };
  function syncForm() {
    if (!ed || !$("#ed-form")) return;
    ed.data.date = $("#f-date").value || ed.data.date;
    ed.data.object = $("#f-object").value;
    ed.data.work = $("#f-work").value;
    ed.data.workers = DZ.$$(".w-row").filter(r => $(".w-on", r).checked).map(r => ({ name: r.dataset.name, from: $(".w-from", r).value, to: $(".w-to", r).value }));
    ed.data.materials = DZ.$$(".mat-row").map((r, i) => ({ ...(ed.data.materials[i] || {}), name: $(".m-name", r).value, qty: $(".m-qty", r).value, unit: $(".m-unit", r).value }));
  }
  function updateWorkerHours() {
    let sum = 0;
    DZ.$$(".w-row").forEach(r => {
      const on = $(".w-on", r).checked;
      r.classList.toggle("off", !on);
      const h = on ? DZ.workerHours({ from: $(".w-from", r).value, to: $(".w-to", r).value }) : 0;
      sum += h;
      $(".h", r).textContent = h ? fmtQ(h) + " val." : "";
    });
    const el = $("#w-sum"); if (el) el.textContent = sum ? "Iš viso: " + fmtQ(sum) + " val." : "";
  }
  function drawEditor() {
    const d = ed.data;
    const busy = ed.uploading.length > 0;
    const scroll = ($(".sheet") || {}).scrollTop || 0;
    const objs = S.objects.filter(o => o.status !== "baigta").map(o => o.name).sort(DZ.byName);
    DZ.openSheet(`
      <h2>${ed.id ? "Redaguoti įrašą" : "Naujas įrašas"}</h2>
      <label class="field"><span class="lbl">Data</span><input type="date" id="f-date" value="${esc(d.date)}" required></label>
      <label class="field"><span class="lbl">Objektas</span><input id="f-object" list="f-obj-list" placeholder="pvz. Saulės elektrinė, Pavilnio g. 12" value="${esc(d.object)}" autocomplete="off"></label>
      <datalist id="f-obj-list">${objs.map(o => `<option value="${esc(o)}"></option>`).join("")}</datalist>
      <div class="field"><span class="lbl">Dirbę žmonės ir laikas</span>
        <div class="mat-rows" id="w-rows">${workerRows(d)}</div>
        <div class="row-between">${S.crew.length ? "" : `<span class="note">Darbuotojų sąrašas tuščias – brigadininkas ar administratorius gali jį papildyti meniu ⋯.</span>`}<span class="w-sum" id="w-sum"></span></div>
      </div>
      <label class="field"><span class="lbl">Atlikti darbai</span><textarea id="f-work" placeholder="Ką šiandien padarėte, kas liko, pastabos">${esc(d.work)}</textarea></label>
      <div class="field"><span class="lbl">Medžiagos</span>
        <datalist id="mat-list">${knownMaterials().map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <div class="mat-rows">${d.materials.map((m, i) => `<div class="mat-row">
          <input class="m-name" id="m-name-${i}" list="mat-list" placeholder="Medžiaga" value="${esc(m.name)}" aria-label="Medžiaga" autocomplete="off">
          <input class="m-qty" id="m-qty-${i}" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(m.qty)}" aria-label="Kiekis">
          <select class="m-unit" id="m-unit-${i}" aria-label="Vienetai">${DZ.UNITS.map(u => `<option ${u === (m.unit || "vnt.") ? "selected" : ""}>${u}</option>`).join("")}</select>
          <button type="button" class="icon-btn" data-act="m-rm" data-i="${i}" aria-label="Pašalinti eilutę">×</button></div>`).join("")}</div>
        <button type="button" class="btn" data-act="m-add" style="align-self:flex-start">+ Pridėti medžiagą</button>
      </div>
      <div class="field"><span class="lbl">Nuotraukos</span>
        ${d.photos.length || ed.uploading.length ? `<div class="thumbs">
          ${d.photos.map(p => `<div class="th">${ed.previews.get(p) ? `<img src="${ed.previews.get(p)}" alt="">` : DZ.imgTag(p)}${DZ.isLocal(p) ? `<span class="badge">neįkelta</span>` : ""}<button type="button" class="x" data-act="p-rm" data-p="${esc(p)}" aria-label="Pašalinti nuotrauką">×</button></div>`).join("")}
          ${ed.uploading.map(u => `<div class="th">${u.preview ? `<img src="${u.preview}" alt="" style="opacity:.4">` : ""}<span class="prog">keliama…</span></div>`).join("")}
        </div>` : ""}
        <div class="photo-btns">
          <label class="btn">Fotografuoti<input type="file" id="f-cam" accept="image/*" capture="environment"></label>
          <label class="btn">Iš galerijos<input type="file" id="f-gal" accept="image/*" multiple></label>
        </div>
      </div>
      ${ed.error ? `<p class="err">${esc(ed.error)}</p>` : ""}
      <div class="sheet-actions">
        <button type="button" class="btn" data-act="ed-cancel">Atšaukti</button>
        <button type="submit" class="btn primary" ${busy ? "disabled" : ""}>${busy ? "Keliamos nuotraukos…" : "Išsaugoti"}</button>
      </div>`, { form: true, id: "ed-form", onClose: cancelEditor });
    $(".sheet").scrollTop = scroll;
    $("#ed-form").addEventListener("submit", ev => { ev.preventDefault(); save(); });
    $("#w-rows").addEventListener("input", updateWorkerHours); $("#w-rows").addEventListener("change", updateWorkerHours);
    $("#f-cam").addEventListener("change", ev => addPhotos([...ev.target.files]));
    $("#f-gal").addEventListener("change", ev => addPhotos([...ev.target.files]));
    // Pasirinkus prekę iš katalogo – jos vienetai
    $("#ed-form").addEventListener("change", ev => {
      if (!ev.target.classList.contains("m-name")) return;
      const p = DZ.findProduct(ev.target.value);
      if (p) { const u = ev.target.parentElement.querySelector(".m-unit"); if (DZ.UNITS.includes(p.unit)) u.value = p.unit; }
    });
    updateWorkerHours();
    DZ.hydratePhotos();
  }
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const max = 1800, s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
      return blob || file;
    } catch (_) { return file; }
  }
  async function addPhotos(files) {
    syncForm();
    const jobs = files.map(f => ({ f, preview: (() => { try { return URL.createObjectURL(f); } catch (_) { return ""; } })() }));
    ed.uploading.push(...jobs); ed.error = "";
    drawEditor();
    const myEd = ed;
    for (const j of jobs) {
      let path = null;
      const blob = await shrink(j.f);
      try {
        if (navigator.onLine === false) throw new Error("offline");
        path = await DZ.uploadPhoto(blob, myEd.data.date || S.date, myEd.data.object);
      } catch (e) {
        if (DZ.isNetErr(e)) {
          // Be ryšio – laikome telefone ir įkelsime vėliau
          try { path = "local:" + DZ.uuid(); await DZ.idbPut(path, blob); } catch (_) { path = null; }
          if (!path && ed === myEd) ed.error = "Nepavyko išsaugoti nuotraukos telefone.";
        } else if (ed === myEd) ed.error = "Nepavyko įkelti nuotraukos į Google Drive (" + (e && e.message ? e.message : "klaida") + ").";
      }
      if (path) {
        if (ed !== myEd) { DZ.removePhotos([path]); continue; }
        ed.data.photos.push(path); ed.newPhotos.add(path); ed.previews.set(path, j.preview);
      }
      if (ed === myEd) { ed.uploading = ed.uploading.filter(x => x !== j); syncForm(); drawEditor(); }
    }
  }
  function cancelEditor() {
    const orphan = ed ? [...ed.newPhotos] : [];
    ed = null; DZ.closeSheet(true); DZ.render();
    if (orphan.length) DZ.removePhotos(orphan);
  }
  async function save() {
    syncForm();
    const d = ed.data;
    if (!d.object.trim() && !d.work.trim() && !d.materials.some(m => m.name.trim()) && !d.photos.length && !d.workers.length) {
      ed.error = "Įrašas tuščias: užpildykite bent objektą, darbus ar medžiagas."; drawEditor(); return;
    }
    const workers = d.workers.filter(w => w.name.trim()).map(w => ({ name: w.name.trim(), from: w.from || "", to: w.to || "" }));
    const obj = DZ.findObject(d.object);
    const row = {
      date: d.date, object: obj ? obj.name : d.object.trim(), object_id: obj ? obj.id : null, work: d.work.trim(), workers,
      materials: d.materials.filter(m => m.name.trim()).map(m => {
        const p = DZ.findProduct(m.name);
        const out = { name: p ? p.name : m.name.trim(), qty: DZ.num(m.qty), unit: m.unit };
        // Kaina fiksuojama įrašymo metu; redaguojant paliekama buvusi
        if (m.price != null && m.price !== "" && (!p || DZ.norm(m.name) === DZ.norm(p.name))) { out.price = Number(m.price); if (m.product_id) out.product_id = m.product_id; }
        else if (p) { out.price = Number(p.price) || 0; out.product_id = p.id; }
        return out;
      }),
      photos: d.photos,
      hours: workers.reduce((t, w) => t + DZ.workerHours(w), 0) || null,
      updated_at: new Date().toISOString()
    };
    const btn = $("#ed-form button[type=submit]"); btn.disabled = true; btn.textContent = "Saugoma…";
    const id = ed.id || DZ.uuid();
    const isNew = !ed.id, removed = [...ed.removed], taskId = ed.taskId;
    if (isNew) row.user_id = S.user.id;
    DZ.enqueue(isNew ? "insert" : "update", "entries", id, row);
    S.date = d.date;
    ed = null; DZ.closeSheet(true);
    if (taskId) { const t = S.tasks.find(x => x.id === taskId); if (t && t.status !== "atlikta") DZ.enqueue("update", "tasks", taskId, { status: "atlikta" }); }
    DZ.render();
    if (removed.length) DZ.removePhotos(removed);
    await DZ.flush();
    if (S.offline || DZ.queueSize()) { DZ.toast("Išsaugota telefone – bus išsiųsta atsiradus ryšiui."); DZ.render(); }
    else { DZ.toast("Išsaugota"); DZ.loadAll(); }
  }
  DZ.actions["entry-new"] = () => DZ.openEditor(null);
  DZ.actions["entry-edit"] = t => { const e = S.entries.find(x => x.id === t.dataset.id); if (e) DZ.openEditor(e); };
  DZ.actions["ed-cancel"] = () => cancelEditor();
  DZ.actions["m-add"] = () => { syncForm(); ed.data.materials.push({ name: "", qty: "", unit: "vnt." }); drawEditor(); const r = DZ.$$(".m-name"); if (r.length) r[r.length - 1].focus(); };
  DZ.actions["m-rm"] = t => { syncForm(); ed.data.materials.splice(+t.dataset.i, 1); if (!ed.data.materials.length) ed.data.materials.push({ name: "", qty: "", unit: "vnt." }); drawEditor(); };
  DZ.actions["p-rm"] = t => {
    syncForm(); const p = t.dataset.p;
    ed.data.photos = ed.data.photos.filter(x => x !== p);
    if (ed.newPhotos.has(p)) { ed.newPhotos.delete(p); DZ.removePhotos([p]); } else ed.removed.add(p);
    drawEditor();
  };
  DZ.actions["entry-del"] = t => {
    const e = S.entries.find(x => x.id === t.dataset.id); if (!e) return;
    DZ.confirm("Ištrinti įrašą?", `„${e.object || "Be pavadinimo"}“, ${DZ.longDate(e.date)}. Kartu bus pašalintos ${(e.photos || []).length} nuotraukos (Google Drive – į šiukšlinę).`, "Ištrinti", async () => {
      if (!e._pending) {
        const { data, error } = await DZ.sb.from("entries").delete().eq("id", e.id).select("id");
        if (error) {
          if (DZ.isNetErr(error)) { DZ.enqueue("delete", "entries", e.id); DZ.toast("Bus ištrinta atsiradus ryšiui."); DZ.render(); return; }
          DZ.toast("Nepavyko ištrinti: " + error.message, true); return;
        }
        if (!data || !data.length) { DZ.toast("Ištrinti nebegalima – įrašas ne šiandienos arba ne jūsų.", true); DZ.loadAll(); return; }
      } else DZ.enqueue("delete", "entries", e.id);
      S.entries = S.entries.filter(x => x.id !== e.id);
      if (e.photos && e.photos.length) DZ.removePhotos(e.photos);
      DZ.toast("Ištrinta"); DZ.render();
    });
  };

  // ---------- Nuotraukų peržiūra ----------
  let lb = null;
  DZ.lbOpen = () => !!lb;
  DZ.drawLb = () => {
    if (!lb) { $("#lb-host").innerHTML = ""; return; }
    const n = lb.photos.length;
    $("#lb-host").innerHTML = `<div class="lb" id="lb">${DZ.imgTag(lb.photos[lb.i], "", "1600")}
      <button class="close" data-act="lb-x" aria-label="Uždaryti">×</button>
      ${n > 1 ? `<button class="prev" data-act="lb-p" aria-label="Ankstesnė">‹</button><button class="next" data-act="lb-n" aria-label="Kita">›</button>` : ""}
      <span class="cnt">${lb.i + 1} / ${n}</span></div>`;
    DZ.hydratePhotos();
  };
  DZ.closeLb = () => { lb = null; DZ.drawLb(); };
  DZ.actions["photo"] = t => { const e = S.entries.find(x => x.id === t.dataset.id); if (!e) return; lb = { photos: e.photos, i: +t.dataset.i }; DZ.drawLb(); };
  DZ.actions["lb-x"] = () => DZ.closeLb();
  DZ.actions["lb-p"] = () => { lb.i = (lb.i - 1 + lb.photos.length) % lb.photos.length; DZ.drawLb(); };
  DZ.actions["lb-n"] = () => { lb.i = (lb.i + 1) % lb.photos.length; DZ.drawLb(); };
})();
