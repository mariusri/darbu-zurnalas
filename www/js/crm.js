// CRM (tik administratoriams): objekto etapas, kitas veiksmas su atsakingu ir terminu, rytinis vaizdas „Šiandien“.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc;
  DZ.STAGES = { uzklausa: "Užklausa", pasiulymas: "Pasiūlymas", montavimas: "Montavimas", apmokejimas: "Apmokėjimas", uzbaigta: "Užbaigta", atsaukta: "Atšaukta" };
  const ACTIVE = ["uzklausa", "pasiulymas", "montavimas", "apmokejimas"];
  DZ.SOURCES = { skambutis: "Skambutis", rekomendacija: "Rekomendacija", facebook: "Facebook", svetaine: "Svetainė", kita: "Kita" };
  // Objekto būsena (sąrašui ir kalendoriui) pagal etapą
  const STATUS_OF = { uzklausa: "uzklausa", pasiulymas: "pasiulymas", montavimas: "montavimas", uzbaigta: "baigta", atsaukta: "atsaukta" };
  const DATE_OF = { pasiulymas: "offer_date", montavimas: "install_date", uzbaigta: "done_date" };

  // Darbo dienos (be šeštadienių ir sekmadienių)
  const addBD = (s, n) => { let d = s; while (n > 0) { d = DZ.addDays(d, 1); const w = new Date(d + "T12:00:00").getDay(); if (w !== 0 && w !== 6) n--; } return d; };
  const AUTO = {
    uzklausa: o => ({ a: "Susisiekti su klientu ir paruošti pasiūlymą", d: addBD(DZ.today(), 1) }),
    pasiulymas: o => ({ a: "Pasiteirauti dėl sprendimo", d: addBD(DZ.today(), 3) }),
    montavimas: (o, inst) => ({ a: "Paruošti įrangą ir perduoti brigadai objekto informaciją", d: inst && inst > DZ.today() ? DZ.addDays(inst, -1) : addBD(DZ.today(), 1) }),
    apmokejimas: o => ({ a: "Išrašyti sąskaitą ir patikrinti, ar gautas mokėjimas", d: addBD(DZ.today(), 1) }),
    uzbaigta: () => ({ a: "", d: "" }),
    atsaukta: () => ({ a: "", d: "" })
  };

  S.crm = [];
  DZ.crmOf = id => S.crm.find(c => c.object_id === id) || null;
  DZ.loadCrm = async () => {
    if (!DZ.isAdmin() || !DZ.sb) { S.crm = []; return; }
    try { const { data, error } = await DZ.sb.from("object_crm").select("*"); if (!error && data) S.crm = data; } catch (_) {}
  };
  DZ.hooks.afterLoad.push(() => { DZ.loadCrm().then(() => { if (["crm", "object"].includes(S.view) && !DZ.sheet) DZ.render(); }); });

  const owners = () => {
    const names = S.profiles.filter(p => p.role === "admin" && p.status === "patvirtintas" && p.name).map(p => p.name);
    if (DZ.myName() && !names.includes(DZ.myName())) names.push(DZ.myName());
    return [...new Set(names)];
  };
  const defOwner = () => owners().find(n => /^marius/i.test(n)) || DZ.myName() || owners()[0] || "";
  const stagePill = s => `<span class="pill stg-${esc(s)}">${esc(DZ.STAGES[s] || s)}</span>`;
  const dueTxt = d => { if (!d) return ""; const t = DZ.today(); if (d === t) return "šiandien"; if (d === DZ.addDays(t, 1)) return "rytoj"; return DZ.shortDate(d); };

  function crmRow(c, o) {
    const late = c.next_due && c.next_due < DZ.today() && ACTIVE.includes(c.stage);
    return `<article class="crm-row${late ? " late" : ""}">
      <button class="crm-main" data-act="obj-open" data-id="${esc(o.id)}">
        <span class="row-between"><b>${esc(o.name)}</b>${stagePill(c.stage)}</span>
        ${c.next_action ? `<span class="crm-next">${esc(c.next_action)}</span>` : `<span class="note">Kitas veiksmas nenurodytas</span>`}
        <span class="meta">${[c.next_owner, c.next_due ? (late ? "vėluoja nuo " : "iki ") + dueTxt(c.next_due) : "", o.client_phone].filter(Boolean).map(esc).join(" · ")}</span>
      </button>
      <div class="crm-acts">
        ${o.client_phone ? `<a class="btn" href="tel:${esc(o.client_phone.replace(/\s/g, ""))}">Skambinti</a>` : ""}
        <button class="btn primary" data-act="crm-done" data-id="${esc(o.id)}">Atlikta</button>
      </div>
    </article>`;
  }

  // ---------- Rytinis vaizdas ----------
  const v = { stage: "" };
  DZ.views.crm = {
    fab: () => ({ label: "+ Užklausa", act: "crm-new" }),
    html() {
      const objs = new Map(S.objects.map(o => [o.id, o]));
      const rows = S.crm.map(c => ({ c, o: objs.get(c.object_id) })).filter(x => x.o);
      const t = DZ.today(), wk = DZ.addDays(t, 7);
      const count = s => rows.filter(x => x.c.stage === s).length;
      const chips = `<div class="chips">${Object.entries(DZ.STAGES).map(([k, l]) => `<button class="chip-btn stg" data-act="crm-stage" data-v="${k}" aria-pressed="${v.stage === k}">${esc(l)} · ${count(k)}</button>`).join("")}${DZ.payUnpaid ? `<button class="chip-btn stg" data-act="crm-stage" data-v="neapmoketa" aria-pressed="${v.stage === "neapmoketa"}">Neapmokėta · ${DZ.payUnpaid().length}</button>` : ""}${DZ.warrantyOpen ? `<button class="chip-btn stg" data-act="crm-stage" data-v="garantija" aria-pressed="${v.stage === "garantija"}">Garantija · ${DZ.warrantyOpen().length}</button>` : ""}</div>`;
      let body;
      if (v.stage === "neapmoketa" && DZ.payListHtml) body = DZ.payListHtml();
      else if (v.stage === "garantija" && DZ.warrantyListHtml) body = DZ.warrantyListHtml();
      else if (v.stage) {
        const list = rows.filter(x => x.c.stage === v.stage).sort((a, b) => (a.c.next_due || "9").localeCompare(b.c.next_due || "9") || DZ.byName(a.o.name, b.o.name));
        body = list.length ? `<div class="stack">${list.map(x => crmRow(x.c, x.o)).join("")}</div>` : `<div class="empty"><span>Šiame etape objektų nėra.</span></div>`;
      } else {
        const act = rows.filter(x => ACTIVE.includes(x.c.stage));
        const by = (a, b) => (a.c.next_due || "").localeCompare(b.c.next_due || "") || DZ.byName(a.o.name, b.o.name);
        const late = act.filter(x => x.c.next_due && x.c.next_due < t).sort(by);
        const today = act.filter(x => x.c.next_due === t).sort(by);
        const soon = act.filter(x => x.c.next_due > t && x.c.next_due <= wk).sort(by);
        const none = act.filter(x => !x.c.next_due).sort(by);
        const sec = (title, list, cls = "") => list.length ? `<h3 class="sec ${cls}">${title} <span class="meta">${list.length}</span></h3><div class="stack">${list.map(x => crmRow(x.c, x.o)).join("")}</div>` : "";
        const payLate = (DZ.payLateHtml ? DZ.payLateHtml() : "") + (DZ.warrantyTodayHtml ? DZ.warrantyTodayHtml() : "");
        body = !S.loaded ? `<p class="status">Kraunama…</p>` : (payLate || late.length || today.length || soon.length || none.length)
          ? payLate + sec("Vėluoja", late, "bad") + sec("Šiandien", today) + sec("Artimiausios 7 dienos", soon) + sec("Be termino", none)
          : `<div class="empty"><strong>Šiandien darbų nėra</strong><span>${rows.length ? "Visi veiksmai suplanuoti vėlesnėms dienoms." : "Naują užklausą įveskite mygtuku „+ Užklausa“, o esamą objektą įtraukite jo kortelėje (skiltis „Etapas“)."}</span></div>`;
      }
      return `<section class="stack16">
        <div class="view-head"><h2>Šiandien</h2><span class="meta">${esc(DZ.longDate(t))}</span></div>
        <div class="card">${chips}${v.stage ? `<button class="linkbtn" data-act="crm-stage" data-v="">‹ Rodyti šiandienos darbus</button>` : ""}</div>
        ${body}
      </section>`;
    }
  };
  DZ.actions["crm-stage"] = t => { v.stage = v.stage === t.dataset.v ? "" : t.dataset.v; DZ.render(); };

  // ---------- Objekto kortelėje ----------
  DZ.objCrmHtml = o => {
    if (!DZ.isAdmin()) return "";
    const c = DZ.crmOf(o.id);
    const steps = ["uzklausa", "pasiulymas", "montavimas", "apmokejimas", "uzbaigta"];
    const cur = c ? c.stage : "";
    const idx = steps.indexOf(cur);
    return `<div class="card crm-card">
      <div class="row-between"><span class="lbl">Etapas</span>${c && c.source ? `<span class="meta">${esc(DZ.SOURCES[c.source] || c.source)}</span>` : ""}</div>
      <div class="stage-bar">${steps.map((s, i) => `<button data-act="crm-move" data-id="${esc(o.id)}" data-v="${s}" class="${i < idx ? "past" : ""}" aria-pressed="${s === cur}">${esc(DZ.STAGES[s])}</button>`).join("")}</div>
      ${cur === "atsaukta" ? `<p class="note"><b>Atšaukta</b>${c.cancel_reason ? ": " + esc(c.cancel_reason) : ""}</p>` : ""}
      ${c ? (c.next_action ? `<div class="crm-next-box${c.next_due && c.next_due < DZ.today() && ACTIVE.includes(cur) ? " late" : ""}"><b>${esc(c.next_action)}</b><span class="meta">${[c.next_owner, c.next_due ? "iki " + dueTxt(c.next_due) : ""].filter(Boolean).map(esc).join(" · ")}</span></div>` : ACTIVE.includes(cur) ? `<p class="note">Kitas veiksmas nenurodytas.</p>` : "")
        : `<p class="note">Objektas dar neįtrauktas į CRM. Pasirinkite etapą.</p>`}
      <div class="row-end">
        ${o.client_phone ? `<button class="btn" data-act="sms-open" data-id="${esc(o.id)}">SMS</button>` : ""}
        ${c && cur !== "atsaukta" ? `<button class="btn" data-act="crm-move" data-id="${esc(o.id)}" data-v="atsaukta">Klientas atsisakė</button>` : ""}
        ${c ? `<button class="btn" data-act="crm-edit" data-id="${esc(o.id)}">Keisti</button>` : ""}
        ${c && ACTIVE.includes(cur) ? `<button class="btn primary" data-act="crm-done" data-id="${esc(o.id)}">Atlikta</button>` : ""}
      </div>
    </div>`;
  };

  // ---------- Etapo / kito veiksmo langas ----------
  function openCrmSheet(o, stage, title) {
    const c = DZ.crmOf(o.id) || {};
    const changing = stage !== c.stage;
    const auto = AUTO[stage](o, o.install_date);
    const d = {
      action: changing ? auto.a : (title === "done" ? "" : c.next_action || ""),
      due: changing ? auto.d : (title === "done" ? "" : c.next_due || ""),
      owner: c.next_owner || defOwner()
    };
    const own = owners();
    const head = title === "done" ? "Veiksmas atliktas – kas toliau?" : changing ? `Etapas: ${DZ.STAGES[stage]}` : "Kitas veiksmas";
    DZ.openSheet(`
      <h2>${esc(head)}</h2>
      <p class="note">${esc(o.name)}</p>
      <label class="field"><span class="lbl">Etapas</span><select id="c-stage">${Object.entries(DZ.STAGES).map(([k, l]) => `<option value="${k}" ${k === stage ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field" id="c-inst-f" ${stage === "montavimas" ? "" : "hidden"}><span class="lbl">Montavimo data</span><input type="date" id="c-inst" value="${esc(o.install_date || "")}"></label>
      <label class="field" id="c-why-f" ${stage === "atsaukta" ? "" : "hidden"}><span class="lbl">Kodėl atsisakė</span><input id="c-why" value="${esc(c.cancel_reason || "")}" placeholder="pvz. per brangu, pasirinko kitą" autocomplete="off"></label>
      <div id="c-next-f" ${["uzbaigta", "atsaukta"].includes(stage) ? "hidden" : ""}>
        <label class="field"><span class="lbl">Kitas veiksmas</span><input id="c-act" value="${esc(d.action)}" placeholder="pvz. Paskambinti klientui" autocomplete="off"></label>
        <div class="row2">
          <label class="field"><span class="lbl">Atsakingas</span><input id="c-own" list="c-own-l" value="${esc(d.owner)}" autocomplete="off"></label>
          <label class="field"><span class="lbl">Terminas</span><input type="date" id="c-due" value="${esc(d.due)}"></label>
        </div>
        <datalist id="c-own-l">${own.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      </div>
      <label class="field"><span class="lbl">Iš kur atėjo klientas</span><select id="c-src"><option value="">–</option>${Object.entries(DZ.SOURCES).map(([k, l]) => `<option value="${k}" ${k === c.source ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <p class="err" id="c-err" hidden></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Išsaugoti</button></div>`, { form: true, id: "crm-form" });
    let touched = false;
    $("#c-act").addEventListener("input", () => { touched = true; });
    const refill = () => {
      const s = $("#c-stage").value;
      $("#c-inst-f").hidden = s !== "montavimas"; $("#c-why-f").hidden = s !== "atsaukta";
      $("#c-next-f").hidden = ["uzbaigta", "atsaukta"].includes(s);
      if (!touched || !$("#c-act").value) { const a = AUTO[s](o, $("#c-inst").value); $("#c-act").value = a.a; $("#c-due").value = a.d; touched = false; }
    };
    $("#c-stage").addEventListener("change", refill);
    $("#c-inst").addEventListener("change", () => { if ($("#c-stage").value === "montavimas" && !touched) refill(); });
    $("#crm-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const s = $("#c-stage").value, closed = ["uzbaigta", "atsaukta"].includes(s);
      const row = {
        object_id: o.id, stage: s, source: $("#c-src").value || null,
        next_action: closed ? null : $("#c-act").value.trim() || null,
        next_owner: closed ? null : $("#c-own").value.trim() || null,
        next_due: closed ? null : $("#c-due").value || null,
        cancel_reason: s === "atsaukta" ? $("#c-why").value.trim() || null : null,
        updated_at: new Date().toISOString()
      };
      if (s !== c.stage) row.stage_at = DZ.today();
      const btn = $("#crm-form button[type=submit]"); btn.disabled = true;
      const res = await DZ.sb.from("object_crm").upsert(row).select().single();
      if (res.error) { btn.disabled = false; const e = $("#c-err"); e.hidden = false; e.textContent = (DZ.isNetErr(res.error) ? "Nėra ryšio. " : "Nepavyko: ") + res.error.message; return; }
      const i = S.crm.findIndex(x => x.object_id === o.id); if (i >= 0) S.crm[i] = res.data; else S.crm.push(res.data);
      // Objekto būsena ir datos kalendoriui
      const upd = {};
      if (s !== c.stage && STATUS_OF[s]) upd.status = STATUS_OF[s];
      if (s === "montavimas" && $("#c-inst").value) upd.install_date = $("#c-inst").value;
      else if (s !== c.stage && DATE_OF[s] && !o[DATE_OF[s]]) upd[DATE_OF[s]] = DZ.today();
      if (Object.keys(upd).length) {
        const r = await DZ.sb.from("objects").update(upd).eq("id", o.id).select().single();
        if (!r.error) { const j = S.objects.findIndex(x => x.id === o.id); if (j >= 0) S.objects[j] = r.data; }
      }
      DZ.closeSheet(true); DZ.toast("Išsaugota"); DZ.render();
    });
  }
  // Etapo / kito veiksmo nustatymas iš kitų modulių (pvz. apmokėjimų)
  DZ.crmSetNext = async (o, stage, action, due) => {
    const c = DZ.crmOf(o.id) || {}, closed = ["uzbaigta", "atsaukta"].includes(stage);
    const row = { object_id: o.id, stage, source: c.source || null, next_action: closed ? null : action, next_owner: closed ? null : (c.next_owner || defOwner() || null), next_due: closed ? null : due, cancel_reason: c.cancel_reason || null, updated_at: new Date().toISOString() };
    if (stage !== c.stage) row.stage_at = DZ.today();
    const res = await DZ.sb.from("object_crm").upsert(row).select().single();
    if (res.error) { DZ.toast("Etapo išsaugoti nepavyko: " + res.error.message, true); return; }
    const i = S.crm.findIndex(x => x.object_id === o.id); if (i >= 0) S.crm[i] = res.data; else S.crm.push(res.data);
    if (stage !== c.stage) {
      const upd = {}; if (STATUS_OF[stage]) upd.status = STATUS_OF[stage];
      if (DATE_OF[stage] && !o[DATE_OF[stage]]) upd[DATE_OF[stage]] = DZ.today();
      if (Object.keys(upd).length) { const r = await DZ.sb.from("objects").update(upd).eq("id", o.id).select().single(); if (!r.error) { const j = S.objects.findIndex(x => x.id === o.id); if (j >= 0) S.objects[j] = r.data; } }
    }
  };
  const objOf = t => S.objects.find(x => x.id === t.dataset.id);
  DZ.actions["crm-move"] = t => { const o = objOf(t); if (o) openCrmSheet(o, t.dataset.v); };
  DZ.actions["crm-edit"] = t => { const o = objOf(t); if (o) openCrmSheet(o, (DZ.crmOf(o.id) || {}).stage || "uzklausa"); };
  DZ.actions["crm-done"] = t => { const o = objOf(t); if (o) openCrmSheet(o, (DZ.crmOf(o.id) || {}).stage || "uzklausa", "done"); };

  // ---------- Nauja užklausa ----------
  DZ.actions["crm-new"] = () => {
    const own = owners();
    const inp = (id, label, type = "text", extra = "") => `<label class="field"><span class="lbl">${label}</span><input id="${id}" type="${type}" ${extra}></label>`;
    DZ.openSheet(`
      <h2>Nauja užklausa</h2>
      ${inp("n-name", "Pavadinimas *", "text", 'placeholder="pvz. Šilalė · 10 kW elektrinė" autocomplete="off"')}
      <div class="row2">${inp("n-client", "Klientas", "text", 'autocomplete="off"')}${inp("n-phone", "Telefonas", "tel")}</div>
      ${inp("n-addr", "Objekto adresas", "text", 'autocomplete="off"')}
      <div class="row2">${inp("n-kw", "Pageidaujama galia, kW", "number", 'step="any" inputmode="decimal"')}
        <label class="field"><span class="lbl">Iš kur atėjo</span><select id="n-src"><option value="">–</option>${Object.entries(DZ.SOURCES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label></div>
      <label class="field"><span class="lbl">Atsakingas</span><input id="n-own" list="n-own-l" value="${esc(defOwner())}" autocomplete="off"></label>
      <datalist id="n-own-l">${own.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      <label class="field"><span class="lbl">Pastabos</span><textarea id="n-notes" placeholder="Ko nori klientas"></textarea></label>
      <p class="note">Kitas veiksmas bus sukurtas automatiškai: „${esc(AUTO.uzklausa().a)}“, terminas ${esc(DZ.shortDate(AUTO.uzklausa().d))}.</p>
      <p class="err" id="n-err" hidden></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Sukurti</button></div>`, { form: true, id: "crm-new-form" });
    $("#crm-new-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const err = $("#n-err"), val = id => $("#" + id).value.trim();
      const name = val("n-name");
      if (!name) { err.hidden = false; err.textContent = "Įrašykite pavadinimą."; return; }
      if (DZ.findObject(name)) { err.hidden = false; err.textContent = "Objektas tokiu pavadinimu jau yra – atidarykite jį ir pasirinkite etapą."; return; }
      const btn = $("#crm-new-form button[type=submit]"); btn.disabled = true;
      const r = await DZ.sb.from("objects").insert({ name, client_name: val("n-client"), client_phone: val("n-phone"), address: val("n-addr"), power_kw: val("n-kw") ? DZ.num(val("n-kw")) : null, notes: val("n-notes"), status: "uzklausa" }).select().single();
      if (r.error) { btn.disabled = false; err.hidden = false; err.textContent = (DZ.isNetErr(r.error) ? "Nėra ryšio. " : "Nepavyko: ") + r.error.message; return; }
      S.objects.push(r.data);
      const a = AUTO.uzklausa();
      const c = await DZ.sb.from("object_crm").insert({ object_id: r.data.id, stage: "uzklausa", source: $("#n-src").value || null, next_action: a.a, next_owner: val("n-own") || null, next_due: a.d, stage_at: DZ.today() }).select().single();
      if (!c.error) S.crm.push(c.data); else DZ.toast("Objektas sukurtas, bet etapo išsaugoti nepavyko: " + c.error.message, true);
      DZ.closeSheet(true); DZ.toast("Užklausa sukurta"); DZ.render();
    });
    setTimeout(() => $("#n-name").focus(), 50);
  };
})();
