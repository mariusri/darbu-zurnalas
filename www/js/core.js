// Darbų žurnalas – branduolys: pagalbinės, būsena, duomenys, darbas be ryšio, nuotraukos.
(function () {
  "use strict";
  const DZ = window.DZ = { views: {}, actions: {}, hooks: { afterLoad: [] } };

  // ---------- Pagalbinės ----------
  DZ.MON_GEN = ["sausio","vasario","kovo","balandžio","gegužės","birželio","liepos","rugpjūčio","rugsėjo","spalio","lapkričio","gruodžio"];
  DZ.MON_NOM = ["Sausis","Vasaris","Kovas","Balandis","Gegužė","Birželis","Liepa","Rugpjūtis","Rugsėjis","Spalis","Lapkritis","Gruodis"];
  DZ.WD = ["sekmadienis","pirmadienis","antradienis","trečiadienis","ketvirtadienis","penktadienis","šeštadienis"];
  DZ.WD_S = ["Pr","An","Tr","Kt","Pn","Št","Sk"];
  DZ.UNITS = ["vnt.","m","kompl.","kg","l","m²","pak.","val."];
  DZ.BASE_MATS = ["Saulės modulis","Inverteris","Montavimo bėgis","Bėgių jungtis","Gnybtas (vidurinis)","Gnybtas (galinis)","Stogo kablys","Solarinis kabelis 6 mm²","Solarinis kabelis 4 mm²","MC4 jungtis","Kabelių kanalas","Apsaugos skydelis","DC kirtiklis","Viršįtampių ribotuvas","Įžeminimo laidas","Kabelių sąvaržos"];
  DZ.ROLES = { admin: "Administratorius", brigadininkas: "Brigadininkas", darbuotojas: "Darbuotojas" };
  DZ.OBJ_STATUS = { pasiulymas: "Pasiūlymas", sutartis: "Sutartis", montavimas: "Montavimas", prijungimas: "Prijungimas", aptarnavimas: "Aptarnavimas", baigta: "Baigta" };
  DZ.TASK_STATUS = { planuota: "Planuota", vykdoma: "Vykdoma", atlikta: "Atlikta" };
  const BUCKET = "photos";

  const $ = DZ.$ = (s, r = document) => r.querySelector(s);
  DZ.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = DZ.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = DZ.pad = n => String(n).padStart(2, "0");
  const ymd = DZ.ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = DZ.parse = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  DZ.addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  DZ.longDate = s => { const d = parse(s); return DZ.MON_GEN[d.getMonth()] + " " + d.getDate() + " d., " + DZ.WD[d.getDay()]; };
  DZ.shortDate = s => s ? s.slice(0, 4) + "." + s.slice(5, 7) + "." + s.slice(8, 10) : "";
  DZ.weekStart = s => { const d = parse(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
  DZ.today = () => ymd(new Date());
  const fmtQ = DZ.fmtQ = q => (Math.round((Number(q) || 0) * 100) / 100).toString().replace(".", ",");
  DZ.money = v => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
  DZ.num = v => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
  const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const workerHours = DZ.workerHours = w => { const a = toMin(w.from), b = toMin(w.to); if (a == null || b == null) return 0; let d = b - a; if (d < 0) d += 1440; return Math.round(d / 60 * 100) / 100; };
  DZ.entryHours = e => (e.workers && e.workers.length) ? e.workers.reduce((t, w) => t + workerHours(w), 0) : (Number(e.hours) || 0);
  const uuid = DZ.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const lsGet = DZ.lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = DZ.lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} };
  const lsJson = DZ.lsJson = (k, def) => { try { const v = JSON.parse(lsGet(k) || "null"); return v == null ? def : v; } catch (_) { return def; } };
  DZ.norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  DZ.byName = (a, b) => String(a).localeCompare(String(b), "lt");
  DZ.isNetErr = e => navigator.onLine === false || /fetch|network|load failed|timeout|offline/i.test(String(e && (e.message || e)));

  // ---------- Būsena ----------
  const state = DZ.state = {
    screen: "loading",       // setup | login | register | pending | app
    view: "day",             // day | tasks | objects | object | reports | search | users | catalog | settings
    date: DZ.today(),
    taskDate: DZ.today(),
    month: DZ.today().slice(0, 7),
    objectId: null,
    user: null,
    profile: null,
    entries: [], objects: [], tasks: [], products: [], profiles: [],
    settings: { company: { name: "UAB Elreda" }, hour_rate: { value: 0 } },
    crew: lsJson("crew", ["Linas", "Tomas", "Vilius"]),
    loaded: false, offline: false, syncErrors: []
  };
  DZ.sb = null;
  DZ.role = () => state.profile && state.profile.status === "patvirtintas" ? state.profile.role : null;
  DZ.isAdmin = () => DZ.role() === "admin";
  DZ.isLead = () => DZ.role() === "admin" || DZ.role() === "brigadininkas";
  DZ.isMine = e => !!state.user && e.userId === state.user.id;
  DZ.canEdit = e => DZ.isLead() || DZ.isMine(e);
  DZ.canDelete = e => DZ.isAdmin() || (DZ.isMine(e) && ymd(new Date(e.createdAt || Date.now())) === DZ.today());
  DZ.myName = () => (state.profile && state.profile.name) || "";
  // Ar darbuotojų sąrašo vardas – tai aš (pagal vardą profilyje)
  DZ.isMe = name => { const a = DZ.norm(DZ.myName()), b = DZ.norm(name); if (!a || !b) return false; return a === b || a.split(/\s+/)[0] === b.split(/\s+/)[0]; };

  // ---------- Pranešimai ----------
  let toastT = null;
  DZ.toast = (msg, bad) => {
    const el = $("#toast"); if (!el) return;
    el.textContent = msg; el.className = "toast" + (bad ? " bad" : ""); el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, bad ? 6000 : 2600);
  };
  DZ.setSync = t => { const el = $("#sync"); if (el) el.textContent = t; };

  // ---------- Lapai (sheet) ----------
  DZ.sheet = null; // { onClose }
  DZ.openSheet = (html, opts = {}) => {
    $("#sheet-host").innerHTML = `<div class="sheet-bg" id="sheet-bg"><${opts.form ? "form" : "div"} class="sheet" id="${opts.id || "sheet"}" novalidate>${html}</${opts.form ? "form" : "div"}></div>`;
    DZ.sheet = { onClose: opts.onClose || null };
    return $(".sheet");
  };
  DZ.closeSheet = (silent) => {
    const s = DZ.sheet; DZ.sheet = null; $("#sheet-host").innerHTML = "";
    if (s && s.onClose && !silent) s.onClose();
  };
  DZ.confirm = (title, text, yesLabel, onYes, danger = true) => {
    DZ.openSheet(`<h2>${esc(title)}</h2><p class="note">${esc(text)}</p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="button" class="btn ${danger ? "solid-danger" : "primary"}" id="cf-yes">${esc(yesLabel)}</button></div>`);
    $("#cf-yes").onclick = () => { DZ.closeSheet(true); onYes(); };
  };

  // ---------- IndexedDB (nuotraukos be ryšio) ----------
  let idbP = null;
  function idb() {
    if (!idbP) idbP = new Promise((res, rej) => {
      try {
        const r = indexedDB.open("dz", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("photos");
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return idbP;
  }
  const idbDo = (mode, fn) => idb().then(db => new Promise((res, rej) => {
    const tx = db.transaction("photos", mode); const st = tx.objectStore("photos"); const r = fn(st);
    tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error);
  }));
  DZ.idbPut = (k, blob) => idbDo("readwrite", st => st.put(blob, k));
  DZ.idbGet = k => idbDo("readonly", st => st.get(k));
  DZ.idbDel = k => idbDo("readwrite", st => st.delete(k));

  // ---------- Nuotraukos: Google Drive (gd:), senos Supabase (kelias), neįkeltos (local:) ----------
  const isDrive = DZ.isDrive = p => String(p).startsWith("gd:");
  const isLocal = DZ.isLocal = p => String(p).startsWith("local:");
  DZ.fnBase = ""; DZ.fnKey = "";
  const urlCache = new Map();
  const pending = new Set();
  let hydrating = false;
  const keyOf = (p, size) => p + "@" + (size || "");
  function cachedUrl(k) { const c = urlCache.get(k); return c && c.exp > Date.now() ? c.url : ""; }
  DZ.authHeaders = async () => {
    const { data } = await DZ.sb.auth.getSession();
    return { Authorization: "Bearer " + (data.session ? data.session.access_token : ""), apikey: DZ.fnKey };
  };
  DZ.callFn = async (query, init = {}) => {
    const r = await fetch(DZ.fnBase + query, { ...init, headers: { ...(await DZ.authHeaders()), ...(init.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  };
  function applyPhotos() {
    for (const img of document.querySelectorAll("img[data-path]")) {
      const u = cachedUrl(keyOf(img.dataset.path, img.dataset.size));
      if (u && img.getAttribute("src") !== u) img.src = u;
    }
  }
  DZ.photoBlob = async (p, size) => {
    if (isLocal(p)) { const b = await DZ.idbGet(p); if (!b) throw new Error("nėra"); return b; }
    if (isDrive(p)) {
      const r = await fetch(DZ.fnBase + "?id=" + encodeURIComponent(p.slice(3)) + "&size=" + encodeURIComponent(size || ""), { headers: await DZ.authHeaders() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.blob();
    }
    const { data, error } = await DZ.sb.storage.from(BUCKET).download(p);
    if (error) throw error;
    return data;
  };
  async function loadOne(p, size) {
    const k = keyOf(p, size);
    pending.add(k);
    try { urlCache.set(k, { url: URL.createObjectURL(await DZ.photoBlob(p, size)), exp: Infinity }); }
    catch (_) { urlCache.set(k, { url: "", exp: Date.now() + 30000 }); }
    pending.delete(k);
    applyPhotos();
  }
  DZ.hydratePhotos = async () => {
    if (!DZ.sb) return;
    applyPhotos();
    const want = new Map();
    for (const img of document.querySelectorAll("img[data-path]")) {
      const p = img.dataset.path, sz = img.dataset.size || "", k = keyOf(p, sz);
      if ((!urlCache.has(k) || urlCache.get(k).exp <= Date.now()) && !pending.has(k)) want.set(k, { p, sz });
    }
    const fetchable = [...want.values()].filter(v => isDrive(v.p) || isLocal(v.p));
    const store = [...want.values()].filter(v => !isDrive(v.p) && !isLocal(v.p));
    let i = 0;
    const worker = async () => { while (i < fetchable.length) { const v = fetchable[i++]; await loadOne(v.p, v.sz); } };
    Promise.all([worker(), worker(), worker(), worker()]);
    if (!store.length || hydrating) return;
    hydrating = true;
    try {
      const { data, error } = await DZ.sb.storage.from(BUCKET).createSignedUrls([...new Set(store.map(v => v.p))], 60 * 60 * 24);
      if (!error && data) for (const r of data) if (r.signedUrl) for (const v of store) if (v.p === r.path) urlCache.set(keyOf(v.p, v.sz), { url: r.signedUrl, exp: Date.now() + 23 * 3600 * 1000 });
    } catch (_) {}
    hydrating = false;
    applyPhotos();
  };
  DZ.uploadPhoto = async (blob, date, object) => {
    const r = await fetch(DZ.fnBase + "?date=" + encodeURIComponent(date) + "&object=" + encodeURIComponent(object || ""), {
      method: "POST", headers: { ...(await DZ.authHeaders()), "Content-Type": "image/jpeg" }, body: blob
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(j.error || ("HTTP " + r.status));
    return "gd:" + j.id;
  };
  DZ.removePhotos = async list => {
    const drive = list.filter(isDrive).map(p => p.slice(3)), local = list.filter(isLocal), store = list.filter(p => !isDrive(p) && !isLocal(p));
    for (const l of local) DZ.idbDel(l).catch(() => {});
    try { if (store.length) await DZ.sb.storage.from(BUCKET).remove(store); } catch (_) {}
    try { if (drive.length) await fetch(DZ.fnBase, { method: "DELETE", headers: { ...(await DZ.authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ ids: drive }) }); } catch (_) {}
  };
  DZ.imgTag = (p, extra = "", size = "400") => { const u = cachedUrl(keyOf(p, size)); return `<img data-path="${esc(p)}" data-size="${size}" ${u ? `src="${esc(u)}"` : ""} alt="" ${extra}>`; };

  // ---------- Duomenų eilutės ----------
  DZ.fromEntry = r => ({
    id: r.id, date: r.date, object: r.object || "", objectId: r.object_id || null, work: r.work || "",
    workers: r.workers || [], materials: r.materials || [], photos: r.photos || [],
    hours: r.hours, createdAt: Date.parse(r.created_at) || 0,
    userId: r.user_id || "", author: r.author || ""
  });
  DZ.objName = id => { const o = state.objects.find(x => x.id === id); return o ? o.name : ""; };
  DZ.findObject = name => { const n = DZ.norm(name); return n ? state.objects.find(o => DZ.norm(o.name) === n) || null : null; };
  DZ.entryObjectId = e => e.objectId || (DZ.findObject(e.object) || {}).id || null;
  DZ.findProduct = name => { const n = DZ.norm(name); return n ? state.products.find(p => DZ.norm(p.name) === n) || null : null; };
  DZ.matPrice = m => (m.price != null && m.price !== "" ? Number(m.price) : ((DZ.findProduct(m.name) || {}).price ?? null));
  DZ.hourRate = () => DZ.num((state.settings.hour_rate || {}).value);
  DZ.company = () => state.settings.company || { name: "UAB Elreda" };

  // Medžiagų suma (sujungta pagal pavadinimą ir vienetus)
  DZ.totals = list => {
    const m = new Map();
    for (const e of list) for (const x of e.materials || []) {
      if (!x.name) continue;
      const k = DZ.norm(x.name) + "|" + (x.unit || "");
      const cur = m.get(k) || { name: x.name.trim(), unit: x.unit || "", qty: 0, sum: 0, noPrice: false };
      const q = Number(x.qty) || 0, p = DZ.matPrice(x);
      cur.qty += q;
      if (p == null) cur.noPrice = true; else cur.sum += q * p;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => DZ.byName(a.name, b.name));
  };
  DZ.matTable = (mats, withPrice) => `<table class="mat-table"><tbody>${mats.map(m => {
    const p = withPrice ? (m.sum != null ? m.sum : (DZ.matPrice(m) != null ? DZ.matPrice(m) * (Number(m.qty) || 0) : null)) : null;
    return `<tr><td>${esc(m.name)}</td><td class="q">${fmtQ(m.qty)} ${esc(m.unit || "")}</td>${withPrice ? `<td class="q">${m.noPrice || p == null ? `<span class="muted">be kainos</span>` : DZ.money(p)}</td>` : ""}</tr>`;
  }).join("")}</tbody></table>`;

  // ---------- Talpykla ----------
  function saveCache() {
    lsSet("cache_entries", JSON.stringify(state.entries.filter(e => !e._pending)));
    lsSet("cache_objects", JSON.stringify(state.objects));
    lsSet("cache_tasks", JSON.stringify(state.tasks));
    lsSet("cache_products", JSON.stringify(state.products));
    lsSet("cache_settings", JSON.stringify(state.settings));
  }
  DZ.loadCache = () => {
    const c = lsJson("cache_entries", []);
    if (Array.isArray(c)) { state.entries = c; state.loaded = c.length > 0; }
    state.objects = lsJson("cache_objects", []);
    state.tasks = lsJson("cache_tasks", []);
    state.products = lsJson("cache_products", []);
    state.settings = Object.assign(state.settings, lsJson("cache_settings", {}));
    applyQueue();
  };
  DZ.clearCache = () => { for (const k of ["cache_entries", "cache_objects", "cache_tasks", "cache_products", "cache_settings", "profile", "queue"]) lsSet(k, null); };

  // ---------- Darbas be ryšio: pakeitimų eilė ----------
  // { op: "insert"|"update"|"delete", table, id, row, t }
  const queue = () => lsJson("queue", []);
  const setQueue = q => lsSet("queue", JSON.stringify(q));
  DZ.queueSize = () => queue().length;
  function applyQueue() {
    for (const q of queue()) {
      if (q.table === "entries") {
        const i = state.entries.findIndex(e => e.id === q.id);
        if (q.op === "delete") { if (i >= 0) state.entries.splice(i, 1); continue; }
        const base = i >= 0 ? state.entries[i] : { id: q.id, userId: state.user ? state.user.id : "", author: state.user ? state.user.email : "", createdAt: q.t, object: "", work: "", workers: [], materials: [], photos: [] };
        const merged = { ...base, _pending: true };
        for (const [col, key] of FIELD_MAP) if (q.row && col in q.row) merged[key] = q.row[col];
        if (i >= 0) state.entries[i] = merged; else state.entries.push(merged);
      } else if (q.table === "tasks") {
        const t = state.tasks.find(x => x.id === q.id);
        if (q.op === "update" && t) Object.assign(t, q.row, { _pending: true });
      }
    }
  }
  const FIELD_MAP = [["date", "date"], ["object", "object"], ["object_id", "objectId"], ["work", "work"], ["workers", "workers"], ["materials", "materials"], ["photos", "photos"], ["hours", "hours"]];
  DZ.enqueue = (op, table, id, row) => {
    const q = queue();
    // Sujungti su dar neišsiųstu to paties įrašo pakeitimu
    const prev = q.find(x => x.table === table && x.id === id && x.op !== "delete");
    if (op === "update" && prev) prev.row = { ...prev.row, ...row };
    else if (op === "delete" && prev && prev.op === "insert") q.splice(q.indexOf(prev), 1);
    else { if (op === "delete") for (let i = q.length - 1; i >= 0; i--) if (q[i].table === table && q[i].id === id) q.splice(i, 1); q.push({ op, table, id, row, t: Date.now() }); }
    setQueue(q);
    applyQueue();
    if (op === "delete" && table === "entries") { const i = state.entries.findIndex(e => e.id === id); if (i >= 0) state.entries.splice(i, 1); }
  };
  let flushing = false;
  DZ.flush = async () => {
    if (flushing || !DZ.sb || !state.user) return;
    flushing = true;
    let changed = false;
    try {
      while (true) {
        const q = queue(); if (!q.length) break;
        const item = q[0];
        try {
          // Neįkeltos nuotraukos
          if (item.row && Array.isArray(item.row.photos) && item.row.photos.some(isLocal)) {
            const out = [];
            for (const p of item.row.photos) {
              if (!isLocal(p)) { out.push(p); continue; }
              const blob = await DZ.idbGet(p);
              if (!blob) continue;
              const id = await DZ.uploadPhoto(blob, item.row.date || DZ.today(), item.row.object || "");
              out.push(id);
              const qq = queue(); for (const x of qq) if (x.row && Array.isArray(x.row.photos)) x.row.photos = x.row.photos.map(y => y === p ? id : y);
              setQueue(qq);
              DZ.idbDel(p).catch(() => {});
            }
            item.row.photos = out;
          }
          let res;
          if (item.op === "insert") res = await DZ.sb.from(item.table).insert({ ...item.row, id: item.id });
          else if (item.op === "update") res = await DZ.sb.from(item.table).update(item.row).eq("id", item.id);
          else res = await DZ.sb.from(item.table).delete().eq("id", item.id);
          if (res.error) {
            if (item.op === "insert" && /duplicate|23505/i.test(res.error.message + res.error.code)) { /* jau įrašyta */ }
            else if (DZ.isNetErr(res.error)) throw res.error;
            else state.syncErrors.push((item.op === "delete" ? "Ištrinti" : "Išsaugoti") + " nepavyko: " + res.error.message);
          }
        } catch (e) {
          if (DZ.isNetErr(e)) { state.offline = true; break; }
          state.syncErrors.push("Sinchronizavimo klaida: " + (e.message || e));
        }
        const cur = queue(); cur.shift(); setQueue(cur); changed = true;
      }
    } finally { flushing = false; }
    return changed;
  };

  // ---------- Duomenų įkėlimas ----------
  async function fetchAll(table, select, order, opts = {}) {
    let q = DZ.sb.from(table).select(select);
    if (order) q = q.order(order, { ascending: !!opts.asc });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  DZ.loadAll = async () => {
    if (!DZ.sb) return;
    DZ.setSync("sinchronizuojama…");
    await DZ.flush();
    try {
      const [en, ob, ta, pr, se] = await Promise.all([
        fetchAll("entries", "*", "date", { limit: 5000 }),
        fetchAll("objects", "*", "name", { asc: true }),
        fetchAll("tasks", "*", "date", { limit: 3000 }),
        fetchAll("products", "*", "name", { asc: true }),
        fetchAll("settings", "*")
      ]);
      state.entries = en.map(DZ.fromEntry);
      state.objects = ob; state.tasks = ta; state.products = pr;
      for (const s of se) state.settings[s.key] = s.value;
      state.loaded = true; state.offline = false;
      saveCache();
      applyQueue();
      DZ.setSync(DZ.queueSize() ? "laukia " + DZ.queueSize() + " pakeit." : "sinchronizuota");
    } catch (e) {
      state.loaded = true;
      if (DZ.isNetErr(e)) { state.offline = true; DZ.setSync("be ryšio"); }
      else { DZ.setSync("klaida"); state.syncErrors.push("Nepavyko gauti duomenų: " + (e.message || e)); }
    }
    for (const h of DZ.hooks.afterLoad) try { h(); } catch (_) {}
    if (!DZ.sheet) DZ.render();
  };
  DZ.loadCrew = async () => {
    try {
      const data = await fetchAll("workers", "name", "name", { asc: true });
      state.crew = data.map(r => r.name);
      lsSet("crew", JSON.stringify(state.crew));
    } catch (_) {}
  };
  DZ.loadProfiles = async () => {
    if (!DZ.isLead()) return;
    try { state.profiles = await fetchAll("profiles", "*", "created_at", { asc: true }); } catch (_) {}
  };

  // ---------- Atvaizdavimas ----------
  const TAB_OF = { day: "day", search: "day", tasks: "tasks", objects: "objects", object: "objects", reports: "reports", users: "", catalog: "", settings: "" };
  DZ.go = (view, extra) => { Object.assign(state, extra || {}); state.view = view; window.scrollTo(0, 0); DZ.render(); };
  DZ.render = () => {
    const app = state.screen === "app";
    for (const s of ["setup", "login", "register", "pending"]) { const el = $("#view-" + s); if (el) el.hidden = state.screen !== s; }
    $("#bottom-nav").hidden = !app; $("#menu-btn").hidden = !app; $("#search-btn").hidden = !app;
    document.body.classList.toggle("in-app", app);
    const host = $("#view");
    const b = $("#banner");
    const msgs = [];
    if (app && state.offline) msgs.push("Nėra ryšio. Įrašus galite kurti toliau – jie bus išsiųsti atsiradus internetui" + (DZ.queueSize() ? " (laukia: " + DZ.queueSize() + ")." : "."));
    if (app && state.syncErrors.length) msgs.push(state.syncErrors.slice(-3).join(" · ") + ` <button class="linkbtn" data-act="clear-errors">Gerai</button>`);
    b.hidden = !msgs.length; b.innerHTML = msgs.map(m => `<div>${m.includes("<button") ? m : esc(m)}</div>`).join("");
    if (!app) { host.innerHTML = ""; $("#fab").hidden = true; return; }
    const tab = TAB_OF[state.view];
    for (const btn of document.querySelectorAll("#bottom-nav button")) btn.setAttribute("aria-current", btn.dataset.tab === tab ? "page" : "false");
    const v = DZ.views[state.view] || DZ.views.day;
    host.innerHTML = v.html();
    const fab = v.fab ? v.fab() : null;
    $("#fab").hidden = !fab;
    if (fab) { $("#fab").textContent = fab.label; $("#fab").dataset.act = fab.act; }
    if (v.after) v.after();
    const adm = $("#menu-btn");
    const waiting = DZ.isAdmin() ? state.profiles.filter(p => p.status === "laukia").length : 0;
    adm.classList.toggle("dot", waiting > 0);
    DZ.hydratePhotos();
  };

  // Savaitės juosta (naudojama dienos ir užduočių rodiniuose)
  DZ.weekStrip = (sel, marks, prefix) => {
    const ws = DZ.weekStart(sel), today = DZ.today();
    const a = parse(ws), b = parse(DZ.addDays(ws, 6));
    const label = a.getMonth() === b.getMonth()
      ? DZ.MON_NOM[a.getMonth()] + " " + a.getDate() + "–" + b.getDate()
      : a.getDate() + " " + DZ.MON_GEN[a.getMonth()].slice(0, 3) + ". – " + b.getDate() + " " + DZ.MON_GEN[b.getMonth()].slice(0, 3) + ".";
    let days = "";
    for (let i = 0; i < 7; i++) {
      const s = DZ.addDays(ws, i), d = parse(s);
      const cls = ["day", marks.has(s) ? "has" : "", s === today ? "today" : ""].join(" ");
      days += `<button class="${cls}" data-act="${prefix}-date" data-v="${s}" ${s === sel ? 'aria-current="date"' : ""} aria-label="${esc(DZ.longDate(s))}"><small>${DZ.WD_S[i]}</small><b>${d.getDate()}</b><i></i></button>`;
    }
    return `<div class="week">
      <div class="week-head">
        <button class="icon-btn" data-act="${prefix}-date" data-v="${DZ.addDays(sel, -7)}" aria-label="Ankstesnė savaitė">‹</button>
        <div class="label">${esc(label)}</div>
        <input type="date" class="date-pick" data-pick="${prefix}" value="${sel}" aria-label="Pasirinkti datą">
        <button class="icon-btn" data-act="${prefix}-date" data-v="${DZ.addDays(sel, 7)}" aria-label="Kita savaitė">›</button>
      </div>
      <div class="days">${days}</div>
    </div>`;
  };

  // ---------- Failų išsaugojimas (Android: bendrinti, naršyklė: atsisiųsti) ----------
  DZ.saveFile = async (name, mime, data /* string | Blob */) => {
    const P = window.Capacitor && window.Capacitor.Plugins;
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (native && P && P.Filesystem && P.Share) {
      const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
      const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
      const w = await P.Filesystem.writeFile({ path: name, data: b64, directory: "CACHE" });
      await P.Share.share({ title: name, url: w.uri, dialogTitle: "Išsaugoti arba siųsti" });
      return;
    }
    const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };
  DZ.loadScript = src => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("nepavyko įkelti " + src));
    document.head.appendChild(s);
  });
})();
