// Objektai ir klientai: sąrašas, kortelė su istorija ir savikaina, redagavimas.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc, fmtQ = DZ.fmtQ;
  const f = { text: "", status: "aktyvus" };

  DZ.objEntries = id => S.entries.filter(e => DZ.entryObjectId(e) === id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  DZ.objStats = (list) => {
    const hours = list.reduce((t, e) => t + DZ.entryHours(e), 0);
    const tot = DZ.totals(list);
    const mat = tot.reduce((t, m) => t + m.sum, 0);
    const noPrice = tot.filter(m => m.noPrice).length;
    const labour = hours * DZ.hourRate();
    const photos = list.reduce((t, e) => t + (e.photos || []).length, 0);
    return { hours, tot, mat, noPrice, labour, cost: mat + labour, photos, days: new Set(list.map(e => e.date)).size };
  };
  const statusPill = s => `<span class="pill st-${esc(s)}">${esc(DZ.OBJ_STATUS[s] || s)}</span>`;

  DZ.views.objects = {
    fab: () => ({ label: "+ Objektas", act: "obj-new" }),
    html() {
      const words = DZ.norm(f.text).split(/\s+/).filter(Boolean);
      const list = S.objects.filter(o => {
        if (f.status === "aktyvus" && o.status === "baigta") return false;
        if (f.status !== "aktyvus" && f.status !== "visi" && o.status !== f.status) return false;
        const hay = DZ.norm([o.name, o.address, o.client_name, o.client_phone, o.inverter].join(" "));
        return words.every(w => hay.includes(w));
      });
      const lastDate = {};
      for (const e of S.entries) { const id = DZ.entryObjectId(e); if (id && (!lastDate[id] || e.date > lastDate[id])) lastDate[id] = e.date; }
      list.sort((a, b) => (lastDate[b.id] || "").localeCompare(lastDate[a.id] || "") || DZ.byName(a.name, b.name));
      return `<section class="stack16">
        <div class="view-head"><h2>Objektai</h2><span class="meta">${list.length}</span></div>
        <div class="card">
          <input id="o-q" type="search" placeholder="Ieškoti: pavadinimas, adresas, klientas" value="${esc(f.text)}" autocomplete="off">
          <div class="chips">${[["aktyvus", "Aktyvūs"], ...Object.entries(DZ.OBJ_STATUS), ["visi", "Visi"]].map(([k, v]) => `<button class="chip-btn" data-act="o-filter" data-v="${k}" aria-pressed="${f.status === k}">${esc(v)}</button>`).join("")}</div>
        </div>
        ${!S.loaded ? `<p class="status">Kraunama…</p>` : list.length ? `<div class="obj-list">${list.map(o => `<button class="obj-card" data-act="obj-open" data-id="${esc(o.id)}">
            <span class="row-between"><b>${esc(o.name)}</b>${statusPill(o.status)}</span>
            ${o.address || o.client_name ? `<span class="note">${esc([o.address, o.client_name].filter(Boolean).join(" · "))}</span>` : ""}
            <span class="meta">${o.power_kw ? fmtQ(o.power_kw) + " kW · " : ""}${lastDate[o.id] ? "paskutinis įrašas " + esc(DZ.shortDate(lastDate[o.id])) : "įrašų nėra"}</span>
          </button>`).join("")}</div>` : `<div class="empty"><strong>Objektų nerasta</strong><span>Objektas sukuriamas automatiškai, kai įraše įrašote naują pavadinimą, arba spauskite „+ Objektas“.</span></div>`}
      </section>`;
    },
    after() {
      let t = null;
      $("#o-q").addEventListener("input", ev => { clearTimeout(t); t = setTimeout(() => { f.text = ev.target.value; DZ.render(); const i = $("#o-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    }
  };
  DZ.actions["o-filter"] = t => { f.status = t.dataset.v; DZ.render(); };
  DZ.actions["obj-open"] = t => DZ.go("object", { objectId: t.dataset.id });

  DZ.views.object = {
    fab: () => ({ label: "+ Įrašas", act: "obj-entry" }),
    html() {
      const o = S.objects.find(x => x.id === S.objectId);
      if (!o) return `<section class="stack16"><div class="view-head"><button class="icon-btn" data-act="back" aria-label="Atgal">‹</button><h2>Objektas nerastas</h2></div></section>`;
      const list = DZ.objEntries(o.id);
      const st = DZ.objStats(list);
      const rate = DZ.hourRate();
      const tasks = S.tasks.filter(t => t.object_id === o.id && t.status !== "atlikta").sort((a, b) => a.date.localeCompare(b.date));
      const row = (l, v) => v ? `<tr><td class="muted">${l}</td><td>${v}</td></tr>` : "";
      return `<section class="stack16">
        <div class="view-head"><button class="icon-btn" data-act="back" aria-label="Atgal">‹</button><h2>${esc(o.name)}</h2>${statusPill(o.status)}</div>
        <div class="card">
          <table class="info"><tbody>
            ${row("Adresas", esc(o.address))}
            ${row("Klientas", esc(o.client_name))}
            ${row("Telefonas", o.client_phone ? `<a href="tel:${esc(o.client_phone.replace(/\s/g, ""))}">${esc(o.client_phone)}</a>` : "")}
            ${row("El. paštas", o.client_email ? `<a href="mailto:${esc(o.client_email)}">${esc(o.client_email)}</a>` : "")}
            ${row("Galia", o.power_kw ? fmtQ(o.power_kw) + " kW" : "")}
            ${row("Saulės moduliai", [o.module_count ? o.module_count + " vnt." : "", esc(o.module_type)].filter(Boolean).join(" "))}
            ${row("Inverteris", [o.inverter_count ? o.inverter_count + " vnt." : "", esc(o.inverter)].filter(Boolean).join(" "))}
            ${row("Sutartis", [o.contract_no ? "Nr. " + esc(o.contract_no) : "", o.contract_date ? DZ.shortDate(o.contract_date) : "", o.contract_sum ? DZ.money(o.contract_sum) : ""].filter(Boolean).join(" · "))}
          </tbody></table>
          ${o.notes ? `<p class="work">${esc(o.notes)}</p>` : ""}
          <div class="row-end">
            ${o.address ? `<a class="btn" href="https://maps.google.com/?q=${encodeURIComponent(o.address)}" target="_blank" rel="noopener">Žemėlapis</a>` : ""}
            ${DZ.isLead() ? `<button class="btn" data-act="obj-edit" data-id="${esc(o.id)}">Redaguoti</button>` : ""}
            <button class="btn primary" data-act="pdf-open" data-id="${esc(o.id)}">PDF aktas</button>
          </div>
        </div>
        <div class="card">
          <div class="stats">
            <div><b>${st.days}</b><span class="lbl">darbo d.</span></div>
            <div><b>${fmtQ(st.hours)}</b><span class="lbl">valandos</span></div>
            <div><b>${list.length}</b><span class="lbl">įrašai</span></div>
            <div><b>${st.photos}</b><span class="lbl">nuotraukos</span></div>
          </div>
          <table class="mat-table sum"><tbody>
            <tr><td>Medžiagos${st.noPrice ? ` <span class="muted">(${st.noPrice} be kainos)</span>` : ""}</td><td class="q">${DZ.money(st.mat)}</td></tr>
            <tr><td>Darbas${rate ? ` <span class="muted">(${fmtQ(st.hours)} val. × ${DZ.money(rate)})</span>` : ` <span class="muted">(įkainis nenustatytas)</span>`}</td><td class="q">${DZ.money(st.labour)}</td></tr>
            <tr class="strong"><td>Savikaina</td><td class="q">${DZ.money(st.cost)}</td></tr>
            ${o.contract_sum ? `<tr><td>Sutarties suma</td><td class="q">${DZ.money(o.contract_sum)}</td></tr>
            <tr class="strong ${o.contract_sum - st.cost < 0 ? "neg" : "pos"}"><td>Skirtumas</td><td class="q">${DZ.money(o.contract_sum - st.cost)}</td></tr>` : ""}
          </tbody></table>
        </div>
        ${st.tot.length ? `<div class="card"><span class="lbl">Sunaudotos medžiagos</span>${DZ.matTable(st.tot, true)}</div>` : ""}
        ${tasks.length ? `<div class="card"><span class="lbl">Suplanuotos užduotys</span>${tasks.map(t => `<button class="date-sep sm" data-act="go-tasks" data-v="${t.date}">${esc(DZ.shortDate(t.date))} ${esc(t.title)} <span>${esc(DZ.TASK_STATUS[t.status])} ›</span></button>`).join("")}</div>` : ""}
        <h3 class="sec">Darbų istorija</h3>
        <div class="entries">${list.length ? list.map(e => DZ.entryHtml(e, { showDate: true, noObjLink: true })).join("") : `<div class="empty"><span>Šiam objektui įrašų dar nėra.</span></div>`}</div>
      </section>`;
    }
  };
  DZ.actions["obj-entry"] = () => { const o = S.objects.find(x => x.id === S.objectId); DZ.openEditor(null, { date: DZ.today(), object: o ? o.name : "" }); };

  function openObjEditor(o) {
    const d = o || { name: "", address: "", client_name: "", client_phone: "", client_email: "", power_kw: "", module_type: "", module_count: "", inverter: "", inverter_count: "", contract_no: "", contract_date: "", contract_sum: "", status: "sutartis", notes: "" };
    const lead = DZ.isLead();
    const inp = (id, label, val, type = "text", extra = "") => `<label class="field"><span class="lbl">${label}</span><input id="${id}" type="${type}" value="${esc(val ?? "")}" ${extra}></label>`;
    DZ.openSheet(`
      <h2>${o ? "Redaguoti objektą" : "Naujas objektas"}</h2>
      ${inp("o-name", "Pavadinimas *", d.name, "text", 'required autocomplete="off"')}
      ${inp("o-addr", "Adresas", d.address)}
      <div class="row2">${inp("o-cname", "Klientas", d.client_name)}${inp("o-cphone", "Telefonas", d.client_phone, "tel")}</div>
      ${inp("o-cmail", "Kliento el. paštas", d.client_email, "email")}
      ${inp("o-kw", "Galia, kW", d.power_kw, "number", 'step="any" inputmode="decimal"')}
      <div class="row-q">${inp("o-mtype", "Saulės modulių tipas", d.module_type, "text", 'placeholder="pvz. LONGI Solar LR7-54HVH-485M"')}${inp("o-mcount", "Kiekis, vnt.", d.module_count, "number", 'step="1" min="0" inputmode="numeric"')}</div>
      <div class="row-q">${inp("o-inv", "Inverteris", d.inverter, "text", 'placeholder="pvz. SOLIS S6-EH3P10K-H-EU"')}${inp("o-icount", "Kiekis, vnt.", d.inverter_count, "number", 'step="1" min="0" inputmode="numeric"')}</div>
      ${lead || !o ? `${inp("o-cno", "Sutarties Nr. (bus akte)", d.contract_no)}<div class="row2">${inp("o-cdate", "Sutarties data", d.contract_date, "date")}${inp("o-csum", "Sutarties suma, €", d.contract_sum, "number", 'step="any" inputmode="decimal"')}</div>` : ""}
      <label class="field"><span class="lbl">Būsena</span><select id="o-status">${Object.entries(DZ.OBJ_STATUS).map(([k, v]) => `<option value="${k}" ${k === d.status ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="field"><span class="lbl">Pastabos</span><textarea id="o-notes">${esc(d.notes)}</textarea></label>
      <p class="err" id="o-err" hidden></p>
      <div class="sheet-actions">
        ${o && DZ.isAdmin() ? `<button type="button" class="btn danger" data-act="obj-del" data-id="${esc(o.id)}" style="margin-right:auto">Ištrinti</button>` : ""}
        <button type="button" class="btn" data-act="close">Atšaukti</button>
        <button type="submit" class="btn primary">Išsaugoti</button>
      </div>`, { form: true, id: "obj-form" });
    $("#obj-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const err = $("#o-err");
      const v = id => ($("#" + id) ? $("#" + id).value.trim() : undefined);
      const row = {
        name: v("o-name"), address: v("o-addr"), client_name: v("o-cname"), client_phone: v("o-cphone"), client_email: v("o-cmail"),
        power_kw: v("o-kw") ? DZ.num(v("o-kw")) : null, module_type: v("o-mtype"), module_count: v("o-mcount") ? Math.round(DZ.num(v("o-mcount"))) : null, inverter: v("o-inv"), inverter_count: v("o-icount") ? Math.round(DZ.num(v("o-icount"))) : null, status: v("o-status"), notes: $("#o-notes").value.trim(), updated_at: new Date().toISOString()
      };
      if ($("#o-cdate")) { row.contract_no = v("o-cno"); row.contract_date = v("o-cdate") || null; row.contract_sum = v("o-csum") ? DZ.num(v("o-csum")) : null; }
      if (!row.name) { err.hidden = false; err.textContent = "Įrašykite pavadinimą."; return; }
      const dup = DZ.findObject(row.name);
      if (dup && (!o || dup.id !== o.id)) { err.hidden = false; err.textContent = "Objektas tokiu pavadinimu jau yra."; return; }
      const btn = $("#obj-form button[type=submit]"); btn.disabled = true;
      const res = o ? await DZ.sb.from("objects").update(row).eq("id", o.id).select().single() : await DZ.sb.from("objects").insert(row).select().single();
      if (res.error) { btn.disabled = false; err.hidden = false; err.textContent = (DZ.isNetErr(res.error) ? "Nėra ryšio. " : "Nepavyko išsaugoti: ") + res.error.message; return; }
      // Pervadinus – atnaujinti įrašų pavadinimą (jei leidžia teisės)
      if (o && o.name !== row.name && DZ.isLead()) await DZ.sb.from("entries").update({ object: row.name }).eq("object_id", o.id);
      DZ.closeSheet(true);
      const i = S.objects.findIndex(x => x.id === res.data.id);
      if (i >= 0) S.objects[i] = res.data; else S.objects.push(res.data);
      DZ.toast("Išsaugota");
      if (!o) DZ.go("object", { objectId: res.data.id }); else DZ.loadAll();
    });
    setTimeout(() => { if (!o) $("#o-name").focus(); }, 50);
  }
  DZ.actions["obj-new"] = () => openObjEditor(null);
  DZ.actions["obj-edit"] = t => openObjEditor(S.objects.find(x => x.id === t.dataset.id));
  DZ.actions["obj-del"] = t => {
    const o = S.objects.find(x => x.id === t.dataset.id); if (!o) return;
    const n = DZ.objEntries(o.id).length;
    DZ.confirm("Ištrinti objektą?", `„${o.name}“. Įrašai (${n}) neištrinami – jie liks su tuo pačiu pavadinimu, bet be kortelės.`, "Ištrinti", async () => {
      const { error } = await DZ.sb.from("objects").delete().eq("id", o.id);
      if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
      S.objects = S.objects.filter(x => x.id !== o.id);
      DZ.toast("Ištrinta"); DZ.go("objects");
    });
  };
})();
