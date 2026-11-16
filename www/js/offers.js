// Komerciniai pasiūlymai (tik administratoriams): eilutės iš katalogo, šablonai, PDF klientui.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc, fmtQ = DZ.fmtQ;
  const UNITS = ["vnt.", "kW", "kompl.", "m", "m²", "val.", "pak.", "kg", "l"];
  S.offers = []; S.offerTpls = [];

  DZ.loadOffers = async () => {
    if (!DZ.isAdmin() || !DZ.sb) { S.offers = []; S.offerTpls = []; return; }
    try {
      const [a, b] = await Promise.all([
        DZ.sb.from("offers").select("*").order("date", { ascending: false }),
        DZ.sb.from("offer_templates").select("*").order("name", { ascending: true })
      ]);
      if (!a.error && a.data) S.offers = a.data;
      if (!b.error && b.data) S.offerTpls = b.data;
    } catch (_) {}
  };
  DZ.hooks.afterLoad.push(() => { DZ.loadOffers().then(() => { if (["object", "offer-tpls"].includes(S.view) && !DZ.sheet) DZ.render(); }); });

  // ---------- Skaičiavimas ----------
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const lineSum = l => r2(DZ.num(l.qty) * DZ.num(l.price));
  DZ.offerCalc = d => {
    const sub = r2((d.lines || []).reduce((t, l) => t + lineSum(l), 0));
    const disc = r2(DZ.num(d.discount));
    const net = r2(sub - disc);
    const vat = r2(net * DZ.num(d.vat) / 100);
    return { sub, disc, net, vat, total: r2(net + vat) };
  };
  const kwTitle = o => o && o.power_kw ? `Saulės elektrinė ${fmtQ(o.power_kw)} kW` : "Saulės elektrinė";
  const fillTitle = (t, o) => String(t || "").replace(/\{kW\}/g, o && o.power_kw ? fmtQ(o.power_kw) : "").replace(/\s{2,}/g, " ").trim();

  // Šablono eilučių kiekiai pritaikomi objektui: per "kW" → objekto galia, per "mod" → modulių skaičius
  const PER = { kW: "kiekis = objekto galia", mod: "kiekis = modulių sk." };
  const perOf = (l, o) => o && o.module_count && DZ.num(l.qty) === Number(o.module_count) ? "mod" : o && o.power_kw && DZ.num(l.qty) === Number(o.power_kw) ? "kW" : l.unit === "kW" ? "kW" : "";
  function adaptLines(lines, o) {
    return (lines || []).map(l => {
      const x = { name: l.name || "", qty: l.qty ?? "", unit: l.unit || "vnt.", price: l.price ?? "", desc: l.desc || "", per: l.per || (l.unit === "kW" ? "kW" : "") };
      if (o && x.per === "kW" && o.power_kw) x.qty = o.power_kw;
      else if (o && x.per === "mod" && o.module_count) x.qty = o.module_count;
      return x;
    });
  }
  // Eilutės iš objekto kortelės (moduliai, inverteris)
  function objectLines(o) {
    const out = [];
    const pr = n => { const p = DZ.findProduct(n); return p ? p.price : ""; };
    if (o.module_type) out.push({ name: o.module_type, qty: o.module_count || "", unit: "vnt.", price: pr(o.module_type), desc: "" });
    if (o.inverter) out.push({ name: o.inverter, qty: o.inverter_count || 1, unit: "vnt.", price: pr(o.inverter), desc: "" });
    return out;
  }

  // ---------- Objekto kortelėje ----------
  DZ.objOffersHtml = o => {
    if (!DZ.isAdmin()) return "";
    const list = S.offers.filter(x => x.object_id === o.id);
    return `<div class="card">
      <div class="row-between"><span class="lbl">Pasiūlymai</span><button class="btn" data-act="offer-new" data-id="${esc(o.id)}">+ Pasiūlymas</button></div>
      ${list.length ? `<table class="mat-table pay-table"><tbody>${list.map(x => `<tr data-act="offer-edit" data-id="${esc(x.id)}" class="clickable">
          <td>Nr. ${esc(x.no)} · ${esc(x.title || "Be pavadinimo")}<br><span class="muted">${esc(DZ.shortDate(x.date))}${x.valid_until ? " · galioja iki " + esc(DZ.shortDate(x.valid_until)) : ""}</span></td>
          <td class="q">${DZ.money(x.total)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="note">Pasiūlymų dar nėra.${S.offerTpls.length ? " Galite pradėti nuo šablono." : ""}</p>`}
    </div>`;
  };

  // ---------- Redaktorius (pasiūlymas arba šablonas) ----------
  const lineRow = (l, i) => `<div class="of-row" data-i="${i}" data-per="${esc(l.per || "")}">
      <input class="of-name" list="of-prod" placeholder="Prekė ar darbas" value="${esc(l.name)}" aria-label="Pavadinimas">
      <input class="of-qty" type="number" step="any" min="0" inputmode="decimal" placeholder="Kiekis" value="${esc(l.qty)}" aria-label="Kiekis">
      <select class="of-unit" aria-label="Vienetai">${UNITS.map(u => `<option ${u === (l.unit || "vnt.") ? "selected" : ""}>${u}</option>`).join("")}</select>
      <input class="of-price" type="number" step="any" inputmode="decimal" placeholder="Kaina be PVM" value="${esc(l.price)}" aria-label="Vieneto kaina be PVM, €">
      <button type="button" class="icon-btn of-rm" aria-label="Pašalinti eilutę">×</button>
      <input class="of-desc" placeholder="Aprašymas (nebūtina)" value="${esc(l.desc)}" aria-label="Aprašymas">
      <span class="of-sum"></span>
    </div>`;

  function readLines() {
    return DZ.$$("#of-lines .of-row").map(r => ({
      name: $(".of-name", r).value.trim(), qty: $(".of-qty", r).value === "" ? "" : DZ.num($(".of-qty", r).value),
      unit: $(".of-unit", r).value, price: $(".of-price", r).value === "" ? "" : DZ.num($(".of-price", r).value), desc: $(".of-desc", r).value.trim(), ...(r.dataset.per ? { per: r.dataset.per } : {})
    })).filter(l => l.name);
  }
  function readForm() {
    const v = id => ($("#" + id) ? $("#" + id).value : "");
    return {
      title: v("of-title").trim(), date: v("of-date") || DZ.today(), valid_until: v("of-valid") || null,
      show_prices: $("#of-show").checked, vat: v("of-vat") === "" ? 21 : DZ.num(v("of-vat")), discount: DZ.num(v("of-disc")),
      lines: readLines(), notes: v("of-notes").trim(), name: v("of-tname").trim()
    };
  }
  function recalc() {
    for (const r of DZ.$$("#of-lines .of-row")) {
      const s = lineSum({ qty: $(".of-qty", r).value, price: $(".of-price", r).value });
      $(".of-sum", r).textContent = [r.dataset.per && !$("#of-tot") ? PER[r.dataset.per] : "", s ? DZ.money(s) : ""].filter(Boolean).join(" · ");
    }
    const box = $("#of-tot"); if (!box) return;
    const c = DZ.offerCalc(readForm());
    box.innerHTML = `<table class="mat-table sum"><tbody>
      <tr><td>Suma be PVM</td><td class="q">${DZ.money(c.sub)}</td></tr>
      ${c.disc ? `<tr><td>Nuolaida</td><td class="q">− ${DZ.money(c.disc)}</td></tr><tr><td>Po nuolaidos</td><td class="q">${DZ.money(c.net)}</td></tr>` : ""}
      <tr><td>PVM ${fmtQ(DZ.num($("#of-vat").value || 21))} %</td><td class="q">${DZ.money(c.vat)}</td></tr>
      <tr class="strong"><td>Iš viso su PVM</td><td class="q">${DZ.money(c.total)}</td></tr>
    </tbody></table>`;
  }
  function setLines(lines) {
    $("#of-lines").innerHTML = (lines.length ? lines : [{ name: "", qty: "", unit: "vnt.", price: "", desc: "" }]).map(lineRow).join("");
    recalc();
  }

  // mode: "offer" | "tpl"
  function openEditor(mode, o, x) {
    const tpl = mode === "tpl";
    const last = !tpl && !x ? S.offers[0] : null;
    const d = x ? { ...x, lines: x.lines || [] } : tpl
      ? { name: "", title: "Saulės elektrinė {kW} kW", show_prices: false, lines: [], notes: "" }
      : { title: kwTitle(o), date: DZ.today(), valid_until: DZ.addDays(DZ.today(), 30), show_prices: false, vat: 21, discount: 0, lines: objectLines(o), notes: last ? last.notes : "" };
    const prods = S.products.filter(p => p.active !== false);
    DZ.openSheet(`
      <h2>${tpl ? (x ? "Redaguoti šabloną" : "Naujas šablonas") : x ? `Pasiūlymas Nr. ${esc(x.no)}` : "Naujas pasiūlymas"}</h2>
      ${!tpl ? `<p class="note">${esc(o.name)}${o.client_name ? " · " + esc(o.client_name) : ""}</p>` : ""}
      ${tpl ? `<label class="field"><span class="lbl">Šablono pavadinimas *</span><input id="of-tname" value="${esc(d.name)}" placeholder="pvz. 10 kW ant stogo" autocomplete="off"></label>` : ""}
      ${!tpl && S.offerTpls.length ? `<div class="of-tpl"><select id="of-tpl-sel" aria-label="Šablonas"><option value="">Pasirinkite šabloną…</option>${S.offerTpls.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select><button type="button" class="btn" id="of-tpl-use">Užpildyti</button></div>` : ""}
      <label class="field"><span class="lbl">Antraštė${tpl ? " ({kW} – objekto galia)" : ""}</span><input id="of-title" value="${esc(d.title)}"></label>
      ${!tpl ? `<div class="row2"><label class="field"><span class="lbl">Data</span><input type="date" id="of-date" value="${esc(d.date)}"></label>
        <label class="field"><span class="lbl">Galioja iki</span><input type="date" id="of-valid" value="${esc(d.valid_until || "")}"></label></div>` : ""}
      <div class="field"><span class="lbl">Eilutės (kainos be PVM)</span>
        <datalist id="of-prod">${prods.map(p => `<option value="${esc(p.name)}"></option>`).join("")}</datalist>
        <div id="of-lines" class="of-lines"></div>
        <div class="row-between">
          <button type="button" class="btn" id="of-add">+ Eilutė</button>
          ${!tpl && (o.module_type || o.inverter) ? `<button type="button" class="linkbtn" id="of-fromobj">Moduliai ir inverteris iš kortelės</button>` : ""}
        </div>
        ${tpl ? `<p class="note">Pritaikant šabloną eilučių su vienetais „kW“ kiekis pakeičiamas objekto galia. Kuriant šabloną iš pasiūlymo įsimenama ir tai, kurių eilučių kiekis lygus modulių skaičiui – jis pakeičiamas modulių skaičiumi iš kortelės.</p>` : ""}
      </div>
      <label class="w-who"><input type="checkbox" id="of-show" ${d.show_prices ? "checked" : ""}><span>Rodyti klientui kiekvienos eilutės kainą (kitaip – viena kaina, eilutės „Įskaičiuota“)</span></label>
      ${!tpl ? `<div class="row2"><label class="field"><span class="lbl">Nuolaida, € be PVM</span><input id="of-disc" type="number" step="any" inputmode="decimal" value="${esc(d.discount || "")}" placeholder="0"></label>
        <label class="field"><span class="lbl">PVM, %</span><input id="of-vat" type="number" step="any" inputmode="decimal" value="${esc(d.vat ?? 21)}"></label></div>
        <div id="of-tot"></div>` : ""}
      <label class="field"><span class="lbl">Pastabos klientui (sąlygos, terminai, garantija)</span><textarea id="of-notes" rows="4" placeholder="pvz. Montavimo terminas – iki 4 savaičių nuo avanso. Avansas 30 %.">${esc(d.notes)}</textarea></label>
      <p class="err" id="of-err" hidden></p>
      <div class="sheet-actions of-actions">
        ${x ? `<button type="button" class="btn danger" id="of-del">Ištrinti</button>` : ""}
        ${!tpl ? `<button type="button" class="btn" id="of-astpl">Kaip šabloną</button>` : ""}
        <button type="button" class="btn" data-act="close">Atšaukti</button>
        <button type="submit" class="btn${tpl ? " primary" : ""}">Išsaugoti</button>
        ${!tpl ? `<button type="button" class="btn primary" id="of-pdf">PDF</button>` : ""}
      </div>`, { form: true, id: "offer-form" });
    setLines(d.lines);

    const form = $("#offer-form");
    form.addEventListener("input", ev => {
      if (ev.target.classList.contains("of-name")) {
        const r = ev.target.closest(".of-row"), p = DZ.findProduct(ev.target.value);
        if (p && $(".of-price", r).value === "") { $(".of-price", r).value = p.price ?? ""; if (UNITS.includes(p.unit)) $(".of-unit", r).value = p.unit; }
      }
      recalc();
    });
    form.addEventListener("change", recalc);
    form.addEventListener("click", ev => {
      const rm = ev.target.closest(".of-rm");
      if (rm) { rm.closest(".of-row").remove(); if (!$("#of-lines .of-row")) setLines([]); else recalc(); }
    });
    $("#of-add").onclick = () => {
      $("#of-lines").insertAdjacentHTML("beforeend", lineRow({ name: "", qty: "", unit: "vnt.", price: "", desc: "" }, 0));
      const n = DZ.$$("#of-lines .of-name"); n[n.length - 1].focus();
    };
    if ($("#of-fromobj")) $("#of-fromobj").onclick = () => setLines([...objectLines(o), ...readLines().filter(l => !objectLines(o).some(m => DZ.norm(m.name) === DZ.norm(l.name)))]);
    if ($("#of-tpl-use")) $("#of-tpl-use").onclick = () => {
      const t = S.offerTpls.find(y => y.id === $("#of-tpl-sel").value); if (!t) return;
      if (t.title) $("#of-title").value = fillTitle(t.title, o);
      $("#of-show").checked = !!t.show_prices;
      if (t.notes) $("#of-notes").value = t.notes;
      setLines(adaptLines(t.lines, o));
    };
    const err = m => { const e = $("#of-err"); e.hidden = !m; e.textContent = m || ""; };

    async function save() {
      const f = readForm();
      if (tpl) {
        if (!f.name) { err("Įrašykite šablono pavadinimą."); return null; }
        const row = { name: f.name, title: f.title, show_prices: f.show_prices, lines: f.lines, notes: f.notes, updated_at: new Date().toISOString() };
        const res = x ? await DZ.sb.from("offer_templates").update(row).eq("id", x.id).select().single() : await DZ.sb.from("offer_templates").insert(row).select().single();
        if (res.error) { err((DZ.isNetErr(res.error) ? "Nėra ryšio. " : "Nepavyko išsaugoti: ") + res.error.message); return null; }
        const i = S.offerTpls.findIndex(y => y.id === res.data.id); if (i >= 0) S.offerTpls[i] = res.data; else S.offerTpls.push(res.data);
        S.offerTpls.sort((a, b) => DZ.byName(a.name, b.name));
        return res.data;
      }
      if (!f.lines.length) { err("Pridėkite bent vieną eilutę."); return null; }
      const c = DZ.offerCalc(f);
      const row = { object_id: o.id, title: f.title, date: f.date, valid_until: f.valid_until, show_prices: f.show_prices, vat: f.vat, discount: f.discount, lines: f.lines, notes: f.notes, total: c.total, updated_at: new Date().toISOString() };
      if (!x) row.author = DZ.myName() || (S.user ? S.user.email : "");
      const res = x ? await DZ.sb.from("offers").update(row).eq("id", x.id).select().single() : await DZ.sb.from("offers").insert(row).select().single();
      if (res.error) { err((DZ.isNetErr(res.error) ? "Nėra ryšio. " : "Nepavyko išsaugoti: ") + res.error.message); return null; }
      const i = S.offers.findIndex(y => y.id === res.data.id); if (i >= 0) S.offers[i] = res.data; else S.offers.unshift(res.data);
      S.offers.sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
      x = res.data;
      return res.data;
    }
    const busy = on => DZ.$$("#offer-form .sheet-actions button").forEach(b => { b.disabled = on; });

    form.addEventListener("submit", async ev => {
      ev.preventDefault(); err(""); busy(true);
      const r = await save(); busy(false);
      if (!r) return;
      DZ.closeSheet(true); DZ.toast(tpl ? "Šablonas išsaugotas" : "Pasiūlymas išsaugotas"); DZ.render();
    });
    if ($("#of-pdf")) $("#of-pdf").onclick = async () => {
      err(""); busy(true);
      const r = await save();
      if (!r) { busy(false); return; }
      try { await exportPdf(o, r, m => err(m)); DZ.closeSheet(true); DZ.render(); }
      catch (e) { busy(false); err("Nepavyko sukurti PDF: " + (e.message || e)); }
    };
    if ($("#of-astpl")) $("#of-astpl").onclick = () => {
      const f = readForm();
      DZ.closeSheet(true);
      // Kiekiai išsaugomi kaip yra; antraštėje galia pakeičiama {kW}
      const t = { name: "", title: o.power_kw ? f.title.replace(fmtQ(o.power_kw), "{kW}") : f.title, show_prices: f.show_prices, lines: f.lines.map(l => ({ ...l, per: perOf(l, o) })), notes: f.notes };
      openTplFrom(t);
    };
    if ($("#of-del")) $("#of-del").onclick = () => {
      DZ.confirm(tpl ? "Ištrinti šabloną?" : "Ištrinti pasiūlymą?", tpl ? `„${x.name}“.` : `Nr. ${x.no} „${x.title}“. Atkurti nebus galima.`, "Ištrinti", async () => {
        const { error } = await DZ.sb.from(tpl ? "offer_templates" : "offers").delete().eq("id", x.id);
        if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
        if (tpl) S.offerTpls = S.offerTpls.filter(y => y.id !== x.id); else S.offers = S.offers.filter(y => y.id !== x.id);
        DZ.toast("Ištrinta"); DZ.render();
      });
    };
  }
  // Naujas šablonas iš pasiūlymo (dar neišsaugotas)
  function openTplFrom(t) { openEditor("tpl", null, null); $("#of-title").value = t.title; $("#of-show").checked = t.show_prices; $("#of-notes").value = t.notes; setLines(t.lines); $("#of-tname").focus(); }

  DZ.actions["offer-new"] = t => { const o = S.objects.find(y => y.id === t.dataset.id); if (o) openEditor("offer", o, null); };
  DZ.actions["offer-edit"] = t => { const x = S.offers.find(y => y.id === t.dataset.id); const o = x && S.objects.find(y => y.id === x.object_id); if (x && o) openEditor("offer", o, x); };

  // ---------- Šablonų sąrašas (meniu) ----------
  DZ.views["offer-tpls"] = {
    fab: () => ({ label: "+ Šablonas", act: "tpl-new" }),
    html() {
      return `<section class="stack16">
        <div class="view-head"><button class="icon-btn" data-act="back" aria-label="Atgal">‹</button><h2>Pasiūlymų šablonai</h2><span class="meta">${S.offerTpls.length}</span></div>
        ${S.offerTpls.length ? `<div class="obj-list">${S.offerTpls.map(t => {
          const n = (t.lines || []).length;
          return `<button class="obj-card" data-act="tpl-edit" data-id="${esc(t.id)}"><b>${esc(t.name)}</b><span class="meta">${n} eil.${t.show_prices ? " · rodomos eilučių kainos" : " · viena kaina"}</span></button>`;
        }).join("")}</div>`
        : `<div class="empty"><strong>Šablonų dar nėra</strong><span>Sukurkite šabloną čia arba pasiūlyme spauskite „Kaip šabloną“. Šablonas užpildo eilutes, pastabas ir antraštę.</span></div>`}
      </section>`;
    }
  };
  DZ.actions["tpl-new"] = () => openEditor("tpl", null, null);
  DZ.actions["tpl-edit"] = t => { const x = S.offerTpls.find(y => y.id === t.dataset.id); if (x) openEditor("tpl", null, x); };

  // ---------- PDF ----------
  let fonts = null;
  async function b64(url) {
    const r = await fetch(url); if (!r.ok) throw new Error("nerastas " + url);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function loadLibs(progress) {
    if (!window.jspdf) { progress("Įkeliama PDF biblioteka…"); await DZ.loadScript("vendor/jspdf.umd.min.js"); }
    if (!fonts) { progress("Įkeliamas šriftas…"); fonts = await Promise.all(["DejaVuSans", "DejaVuSans-Bold"].map(n => b64("vendor/" + n + ".ttf"))); }
  }

  DZ.offerPdf = async (o, x, progress = () => {}) => {
    await loadLibs(progress);
    progress("Kuriamas PDF…");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addFileToVFS("S.ttf", fonts[0]); doc.addFont("S.ttf", "S", "normal");
    doc.addFileToVFS("S-B.ttf", fonts[1]); doc.addFont("S-B.ttf", "S", "bold");
    const W = 210, H = 297, ML = 16, MR = 16, CW = W - ML - MR, BOT = H - 20;
    const ACC = [31, 111, 92], INK = [28, 33, 38], MUT = [105, 112, 120], SOFT = [238, 244, 241];
    const font = (st = "normal", sz = 9.5, col = INK) => { doc.setFont("S", st); doc.setFontSize(sz); doc.setTextColor(...col); };
    let y = 0;
    const need = h => { if (y + h > BOT) { doc.addPage(); y = 18; return true; } return false; };
    const money = v => DZ.money(v).replace(/ /g, " ");
    const c = DZ.company();
    const calc = DZ.offerCalc(x);
    const lines = x.lines || [];

    // Antraštės juosta
    doc.setFillColor(...ACC); doc.rect(0, 0, W, 34, "F");
    font("bold", 17, [255, 255, 255]); doc.text(c.name || "UAB Elreda", ML, 15);
    font("normal", 8.5, [222, 238, 232]);
    const contact = [c.address, c.phone ? "Tel. " + c.phone : "", c.email].filter(Boolean);
    contact.forEach((t, i) => doc.text(t, W - MR, 10 + i * 4.4, { align: "right" }));
    const ids = [c.code ? "Įm. k. " + c.code : "", c.vat ? "PVM k. " + c.vat : ""].filter(Boolean).join(" · ");
    if (ids) doc.text(ids, ML, 22);
    font("bold", 10, [255, 255, 255]); doc.text("Saulės elektrinės – projektavimas ir montavimas", ML, 28.5);
    y = 46;

    // Pasiūlymo ir kliento blokai
    font("bold", 15); doc.text("Komercinis pasiūlymas", ML, y);
    font("normal", 9.5, MUT); doc.text("Nr. " + x.no, ML, y + 6);
    doc.text("Data: " + DZ.shortDate(x.date), ML, y + 11);
    if (x.valid_until) doc.text("Galioja iki: " + DZ.shortDate(x.valid_until), ML, y + 16);
    const RX = 118;
    font("bold", 8, MUT); doc.text("KLIENTAS", RX, y - 4.5);
    const cl = [[o.client_name || o.name, "bold"], [o.address, "normal"], [o.client_phone ? "Tel. " + o.client_phone : "", "normal"], [o.client_email, "normal"]].filter(r => r[0]);
    let cy = y;
    for (const [t, st] of cl) { font(st, st === "bold" ? 10.5 : 9.5); const ls = doc.splitTextToSize(t, W - MR - RX); doc.text(ls, RX, cy); cy += ls.length * 4.6 + 0.6; }
    y = Math.max(y + 27, cy + 6);

    // Viena kaina – antraštė yra pirmoji lentelės eilutė, atskirai nekartojama
    if (x.title && x.show_prices) { font("bold", 12.5); const ls = doc.splitTextToSize(x.title, CW); doc.text(ls, ML, y); y += ls.length * 5.6 + 3; }

    // Lentelė
    const C = { name: ML + 2, qty: ML + 112, price: ML + 146, sum: ML + CW - 2 };
    const head = () => {
      doc.setFillColor(...SOFT); doc.rect(ML, y - 4.6, CW, 7, "F");
      font("bold", 8.5, MUT);
      doc.text("PAVADINIMAS", C.name, y); doc.text("KIEKIS", C.qty, y, { align: "right" });
      doc.text("KAINA BE PVM", C.price, y, { align: "right" }); doc.text("SUMA BE PVM", C.sum, y, { align: "right" });
      y += 7;
    };
    const rule = () => { doc.setDrawColor(222, 226, 230); doc.setLineWidth(0.2); doc.line(ML, y - 3.2, ML + CW, y - 3.2); };
    head();
    const qtyTxt = l => l.qty === "" || l.qty == null ? "" : fmtQ(l.qty) + " " + (l.unit || "");
    if (x.show_prices) {
      lines.forEach((l, i) => {
        font("bold", 9.5); const nl = doc.splitTextToSize(`${i + 1}. ${l.name}`, 104);
        font("normal", 8.5); const dl = l.desc ? doc.splitTextToSize(l.desc, 104) : [];
        const h = nl.length * 4.6 + dl.length * 3.9 + 3;
        if (need(h)) head();
        font("bold", 9.5); doc.text(nl, C.name, y);
        font("normal", 9.5); doc.text(qtyTxt(l), C.qty, y, { align: "right" });
        doc.text(l.price === "" ? "" : money(l.price), C.price, y, { align: "right" });
        doc.text(money(lineSum(l)), C.sum, y, { align: "right" });
        if (dl.length) { font("normal", 8.5, MUT); doc.text(dl, C.name, y + nl.length * 4.6); }
        y += h; rule();
      });
    } else {
      // Viena kaina: pagrindinė eilutė + „Įskaičiuota“
      const kw = Number(o.power_kw) || 0;
      font("bold", 10.5); const tl = doc.splitTextToSize(x.title || "Saulės elektrinė", 104);
      need(tl.length * 5 + 4);
      doc.text(tl, C.name, y);
      font("normal", 9.5);
      if (kw) { doc.text(fmtQ(kw) + " kW", C.qty, y, { align: "right" }); doc.text(money(calc.sub / kw) + "/kW", C.price, y, { align: "right" }); }
      else doc.text("1 kompl.", C.qty, y, { align: "right" });
      font("bold", 10.5); doc.text(money(calc.sub), C.sum, y, { align: "right" });
      y += tl.length * 5 + 3;
      font("bold", 8.5, MUT); need(6); doc.text("Įskaičiuota:", C.name, y); y += 5;
      for (const l of lines) {
        font("normal", 9.5); const nl = doc.splitTextToSize("•  " + l.name, 104);
        font("normal", 8.5); const dl = l.desc ? doc.splitTextToSize(l.desc, 100) : [];
        const h = nl.length * 4.5 + dl.length * 3.9 + 1.8;
        if (need(h)) head();
        font("normal", 9.5); doc.text(nl, C.name, y); doc.text(qtyTxt(l), C.qty, y, { align: "right" });
        if (dl.length) { font("normal", 8.5, MUT); doc.text(dl, C.name + 4, y + nl.length * 4.5); }
        y += h;
      }
      y += 1.5; rule();
    }

    // Sumos
    y += 3;
    const tot = [["Suma be PVM", money(calc.sub)]];
    if (calc.disc) tot.push(["Nuolaida", "− " + money(calc.disc)], ["Po nuolaidos", money(calc.net)]);
    tot.push([`PVM ${fmtQ(x.vat)} %`, money(calc.vat)]);
    need(tot.length * 5.5 + 14);
    const TX = ML + 100;
    for (const [a, b] of tot) { font("normal", 9.5, MUT); doc.text(a, TX, y); font("normal", 9.5); doc.text(b, C.sum, y, { align: "right" }); y += 5.5; }
    doc.setFillColor(...ACC); doc.roundedRect(TX - 3, y - 3.5, ML + CW - TX + 3, 10, 1.5, 1.5, "F");
    font("bold", 11.5, [255, 255, 255]); doc.text("Iš viso su PVM", TX, y + 3); doc.text(money(calc.total), C.sum, y + 3, { align: "right" });
    y += 16;

    // Pastabos
    if (x.notes) {
      font("bold", 9, MUT); need(10); doc.text("SĄLYGOS IR PASTABOS", ML, y); y += 5;
      font("normal", 9.5);
      for (const p of String(x.notes).split(/\r?\n/)) { for (const l of doc.splitTextToSize(p || " ", CW)) { need(4.8); doc.text(l, ML, y); y += 4.8; } }
      y += 4;
    }

    // Parengė
    need(18);
    doc.setDrawColor(222, 226, 230); doc.setLineWidth(0.2); doc.line(ML, y, ML + CW, y); y += 6;
    font("normal", 9, MUT); doc.text("Pasiūlymą parengė", ML, y);
    font("bold", 10); doc.text(x.author || DZ.myName() || (c.director || ""), ML, y + 5);
    font("normal", 9); doc.text([c.phone ? "Tel. " + c.phone : "", c.email].filter(Boolean).join("  ·  "), ML, y + 10);
    font("normal", 9, MUT); doc.text("Iškilus klausimams – skambinkite, mielai patarsime.", ML + CW, y + 5, { align: "right" });

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); font("normal", 7.5, MUT); doc.text(`${c.name || "UAB Elreda"} · pasiūlymas Nr. ${x.no}${n > 1 ? ` · ${i} / ${n}` : ""}`, W / 2, H - 9, { align: "center" }); }
    return doc;
  };

  async function exportPdf(o, x, progress) {
    const doc = await DZ.offerPdf(o, x, progress);
    const safe = (o.client_name || o.name).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 40) || "objektas";
    const fname = `pasiulymas_${x.no}_${safe}.pdf`;
    const blob = doc.output("blob");
    // Į Google Drive ir objekto dokumentus (tipas „Pasiūlymas“)
    let drive = "";
    if (DZ.uploadFile && DZ.fnBase) {
      progress("Įkeliama į Google Drive…");
      try {
        const path = await DZ.uploadFile(blob, "application/pdf", fname.replace(/\.pdf$/, ""), o.name, x.date);
        const r = await DZ.sb.from("object_docs").insert({ object_id: o.id, path, type: "pasiulymas", mime: "application/pdf", name: fname, date: DZ.today() }).select().single();
        if (!r.error && S.docs) S.docs.push(r.data);
        drive = "ok";
      } catch (e) { drive = (e && e.message) || String(e); }
    }
    if (!o.offer_date) {
      const { error } = await DZ.sb.from("objects").update({ offer_date: x.date }).eq("id", o.id);
      if (!error) o.offer_date = x.date;
    }
    progress("Išsaugoma…");
    await DZ.saveFile(fname, "application/pdf", blob);
    if (drive) DZ.toast(drive === "ok" ? "Pasiūlymas įkeltas į Google Drive" : "Į Google Drive neįkelta: " + drive, drive !== "ok");
  }
})();
