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

  // ---------- PDF (išvaizda kaip Wantly pasiūlyme) ----------
  let fonts = null, imgs = null;
  async function b64(url) {
    const r = await fetch(url); if (!r.ok) throw new Error("nerastas " + url);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function loadLibs(progress) {
    if (!window.jspdf) { progress("Įkeliama PDF biblioteka…"); await DZ.loadScript("vendor/jspdf.umd.min.js"); }
    if (!fonts) { progress("Įkeliamas šriftas…"); fonts = await Promise.all(["DejaVuSans", "DejaVuSans-Bold"].map(n => b64("vendor/" + n + ".ttf"))); }
    if (!imgs) {
      imgs = {};
      try { imgs.logo = "data:image/png;base64," + await b64("img/elreda-logo.png"); } catch (_) {}
      try { imgs.banner = "data:image/jpeg;base64," + await b64("img/banner.jpg"); } catch (_) {}
    }
  }
  // Įmonės pavadinimas be kabučių, didžiosiomis: „UAB ELREDA“
  DZ.coUpper = () => String(DZ.company().name || "UAB Elreda").replace(/[„“”"]/g, "").trim().toUpperCase();

  DZ.offerPdf = async (o, x, progress = () => {}) => {
    await loadLibs(progress);
    progress("Kuriamas PDF…");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addFileToVFS("S.ttf", fonts[0]); doc.addFont("S.ttf", "S", "normal");
    doc.addFileToVFS("S-B.ttf", fonts[1]); doc.addFont("S-B.ttf", "S", "bold");
    const W = 210, H = 297, ML = 14, MR = 14, CW = W - ML - MR, BOT = H - 16;
    const WHITE = [255, 255, 255], INK = [40, 44, 52], MUT = [120, 126, 136], CARD = [243, 244, 246], GREEN = [76, 175, 110], BEIGE = [246, 237, 226];
    const G1 = [35, 215, 235], G2 = [199, 197, 72];
    const font = (st = "normal", sz = 9.5, col = INK) => { doc.setFont("S", st); doc.setFontSize(sz); doc.setTextColor(...col); };
    let y = 0;
    const need = h => { if (y + h > BOT) { doc.addPage(); y = 16; return true; } return false; };
    const money = v => DZ.money(v);
    const c = DZ.company(), co = DZ.coUpper();
    const calc = DZ.offerCalc(x), vk = 1 + DZ.num(x.vat) / 100;
    const lines = x.lines || [];
    const gradient = (x0, y0, w, h) => { const n = 120; for (let i = 0; i < n; i++) { const t = i / (n - 1); doc.setFillColor(...G1.map((a, k) => Math.round(a + (G2[k] - a) * t))); doc.rect(x0 + w * i / n, y0, w / n + 0.3, h, "F"); } };

    // ---- Antraštė: spalvų perėjimas, logotipas, kontaktai ----
    const HB = 68;
    gradient(0, 0, W, HB);
    doc.setFillColor(...WHITE); doc.roundedRect(0, HB - 9, W, 30, 9, 9, "F");
    if (imgs.logo) doc.addImage(imgs.logo, "PNG", ML, 7, 34, 34 * 347 / 900);
    font("normal", 7.5, WHITE);
    doc.text([c.hours || "I - V 9:00 - 18:00", c.address, c.email, c.phone].filter(Boolean).join("     "), W - MR, 11, { align: "right" });
    // Kliento eilutė ir pavadinimas
    font("bold", 12.5, WHITE);
    const who = [(o.client_name || o.name || "").toUpperCase(), o.power_kw ? fmtQ(o.power_kw) + " kW" : "", o.address].filter(Boolean).join(" ");
    const wl = doc.splitTextToSize(who, 118).slice(0, 3);
    let hy = 30; doc.text(wl, ML, hy); hy += wl.length * 5.4 + 3;
    font("bold", 19, WHITE); doc.text("Komercinis pasiūlymas", ML, hy + 1); hy += 7.5;
    font("bold", 8, WHITE); doc.text("Tiekėjas:", ML, hy); const tw = doc.getTextWidth("Tiekėjas: "); font("normal", 8, WHITE); doc.text(co, ML + tw + 0.5, hy);
    // Kortelė dešinėje: parengė UAB ELREDA
    const KX = 136, KY = 24, KW = W - MR - KX, KH = 17;
    doc.setFillColor(...WHITE); doc.roundedRect(KX, KY, KW, KH, 8.5, 8.5, "F");
    if (imgs.logo) doc.addImage(imgs.logo, "PNG", KX + 5, KY + 4, 23, 23 * 347 / 900);
    font("bold", 8.5, INK); doc.text(co, KX + 32, KY + 7.5);
    font("normal", 8, MUT); doc.text("„Dirbame Jums“", KX + 32, KY + 12);
    y = HB + 6;

    // ---- Pasiūlymo duomenys ----
    font("normal", 8.5, MUT);
    doc.text(["Pasiūlymo Nr. " + x.no, "Data " + DZ.shortDate(x.date), x.valid_until ? "Galioja iki " + DZ.shortDate(x.valid_until) : ""].filter(Boolean).join("     "), ML, y);
    const cc = [o.client_phone ? "Tel. " + o.client_phone : "", o.client_email].filter(Boolean).join("     ");
    if (cc) doc.text(cc, W - MR, y, { align: "right" });
    y += 10;

    // ---- Lentelė ----
    const NW = 80;                                         // pavadinimo plotis
    const C = { qty: 113, price: 143, sum: 174, chk: W - MR - 5 };
    const head = () => { font("bold", 9, INK); doc.text("Kiekis", C.qty, y, { align: "center" }); doc.text("Vieneto kaina", C.price, y, { align: "center" }); doc.text("Suma", C.sum, y, { align: "center" }); y += 5; };
    head();
    const qtyTxt = l => l.qty === "" || l.qty == null ? "" : fmtQ(l.qty) + " " + (l.unit || "");
    const priceCell = (net, xc, yy, bold) => { font(bold ? "bold" : "normal", 9.5, INK); doc.text(money(net * vk), xc, yy, { align: "center" }); font("normal", 7.5, MUT); doc.text(money(net) + " be PVM", xc, yy + 4, { align: "center" }); };
    const check = (cx, cy) => { doc.setDrawColor(...GREEN); doc.setLineWidth(0.5); doc.circle(cx, cy, 2.6, "S"); doc.setLineWidth(0.6); doc.line(cx - 1.2, cy, cx - 0.3, cy + 1); doc.line(cx - 0.3, cy + 1, cx + 1.3, cy - 1); };
    // Pilkas fonas atkarpai (atkarpos dedamos viena po kitos, kraštai suapvalinti)
    const seg = (y0, h, top, bottom) => {
      doc.setFillColor(...CARD);
      if (top && bottom) { doc.roundedRect(ML, y0, CW, h, 3, 3, "F"); return; }
      if (top) { doc.roundedRect(ML, y0, CW, h, 3, 3, "F"); doc.rect(ML, y0 + h / 2, CW, h / 2 + 0.2, "F"); return; }
      if (bottom) { doc.roundedRect(ML, y0, CW, h, 3, 3, "F"); doc.rect(ML, y0 - 0.2, CW, h / 2 + 0.2, "F"); return; }
      doc.rect(ML, y0 - 0.2, CW, h + 0.4, "F");
    };

    if (x.show_prices) {
      lines.forEach((l, i) => {
        font("normal", 10); const nl = doc.splitTextToSize(l.name, NW);
        font("normal", 8); const dl = l.desc ? doc.splitTextToSize(l.desc, NW) : [];
        const h = Math.max(13, 6 + nl.length * 4.6 + dl.length * 3.6 + 2);
        if (need(h + 3)) head();
        seg(y, h, true, true);
        const ty = y + 6.5;
        font("normal", 8.5, MUT); doc.text(String(i + 1), ML + 4, ty);
        font("normal", 10, INK); doc.text(nl, ML + 10, ty);
        if (dl.length) { font("normal", 8, MUT); doc.text(dl, ML + 10, ty + nl.length * 4.6); }
        font("bold", 10, INK); doc.text(qtyTxt(l), C.qty, ty, { align: "center" });
        if (l.price !== "") priceCell(DZ.num(l.price), C.price, ty, false);
        priceCell(lineSum(l), C.sum, ty, true);
        y += h + 3;
      });
    } else {
      // Viena kaina: pagrindinė eilutė ir „Įskaičiuota“
      const kw = Number(o.power_kw) || 0;
      font("normal", 11); const tl = doc.splitTextToSize(x.title || "Saulės elektrinė", NW);
      const h1 = Math.max(16, 8 + tl.length * 5);
      need(h1 + 20);
      seg(y, h1, true, !lines.length);
      const ty = y + 7.5;
      font("normal", 8.5, MUT); doc.text("1", ML + 4, ty);
      font("normal", 11, INK); doc.text(tl, ML + 10, ty);
      font("bold", 10.5, INK); doc.text(kw ? fmtQ(kw) + " kW" : "1 kompl.", C.qty, ty, { align: "center" });
      priceCell(kw ? calc.sub / kw : calc.sub, C.price, ty, true);
      priceCell(calc.sub, C.sum, ty, true);
      check(C.chk, ty - 1);
      y += h1;
      if (lines.length) {
        seg(y, 7, false, false);
        font("normal", 8.5, MUT); doc.text("Įskaičiuota:", ML + 10, y + 4);
        doc.setDrawColor(215, 218, 223); doc.setLineWidth(0.2); doc.line(ML + 32, y + 3, ML + 10 + NW, y + 3);
        y += 7;
        lines.forEach((l, i) => {
          font("normal", 9); const nl = doc.splitTextToSize(l.name, NW);
          font("normal", 7.5); const dl = l.desc ? doc.splitTextToSize(l.desc, NW - 4) : [];
          const last = i === lines.length - 1;
          const h = nl.length * 4.3 + dl.length * 3.4 + (last ? 6 : 3.5);
          if (y + h > BOT) { seg(y, 0.1, false, true); doc.addPage(); y = 16; head(); }
          seg(y, h, false, last);
          font("normal", 9, INK); doc.text(nl, ML + 10, y + 4);
          if (dl.length) { font("normal", 7.5, MUT); doc.text(dl, ML + 13, y + 4 + nl.length * 4.3); }
          font("bold", 9.5, INK); doc.text(qtyTxt(l), C.qty, y + 4, { align: "center" });
          y += h;
        });
      }
      y += 4;
    }

    // ---- Sumos (dešinėje, kaip Wantly) ----
    const BX = 118, BW = W - MR - BX;
    const bh = 22 + (calc.disc ? 4.5 : 0);
    need(bh + 10);
    y += 2;
    doc.setFillColor(...BEIGE); doc.roundedRect(BX, y, BW, bh, 4, 4, "F");
    let by = y + 8;
    font("normal", 14, INK); doc.text(money(calc.net) + " be PVM", BX + 6, by); by += 5.5;
    font("normal", 7.5, INK);
    if (calc.disc) { doc.text(`Nuolaida: − ${money(calc.disc)}`, BX + 6, by); by += 4.5; }
    doc.text(`PVM (${fmtQ(x.vat)}%): ${money(calc.vat)}`, BX + 6, by); by += 5;
    font("bold", 10, INK); doc.text("Suma: " + money(calc.total), BX + 6, by);
    y += bh + 7;
    font("normal", 10, MUT); doc.text(c.web || "www.elreda.lt", W - MR, y, { align: "right" });
    y += 6;

    // ---- Pastabos ----
    if (x.notes) {
      font("bold", 9, INK); need(10); doc.text("Sąlygos ir pastabos", ML, y); y += 5;
      font("normal", 9, INK);
      for (const p of String(x.notes).split(/\r?\n/)) { for (const l of doc.splitTextToSize(p || " ", CW)) { need(4.6); doc.text(l, ML, y); y += 4.6; } }
      y += 5;
    }

    // ---- Reklaminis paveikslėlis: sumažinamas, kad tilptų į likusią vietą (bent 28 mm aukščio) ----
    const FH = 30;                                          // apačios bloko aukštis
    // Jei vietos nebelieka – paveikslėlis praleidžiamas (kad pasiūlymas tilptų į vieną puslapį)
    const room = BOT - FH - 6 - y;
    if (imgs.banner && room >= 28) {
      const bh2 = Math.min(CW * 609 / 1600, room);
      const bw2 = bh2 * 1600 / 609;
      doc.addImage(imgs.banner, "JPEG", ML + (CW - bw2) / 2, y, bw2, bh2, undefined, "FAST");
      y += bh2 + 6;
    }

    // ---- Apačia: parengė UAB ELREDA (prispaudžiama prie puslapio apačios) ----
    if (y + FH > BOT + 6) { doc.addPage(); y = 16; }
    y = Math.max(y, H - 6 - FH);
    doc.setFillColor(...CARD); doc.rect(0, y - 3, W, Math.max(FH + 0.5, H - 2.2 - (y - 3)), "F");
    font("bold", 10.5, INK); doc.text(co + " – „Dirbame Jums“", ML, y + 5);
    font("normal", 9, INK); doc.text([c.email, c.phone].filter(Boolean).join("     "), ML, y + 10.5);
    font("normal", 9, MUT); doc.text(doc.splitTextToSize("Jeigu kilo kokių nors papildomų klausimų, nedvejokite ir skambinkite.", 110), ML, y + 16);
    if (imgs.logo) doc.addImage(imgs.logo, "PNG", W - MR - 46, y + 1, 46, 46 * 347 / 900);

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      gradient(0, H - 2.2, W, 2.2);
      if (n > 1) { font("normal", 7, MUT); doc.text(`${co} · pasiūlymas Nr. ${x.no} · ${i} / ${n}`, W / 2, H - 5, { align: "center" }); }
    }
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
