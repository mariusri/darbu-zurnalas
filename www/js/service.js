// SMS klientui su paruoštu tekstu ir garantinės užklausos (tik administratoriams).
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc;

  // ---------- SMS ----------
  const TEMPLATES = {
    montavimas: { l: "Montavimo priminimas", t: o => `Sveiki, primename: ${o.install_date ? DZ.shortDate(o.install_date) : "{data}"} {laikas} pas Jus atvyks ${co()} montavimo brigada. Iškilus klausimams skambinkite ${phone()}.` },
    pasiulymas: { l: "Pasiūlymas išsiųstas", t: () => `Sveiki, pasiūlymą išsiuntėme el. paštu. Laukiame Jūsų atsakymo, o iškilus klausimams skambinkite ${phone()}. ${co()}` },
    baigta: { l: "Darbai baigti", t: () => `Sveiki, darbai baigti. Ačiū, kad pasirinkote ${co()}! Dėl garantinių klausimų skambinkite ${phone()}.` },
    laisvas: { l: "Laisvas tekstas", t: () => "" }
  };
  const co = () => DZ.company().name || "UAB Elreda";
  const phone = () => DZ.company().phone || "{telefonas}";
  const smsHref = (num, text) => "sms:" + num.replace(/[^\d+]/g, "") + "?body=" + encodeURIComponent(text);
  const stageTpl = o => { const c = DZ.crmOf && DZ.crmOf(o.id); return c ? ({ pasiulymas: "pasiulymas", montavimas: "montavimas", apmokejimas: "baigta", uzbaigta: "baigta" }[c.stage] || "laisvas") : "laisvas"; };

  DZ.actions["sms-open"] = t => {
    const o = S.objects.find(x => x.id === t.dataset.id); if (!o) return;
    if (!o.client_phone) { DZ.toast("Objekto kortelėje neįrašytas kliento telefonas", true); return; }
    const k0 = stageTpl(o);
    DZ.openSheet(`
      <h2>SMS klientui</h2>
      <p class="note">${esc(o.client_name || o.name)} · ${esc(o.client_phone)}</p>
      <div class="chips">${Object.entries(TEMPLATES).map(([k, v]) => `<button type="button" class="chip-btn" data-tpl="${k}" aria-pressed="${k === k0}">${esc(v.l)}</button>`).join("")}</div>
      <label class="field"><span class="lbl">Tekstas</span><textarea id="sms-text" rows="5">${esc(TEMPLATES[k0].t(o))}</textarea></label>
      <p class="note" id="sms-hint"></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><a class="btn primary" id="sms-go" href="#">Atidaryti SMS</a></div>`);
    const ta = $("#sms-text");
    const upd = () => {
      $("#sms-go").href = smsHref(o.client_phone, ta.value);
      const n = ta.value.length, left = /\{(data|laikas|telefonas)\}/.exec(ta.value);
      $("#sms-hint").textContent = (left ? `Pakeiskite „${left[0]}“ tikra reikšme. ` : "") + n + " simb." + (n > 160 ? " (bus siunčiama kaip kelios žinutės)" : "");
    };
    ta.addEventListener("input", upd); upd();
    for (const b of document.querySelectorAll("#sheet-host [data-tpl]")) b.addEventListener("click", () => {
      for (const x of document.querySelectorAll("#sheet-host [data-tpl]")) x.setAttribute("aria-pressed", x === b);
      ta.value = TEMPLATES[b.dataset.tpl].t(o); upd(); ta.focus();
    });
    $("#sms-go").addEventListener("click", () => setTimeout(() => DZ.closeSheet(true), 300));
  };

  // ---------- Garantinės užklausos ----------
  DZ.WSTATUS = { gauta: "Gauta", sprendziama: "Sprendžiama", isspresta: "Išspręsta" };
  S.warranty = [];
  DZ.loadWarranty = async () => {
    if (!DZ.isAdmin() || !DZ.sb) { S.warranty = []; return; }
    try { const { data, error } = await DZ.sb.from("object_warranty").select("*").order("date", { ascending: false }); if (!error && data) S.warranty = data; } catch (_) {}
  };
  DZ.hooks.afterLoad.push(() => { DZ.loadWarranty().then(() => { if (["crm", "object"].includes(S.view) && !DZ.sheet) DZ.render(); }); });
  const wPill = s => `<span class="pill ws-${esc(s)}">${esc(DZ.WSTATUS[s] || s)}</span>`;
  DZ.warrantyOpen = () => S.warranty.filter(w => w.status !== "isspresta");

  DZ.objWarrantyHtml = o => {
    if (!DZ.isAdmin()) return "";
    const list = S.warranty.filter(w => w.object_id === o.id);
    if (!list.length && !(o.done_date || o.status === "baigta" || o.status === "aptarnavimas")) return "";
    return `<div class="card">
      <div class="row-between"><span class="lbl">Garantija</span><button class="btn" data-act="w-new" data-id="${esc(o.id)}">+ Garantinė užklausa</button></div>
      ${list.length ? list.map(w => `<button class="date-sep sm w-item" data-act="w-edit" data-id="${esc(w.id)}"><span>${esc(DZ.shortDate(w.date))} · ${esc(w.problem)}</span>${wPill(w.status)}</button>`).join("") : `<p class="note">Garantinių užklausų nebuvo.</p>`}
    </div>`;
  };
  const wRow = w => { const o = S.objects.find(x => x.id === w.object_id); return o ? `<button class="obj-card w-row" data-act="w-edit" data-id="${esc(w.id)}">
      <span class="row-between"><b>${esc(o.name)}</b>${wPill(w.status)}</span>
      <span class="crm-next">${esc(w.problem)}</span>
      <span class="meta">gauta ${esc(DZ.shortDate(w.date))}${o.client_phone ? " · " + esc(o.client_phone) : ""}</span>
    </button>` : ""; };
  DZ.warrantyTodayHtml = () => { const l = DZ.warrantyOpen(); return l.length ? `<h3 class="sec">Garantinės užklausos <span class="meta">${l.length}</span></h3><div class="obj-list">${l.map(wRow).join("")}</div>` : ""; };
  DZ.warrantyListHtml = () => { const l = S.warranty.slice().sort((a, b) => (a.status === "isspresta") - (b.status === "isspresta") || b.date.localeCompare(a.date)); return l.length ? `<div class="obj-list">${l.map(wRow).join("")}</div>` : `<div class="empty"><span>Garantinių užklausų nėra.</span></div>`; };

  function wSheet(o, w) {
    const d = w || { date: DZ.today(), problem: "", status: "gauta", notes: "" };
    const eq = [[o.module_count ? o.module_count + " vnt." : "", o.module_type].filter(Boolean).join(" "), [o.inverter_count ? o.inverter_count + " vnt." : "", o.inverter].filter(Boolean).join(" ")].filter(Boolean);
    DZ.openSheet(`
      <h2>${w ? "Garantinė užklausa" : "Nauja garantinė užklausa"}</h2>
      <p class="note">${esc(o.name)}${o.install_date ? " · sumontuota " + esc(DZ.shortDate(o.install_date)) : o.done_date ? " · atlikta " + esc(DZ.shortDate(o.done_date)) : ""}</p>
      ${eq.length ? `<p class="note">Įranga: ${eq.map(esc).join("; ")}</p>` : ""}
      <div class="row2">
        <label class="field"><span class="lbl">Gauta</span><input type="date" id="w-date" value="${esc(d.date)}"></label>
        <label class="field"><span class="lbl">Būsena</span><select id="w-status">${Object.entries(DZ.WSTATUS).map(([k, l]) => `<option value="${k}" ${k === d.status ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span class="lbl">Problema *</span><input id="w-problem" value="${esc(d.problem)}" placeholder="pvz. inverteris rodo klaidą" autocomplete="off"></label>
      <label class="field"><span class="lbl">Pastabos, kas padaryta</span><textarea id="w-notes">${esc(d.notes || "")}</textarea></label>
      <p class="note">Nuotraukas galite įkelti objekto skiltyje „Dokumentai“.</p>
      <p class="err" id="w-err" hidden></p>
      <div class="sheet-actions">
        ${w ? `<button type="button" class="btn danger" data-act="w-del" data-id="${esc(w.id)}" style="margin-right:auto">Ištrinti</button>` : ""}
        ${w && DZ.newTask ? `<button type="button" class="btn" data-act="w-task" data-id="${esc(w.id)}">Užduotis brigadai</button>` : ""}
        <button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Išsaugoti</button>
      </div>`, { form: true, id: "w-form" });
    $("#w-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const err = $("#w-err"), problem = $("#w-problem").value.trim();
      if (!problem) { err.hidden = false; err.textContent = "Aprašykite problemą."; return; }
      const status = $("#w-status").value;
      const row = { object_id: o.id, date: $("#w-date").value || DZ.today(), problem, status, notes: $("#w-notes").value.trim(), solved_date: status === "isspresta" ? (w && w.solved_date) || DZ.today() : null };
      const btn = $("#w-form button[type=submit]"); btn.disabled = true;
      const res = w ? await DZ.sb.from("object_warranty").update(row).eq("id", w.id).select().single() : await DZ.sb.from("object_warranty").insert(row).select().single();
      if (res.error) { btn.disabled = false; err.hidden = false; err.textContent = (DZ.isNetErr(res.error) ? "Nėra ryšio. " : "Nepavyko: ") + res.error.message; return; }
      const i = S.warranty.findIndex(x => x.id === res.data.id); if (i >= 0) S.warranty[i] = res.data; else S.warranty.unshift(res.data);
      DZ.closeSheet(true); DZ.toast("Išsaugota"); DZ.render();
    });
    if (!w) setTimeout(() => $("#w-problem").focus(), 50);
  }
  const wOf = t => S.warranty.find(x => x.id === t.dataset.id);
  DZ.actions["w-new"] = t => { const o = S.objects.find(x => x.id === t.dataset.id); if (o) wSheet(o, null); };
  DZ.actions["w-edit"] = t => { const w = wOf(t), o = w && S.objects.find(x => x.id === w.object_id); if (o) wSheet(o, w); };
  DZ.actions["w-task"] = async t => {
    const w = wOf(t), o = w && S.objects.find(x => x.id === w.object_id); if (!o) return;
    if (w.status === "gauta") {
      const r = await DZ.sb.from("object_warranty").update({ status: "sprendziama" }).eq("id", w.id).select().single();
      if (!r.error) Object.assign(w, r.data);
    }
    DZ.closeSheet(true);
    DZ.newTask({ date: DZ.addDays(DZ.today(), 1), object_id: o.id, title: "Garantinis: " + w.problem, description: [o.address, o.client_phone ? "Klientas: " + [o.client_name, o.client_phone].filter(Boolean).join(", ") : "", w.notes].filter(Boolean).join("\n") });
  };
  DZ.actions["w-del"] = t => {
    const w = wOf(t); if (!w) return;
    DZ.confirm("Ištrinti garantinę užklausą?", `„${w.problem}“, ${DZ.shortDate(w.date)}.`, "Ištrinti", async () => {
      const { error } = await DZ.sb.from("object_warranty").delete().eq("id", w.id);
      if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
      S.warranty = S.warranty.filter(x => x.id !== w.id); DZ.toast("Ištrinta"); DZ.render();
    });
  };
})();
