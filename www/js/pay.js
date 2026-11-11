// Apmokėjimai (tik administratoriams): sąskaitos ir mokėjimai prie objekto, vėluojantys apmokėjimai.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc;
  S.invoices = []; S.payments = [];
  DZ.loadPay = async () => {
    if (!DZ.isAdmin() || !DZ.sb) { S.invoices = []; S.payments = []; return; }
    try {
      const [a, b] = await Promise.all([DZ.sb.from("object_invoices").select("*"), DZ.sb.from("object_payments").select("*")]);
      if (!a.error && a.data) S.invoices = a.data;
      if (!b.error && b.data) S.payments = b.data;
    } catch (_) {}
  };
  DZ.hooks.afterLoad.push(() => { DZ.loadPay().then(() => { if (["crm", "object"].includes(S.view) && !DZ.sheet) DZ.render(); }); });

  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const days = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  // Objekto suvestinė: išrašyta, gauta, liko, kiek vėluoja (mokėjimai dengia seniausias sąskaitas)
  DZ.payStats = id => {
    const inv = S.invoices.filter(x => x.object_id === id).sort((a, b) => (a.due_date || a.issue_date || "").localeCompare(b.due_date || b.issue_date || ""));
    const pays = S.payments.filter(x => x.object_id === id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const billed = r2(inv.reduce((t, x) => t + Number(x.amount || 0), 0));
    const paid = r2(pays.reduce((t, x) => t + Number(x.amount || 0), 0));
    const t = DZ.today();
    let left = paid, overdue = 0, lateSince = "", nextDue = "";
    for (const x of inv) {
      const a = Number(x.amount || 0), cover = Math.min(a, left); left -= cover;
      const open = r2(a - cover);
      if (open > 0 && x.due_date && x.due_date < t) { overdue += open; if (!lateSince) lateSince = x.due_date; }
      if (open > 0 && x.due_date && x.due_date >= t && !nextDue) nextDue = x.due_date;
    }
    return { inv, pays, billed, paid, rest: r2(billed - paid), overdue: r2(overdue), lateDays: lateSince ? days(lateSince, t) : 0, nextDue };
  };

  // ---------- Objekto kortelėje ----------
  DZ.objPayHtml = o => {
    if (!DZ.isAdmin()) return "";
    const st = DZ.payStats(o.id);
    if (!st.inv.length && !st.pays.length) {
      return `<div class="card"><div class="row-between"><span class="lbl">Apmokėjimas</span><span class="row-end tight"><button class="btn" data-act="inv-new" data-id="${esc(o.id)}">+ Sąskaita</button></span></div>
        <p class="note">Sąskaitų dar nėra.${o.contract_sum ? " Sutarties suma " + DZ.money(o.contract_sum) + "." : ""}</p></div>`;
    }
    return `<div class="card pay-card">
      <span class="lbl">Apmokėjimas</span>
      <div class="stats pay-stats">
        <div><b>${DZ.money(st.billed)}</b><span class="lbl">išrašyta</span></div>
        <div><b>${DZ.money(st.paid)}</b><span class="lbl">gauta</span></div>
        <div class="${st.overdue > 0 ? "neg" : st.rest <= 0 ? "pos" : ""}"><b>${DZ.money(Math.max(0, st.rest))}</b><span class="lbl">${st.rest < 0 ? "permoka " + DZ.money(-st.rest) : "liko"}</span></div>
      </div>
      ${st.overdue > 0 ? `<p class="pay-late">Vėluoja apmokėti ${DZ.money(st.overdue)} · ${st.lateDays} d. po termino</p>` : st.rest > 0 && st.nextDue ? `<p class="note">Apmokėti iki ${esc(DZ.shortDate(st.nextDue))}</p>` : st.rest <= 0 && st.billed > 0 ? `<p class="note">Visa suma gauta.</p>` : ""}
      <table class="mat-table pay-table"><tbody>
        ${st.inv.map(x => `<tr data-act="inv-edit" data-id="${esc(x.id)}" class="clickable"><td>Sąskaita${x.no ? " " + esc(x.no) : ""}<br><span class="muted">${x.issue_date ? esc(DZ.shortDate(x.issue_date)) : ""}${x.due_date ? " · terminas " + esc(DZ.shortDate(x.due_date)) : ""}</span></td><td class="q">${DZ.money(x.amount)}</td></tr>`).join("")}
        ${st.pays.map(x => `<tr data-act="pay-edit" data-id="${esc(x.id)}" class="clickable paid"><td>Gauta${x.note ? " · " + esc(x.note) : ""}<br><span class="muted">${esc(DZ.shortDate(x.date))}</span></td><td class="q">+ ${DZ.money(x.amount)}</td></tr>`).join("")}
      </tbody></table>
      <div class="row-end">
        <button class="btn" data-act="inv-new" data-id="${esc(o.id)}">+ Sąskaita</button>
        ${st.rest > 0 ? `<button class="btn primary" data-act="pay-new" data-id="${esc(o.id)}">+ Gautas mokėjimas</button>` : ""}
      </div>
    </div>`;
  };

  // ---------- Rytiniam vaizdui ----------
  DZ.payUnpaid = () => S.objects.map(o => ({ o, st: DZ.payStats(o.id) })).filter(x => x.st.rest > 0.004);
  const payRow = x => `<button class="obj-card pay-row${x.st.overdue > 0 ? " late" : ""}" data-act="obj-open" data-id="${esc(x.o.id)}">
      <span class="row-between"><b>${esc(x.o.name)}</b><b class="q">${DZ.money(x.st.rest)}</b></span>
      <span class="meta">${x.st.overdue > 0 ? `vėluoja ${DZ.money(x.st.overdue)} · ${x.st.lateDays} d. po termino` : x.st.nextDue ? "apmokėti iki " + esc(DZ.shortDate(x.st.nextDue)) : "terminas nenurodytas"}${x.o.client_phone ? " · " + esc(x.o.client_phone) : ""}</span>
    </button>`;
  DZ.payLateHtml = () => {
    const late = DZ.payUnpaid().filter(x => x.st.overdue > 0).sort((a, b) => b.st.lateDays - a.st.lateDays);
    return late.length ? `<h3 class="sec bad">Vėluoja apmokėti <span class="meta">${late.length} · ${DZ.money(late.reduce((t, x) => t + x.st.overdue, 0))}</span></h3><div class="obj-list">${late.map(payRow).join("")}</div>` : "";
  };
  DZ.payListHtml = () => {
    const list = DZ.payUnpaid().sort((a, b) => b.st.overdue - a.st.overdue || b.st.rest - a.st.rest);
    const tot = list.reduce((t, x) => t + x.st.rest, 0), late = list.reduce((t, x) => t + x.st.overdue, 0);
    return `<div class="card"><table class="mat-table sum"><tbody>
        <tr class="strong"><td>Laukiama gauti</td><td class="q">${DZ.money(tot)}</td></tr>
        <tr class="${late > 0 ? "neg" : ""}"><td>Iš jų vėluoja</td><td class="q">${DZ.money(late)}</td></tr>
      </tbody></table></div>
      ${list.length ? `<div class="obj-list">${list.map(payRow).join("")}</div>` : `<div class="empty"><span>Neapmokėtų sąskaitų nėra.</span></div>`}`;
  };

  // ---------- Sąskaita ----------
  function invSheet(o, x) {
    const d = x || { no: "", amount: "", issue_date: DZ.today(), due_date: DZ.addDays(DZ.today(), 14), notes: "" };
    const st = DZ.payStats(o.id);
    const suggest = !x && o.contract_sum ? Math.max(0, r2(o.contract_sum - st.billed)) : "";
    DZ.openSheet(`
      <h2>${x ? "Sąskaita" : "Nauja sąskaita"}</h2>
      <p class="note">${esc(o.name)}</p>
      <div class="row2">
        <label class="field"><span class="lbl">Sąskaitos Nr.</span><input id="i-no" value="${esc(d.no)}" autocomplete="off"></label>
        <label class="field"><span class="lbl">Suma su PVM, €</span><input id="i-sum" type="number" step="any" inputmode="decimal" value="${esc(x ? d.amount : suggest || "")}"></label>
      </div>
      <div class="row2">
        <label class="field"><span class="lbl">Išrašyta</span><input id="i-date" type="date" value="${esc(d.issue_date || "")}"></label>
        <label class="field"><span class="lbl">Apmokėti iki</span><input id="i-due" type="date" value="${esc(d.due_date || "")}"></label>
      </div>
      <label class="field"><span class="lbl">Pastaba</span><input id="i-notes" value="${esc(d.notes || "")}" placeholder="pvz. avansas 30 %" autocomplete="off"></label>
      <p class="err" id="i-err" hidden></p>
      <div class="sheet-actions">
        ${x ? `<button type="button" class="btn danger" data-act="inv-del" data-id="${esc(x.id)}" style="margin-right:auto">Ištrinti</button>` : ""}
        <button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Išsaugoti</button>
      </div>`, { form: true, id: "inv-form" });
    $("#inv-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const err = $("#i-err"), amount = DZ.num($("#i-sum").value);
      if (!(amount > 0)) { err.hidden = false; err.textContent = "Įrašykite sumą."; return; }
      const row = { object_id: o.id, no: $("#i-no").value.trim(), amount, issue_date: $("#i-date").value || null, due_date: $("#i-due").value || null, notes: $("#i-notes").value.trim() };
      const btn = $("#inv-form button[type=submit]"); btn.disabled = true;
      const res = x ? await DZ.sb.from("object_invoices").update(row).eq("id", x.id).select().single() : await DZ.sb.from("object_invoices").insert(row).select().single();
      if (res.error) { btn.disabled = false; err.hidden = false; err.textContent = (DZ.isNetErr(res.error) ? "Nėra ryšio. " : "Nepavyko: ") + res.error.message; return; }
      const i = S.invoices.findIndex(y => y.id === res.data.id); if (i >= 0) S.invoices[i] = res.data; else S.invoices.push(res.data);
      // Išrašius sąskaitą – kitas veiksmas: sulaukti mokėjimo iki termino
      const c = DZ.crmOf && DZ.crmOf(o.id);
      if (!x && DZ.crmSetNext && row.due_date && c && c.stage === "apmokejimas") await DZ.crmSetNext(o, "apmokejimas", "Patikrinti, ar gautas mokėjimas", row.due_date);
      DZ.closeSheet(true); DZ.toast("Sąskaita išsaugota"); DZ.render();
    });
  }
  DZ.actions["inv-new"] = t => { const o = S.objects.find(y => y.id === t.dataset.id); if (o) invSheet(o, null); };
  DZ.actions["inv-edit"] = t => { const x = S.invoices.find(y => y.id === t.dataset.id); const o = x && S.objects.find(y => y.id === x.object_id); if (o) invSheet(o, x); };
  DZ.actions["inv-del"] = t => {
    const x = S.invoices.find(y => y.id === t.dataset.id); if (!x) return;
    DZ.confirm("Ištrinti sąskaitą?", `${x.no ? "Nr. " + x.no + ", " : ""}${DZ.money(x.amount)}.`, "Ištrinti", async () => {
      const { error } = await DZ.sb.from("object_invoices").delete().eq("id", x.id);
      if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
      S.invoices = S.invoices.filter(y => y.id !== x.id); DZ.toast("Ištrinta"); DZ.render();
    });
  };

  // ---------- Mokėjimas ----------
  function paySheet(o, x) {
    const st = DZ.payStats(o.id);
    const d = x || { date: DZ.today(), amount: st.rest > 0 ? st.rest : "", note: "" };
    DZ.openSheet(`
      <h2>${x ? "Mokėjimas" : "Gautas mokėjimas"}</h2>
      <p class="note">${esc(o.name)}${!x ? " · liko gauti " + DZ.money(st.rest) : ""}</p>
      <div class="row2">
        <label class="field"><span class="lbl">Suma, €</span><input id="p-sum" type="number" step="any" inputmode="decimal" value="${esc(d.amount)}"></label>
        <label class="field"><span class="lbl">Data</span><input id="p-date" type="date" value="${esc(d.date || "")}"></label>
      </div>
      <label class="field"><span class="lbl">Pastaba</span><input id="p-note" value="${esc(d.note || "")}" placeholder="pvz. avansas, grynais" autocomplete="off"></label>
      <p class="err" id="p-err" hidden></p>
      <div class="sheet-actions">
        ${x ? `<button type="button" class="btn danger" data-act="pay-del" data-id="${esc(x.id)}" style="margin-right:auto">Ištrinti</button>` : ""}
        <button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Išsaugoti</button>
      </div>`, { form: true, id: "pay-form" });
    $("#pay-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const err = $("#p-err"), amount = DZ.num($("#p-sum").value);
      if (!(amount > 0)) { err.hidden = false; err.textContent = "Įrašykite sumą."; return; }
      const row = { object_id: o.id, amount, date: $("#p-date").value || DZ.today(), note: $("#p-note").value.trim() };
      const btn = $("#pay-form button[type=submit]"); btn.disabled = true;
      const res = x ? await DZ.sb.from("object_payments").update(row).eq("id", x.id).select().single() : await DZ.sb.from("object_payments").insert(row).select().single();
      if (res.error) { btn.disabled = false; err.hidden = false; err.textContent = (DZ.isNetErr(res.error) ? "Nėra ryšio. " : "Nepavyko: ") + res.error.message; return; }
      const i = S.payments.findIndex(y => y.id === res.data.id); if (i >= 0) S.payments[i] = res.data; else S.payments.push(res.data);
      DZ.closeSheet(true); DZ.toast("Mokėjimas išsaugotas"); DZ.render();
      // Visa suma gauta – pasiūlyti užbaigti
      const now = DZ.payStats(o.id), c = DZ.crmOf && DZ.crmOf(o.id);
      if (!x && now.billed > 0 && now.rest <= 0.004 && DZ.crmSetNext && (!c || c.stage !== "uzbaigta")) {
        DZ.confirm("Visa suma gauta", `„${o.name}“ – perkelti į etapą „Užbaigta“?`, "Užbaigti", async () => { await DZ.crmSetNext(o, "uzbaigta", null, null); DZ.toast("Objektas užbaigtas"); DZ.render(); }, false);
      }
    });
  }
  DZ.actions["pay-new"] = t => { const o = S.objects.find(y => y.id === t.dataset.id); if (o) paySheet(o, null); };
  DZ.actions["pay-edit"] = t => { const x = S.payments.find(y => y.id === t.dataset.id); const o = x && S.objects.find(y => y.id === x.object_id); if (o) paySheet(o, x); };
  DZ.actions["pay-del"] = t => {
    const x = S.payments.find(y => y.id === t.dataset.id); if (!x) return;
    DZ.confirm("Ištrinti mokėjimą?", `${DZ.money(x.amount)}, ${DZ.shortDate(x.date)}.`, "Ištrinti", async () => {
      const { error } = await DZ.sb.from("object_payments").delete().eq("id", x.id);
      if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
      S.payments = S.payments.filter(y => y.id !== x.id); DZ.toast("Ištrinta"); DZ.render();
    });
  };
})();
