// Saulės elektrinės įrengimo sutartis (PDF): užpildoma iš objekto kortelės, paskutinio pasiūlymo ir įmonės rekvizitų.
// Išsaugota sutartis įkeliama į Google Drive ir objekto dokumentus (tipas „Sutartis“). Tik administratoriams.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc, fmtQ = DZ.fmtQ;
  const BL = "__________";                                   // neužpildytas laukas
  const v = (x, w) => (x != null && String(x).trim() !== "" ? String(x).trim() : (w || BL));
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

  // ---------- Suma žodžiais ----------
  const U = ["", "vienas", "du", "trys", "keturi", "penki", "šeši", "septyni", "aštuoni", "devyni"];
  const T = ["dešimt", "vienuolika", "dvylika", "trylika", "keturiolika", "penkiolika", "šešiolika", "septyniolika", "aštuoniolika", "devyniolika"];
  const D = ["", "", "dvidešimt", "trisdešimt", "keturiasdešimt", "penkiasdešimt", "šešiasdešimt", "septyniasdešimt", "aštuoniasdešimt", "devyniasdešimt"];
  const triplet = n => {
    const h = Math.floor(n / 100), t = n % 100, out = [];
    if (h) out.push(h === 1 ? "šimtas" : U[h] + " šimtai");
    if (t >= 10 && t < 20) out.push(T[t - 10]);
    else { if (t >= 20) out.push(D[Math.floor(t / 10)]); if (t % 10) out.push(U[t % 10]); }
    return out.join(" ");
  };
  const form = (n, one, few, many) => { const t = n % 100, u = n % 10; return t >= 10 && t < 20 || u === 0 ? many : u === 1 ? one : few; };
  DZ.eurWords = sum => {
    const e = Math.floor(r2(sum)), ct = Math.round((r2(sum) - e) * 100);
    const parts = [], mil = Math.floor(e / 1e6), th = Math.floor(e / 1000) % 1000, rest = e % 1000;
    if (mil) parts.push(triplet(mil) + " " + form(mil, "milijonas", "milijonai", "milijonų"));
    if (th) parts.push(triplet(th) + " " + form(th, "tūkstantis", "tūkstančiai", "tūkstančių"));
    if (rest) parts.push(triplet(rest));
    const words = parts.join(" ") || "nulis";
    return words.charAt(0).toUpperCase() + words.slice(1) + " " + form(e, "euras", "eurai", "eurų") + " " + String(ct).padStart(2, "0") + " ct";
  };

  // ---------- Duomenys sutarčiai ----------
  const PLACE = t => { const m = /\b(ant\s.+|antžemin.+)$/i.exec(t || ""); return m ? m[1].replace(/\s+/g, " ").trim() : ""; };
  const objOffers = o => (S.offers || []).filter(x => x.object_id === o.id).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.no - a.no);
  // offerId: undefined – naujausias pasiūlymas; "" – be pasiūlymo; kitaip – nurodytas
  function gather(o, offerId) {
    const list = objOffers(o);
    const offer = offerId === "" ? null : offerId ? list.find(x => x.id === offerId) || null : list[0] || null;
    const calc = offer && DZ.offerCalc ? DZ.offerCalc(offer) : null;
    const total = calc ? calc.total : (Number(o.contract_sum) || 0);
    const vat = offer ? DZ.num(offer.vat) : 21;
    const net = calc ? calc.net : r2(total / (1 + vat / 100));
    const lines = offer && offer.lines && offer.lines.length ? offer.lines.map(l => ({ name: l.name, desc: l.desc || "", qty: l.qty === "" || l.qty == null ? "" : fmtQ(l.qty) + " " + (l.unit || ""), price: l.price, sum: r2(DZ.num(l.qty) * DZ.num(l.price)) }))
      : [o.module_type ? { name: "Saulės moduliai " + o.module_type, qty: o.module_count ? o.module_count + " vnt." : "" } : null,
         o.inverter ? { name: "Inverteris " + o.inverter, qty: (o.inverter_count || 1) + " vnt." } : null].filter(Boolean);
    return { offer, calc, total, net, vat, vatSum: r2(total - net), lines, place: PLACE(offer && offer.title) };
  }
  const defaults = () => Object.assign({ days: 30, w_mod: 12, w_pow: 25, w_inv: 5, w_bat: 10, w_mount: 10, w_work: 5, advance: 30, reply: 10 }, S.settings.contract || {});

  // ---------- Langas ----------
  DZ.actions["contract-open"] = t => {
    const o = S.objects.find(x => x.id === t.dataset.id); if (!o) return;
    const offers = objOffers(o);
    const g = gather(o, t.dataset.offer), d = defaults();
    const sel = g.offer ? g.offer.id : "";
    const n = (id, l, val) => `<label class="field"><span class="lbl">${l}</span><input id="${id}" type="number" step="1" min="0" inputmode="numeric" value="${esc(val)}"></label>`;
    const miss = [!o.client_code && "kliento asmens / įmonės kodas", !S.settings.company.code && "įmonės kodas (meniu ⋯ → Įmonės nustatymai)", !S.settings.company.iban && "atsiskaitomoji sąskaita", !g.total && "kaina (sukurkite pasiūlymą arba įrašykite sutarties sumą)"].filter(Boolean);
    DZ.openSheet(`<h2>Sutartis</h2>
      <p class="note">${esc(o.name)}${o.client_name ? " · " + esc(o.client_name) : ""}</p>
      <label class="field"><span class="lbl">Kaina ir specifikacija pagal</span><select id="ct-offer">
        ${offers.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? "selected" : ""}>Pasiūlymą Nr. ${esc(x.no)} · ${esc(DZ.shortDate(x.date))} · ${DZ.money(DZ.offerCalc(x).total)}</option>`).join("")}
        <option value="" ${!sel ? "selected" : ""}>Be pasiūlymo${o.contract_sum ? " (sutarties suma " + DZ.money(o.contract_sum) + ")" : ""}</option>
      </select></label>
      ${g.offer ? `<p class="note">${esc(g.offer.title || "")} · ${g.lines.length} eil.${g.calc && g.calc.disc ? " · nuolaida " + DZ.money(g.calc.disc) : ""} · iš viso su PVM <b>${DZ.money(g.total)}</b></p>` : ""}
      <div class="row2"><label class="field"><span class="lbl">Sutarties Nr.</span><input id="ct-no" value="${esc(o.contract_no || "")}" autocomplete="off"></label>
        <label class="field"><span class="lbl">Data</span><input type="date" id="ct-date" value="${esc(o.contract_date || DZ.today())}"></label></div>
      <label class="field"><span class="lbl">Įrengimo vieta</span><input id="ct-place" value="${esc(g.place)}" placeholder="pvz. ant skardos stogo"></label>
      <div class="row3">${n("ct-days", "Montavimas, d.", d.days)}${n("ct-adv", "Avansas, %", d.advance)}${n("ct-reply", "Trūkumams, d. d.", d.reply)}</div>
      <span class="lbl">Garantijos, metai</span>
      <div class="row3">${n("ct-wmod", "Moduliai", d.w_mod)}${n("ct-wpow", "Modulių galia", d.w_pow)}${n("ct-winv", "Inverteris", d.w_inv)}</div>
      <div class="row3">${n("ct-wbat", "Kaupiklis", d.w_bat)}${n("ct-wmount", "Konstrukcija", d.w_mount)}${n("ct-wwork", "Montavimo darbai", d.w_work)}</div>
      ${miss.length ? `<p class="note box">Trūksta: ${esc(miss.join("; "))}. Šios vietos sutartyje liks su brūkšniais ranka įrašyti.</p>` : ""}
      <p class="note" id="ct-status">Terminai ir garantijos įsimenami kitoms sutartims.</p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Sukurti PDF</button></div>`, { form: true, id: "ct-form" });
    // Pakeitus pasiūlymą – langas perpiešiamas su jo duomenimis (įvesti terminai išlaikomi)
    $("#ct-offer").addEventListener("change", ev => {
      const keep = {}; for (const id of ["ct-no", "ct-date", "ct-days", "ct-adv", "ct-reply", "ct-wmod", "ct-wpow", "ct-winv", "ct-wbat", "ct-wmount", "ct-wwork"]) keep[id] = $("#" + id).value;
      DZ.closeSheet(true);
      DZ.actions["contract-open"]({ dataset: { id: o.id, offer: ev.target.value } });
      for (const [id, val] of Object.entries(keep)) $("#" + id).value = val;
    });
    $("#ct-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const btn = $("#ct-form button[type=submit]"); btn.disabled = true;
      const st = $("#ct-status"), num = id => Math.max(0, Math.round(DZ.num($("#" + id).value)));
      const terms = { days: num("ct-days"), advance: Math.min(100, num("ct-adv")), reply: num("ct-reply"), w_mod: num("ct-wmod"), w_pow: num("ct-wpow"), w_inv: num("ct-winv"), w_bat: num("ct-wbat"), w_mount: num("ct-wmount"), w_work: num("ct-wwork") };
      const opt = { no: $("#ct-no").value.trim(), date: $("#ct-date").value || DZ.today(), place: $("#ct-place").value.trim(), ...terms };
      try {
        // Terminai – kitoms sutartims; Nr. ir data – į objekto kortelę
        DZ.sb.from("settings").upsert({ key: "contract", value: terms, updated_at: new Date().toISOString() }).then(r => { if (!r.error) S.settings.contract = terms; });
        if (opt.no !== (o.contract_no || "") || opt.date !== (o.contract_date || "")) {
          const r = await DZ.sb.from("objects").update({ contract_no: opt.no, contract_date: opt.date }).eq("id", o.id);
          if (!r.error) { o.contract_no = opt.no; o.contract_date = opt.date; }
        }
        const doc = await DZ.contractPdf(o, g, opt, m => { st.textContent = m; });
        const safe = (o.client_name || o.name).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 40) || "objektas";
        const fname = `sutartis_${(opt.no || safe).replace(/[^\p{L}\p{N}-]+/gu, "_")}.pdf`;
        const blob = doc.output("blob");
        let drive = "";
        if (DZ.uploadFile && DZ.fnBase) {
          st.textContent = "Įkeliama į Google Drive…";
          try {
            const ents = DZ.objEntries(o.id), last = ents.find(e => (e.photos || []).length) || ents[0];
            const path = await DZ.uploadFile(blob, "application/pdf", fname.replace(/\.pdf$/, ""), o.name, last ? last.date : opt.date);
            const r = await DZ.sb.from("object_docs").insert({ object_id: o.id, path, type: "sutartis", mime: "application/pdf", name: fname, date: DZ.today() }).select().single();
            if (r.error) throw r.error;
            if (S.docs) S.docs.push(r.data);
            drive = "ok";
          } catch (e) { drive = (e && e.message) || String(e); }
        }
        st.textContent = "Išsaugoma…";
        await DZ.saveFile(fname, "application/pdf", blob);
        DZ.closeSheet(true);
        DZ.toast(drive === "ok" ? "Sutartis įkelta į dokumentus" : drive ? "Į dokumentus neįkelta: " + drive : "Sutartis sukurta", !!drive && drive !== "ok");
        DZ.render();
      } catch (e) { btn.disabled = false; st.className = "err"; st.textContent = "Nepavyko sukurti PDF: " + (e.message || e); }
    });
  };

  // ---------- PDF ----------
  let fonts = null;
  async function b64(url) {
    const r = await fetch(url); if (!r.ok) throw new Error("nerastas " + url);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  DZ.contractPdf = async (o, g, x, progress = () => {}) => {
    if (!window.jspdf) { progress("Įkeliama PDF biblioteka…"); await DZ.loadScript("vendor/jspdf.umd.min.js"); }
    if (!fonts) { progress("Įkeliamas šriftas…"); fonts = await Promise.all(["DejaVuSans", "DejaVuSans-Bold"].map(n => b64("vendor/" + n + ".ttf"))); }
    progress("Kuriamas PDF…");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addFileToVFS("S.ttf", fonts[0]); doc.addFont("S.ttf", "S", "normal");
    doc.addFileToVFS("S-B.ttf", fonts[1]); doc.addFont("S-B.ttf", "S", "bold");
    const W = 210, H = 297, ML = 20, MR = 17, CW = W - ML - MR, BOT = H - 18, FS = 9, LH = 4.15;
    let y = 20;
    const font = (st = "normal", sz = FS) => { doc.setFont("S", st); doc.setFontSize(sz); doc.setTextColor(0); };
    const need = h => { if (y + h > BOT) { doc.addPage(); y = 18; return true; } return false; };
    // Tekstas su **paryškinimais**, žodžių laužymu ir įtrauka
    const rich = (txt, x = ML, w = CW, lh = LH) => {
      const parts = String(txt).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(p => p.startsWith("**") ? [p.slice(2, -2), "bold"] : [p, "normal"]);
      let cx = x; need(lh);
      for (const [t, st] of parts) for (const word of t.split(/(?<=\s)/)) {
        font(st); const ww = doc.getTextWidth(word);
        if (cx + doc.getTextWidth(word.trimEnd()) > x + w && cx > x) { y += lh; need(lh); cx = x; if (!word.trim()) continue; }
        doc.text(word, cx, y); cx += ww;
      }
      y += lh;
    };
    const head = t => { need(12); y += 3; font("bold", 9.5); doc.text(t.toUpperCase(), ML, y); y += 5; };
    const pt = (nr, t) => { need(LH * 2); font("normal"); doc.text(nr, ML, y); rich(t, ML + 9, CW - 9); y += 1; };

    const c = DZ.company(), co = c.name || "UAB „Elreda“";
    const money = n => DZ.money(n).replace(/\s€$/, "");
    const total = g.total, net = g.net;
    const adv = r2(total * x.advance / 100), rest = r2(total - adv);
    const clientAddr = (o.eso && o.eso.client_address) || o.address;

    // Antraštė
    font("bold", 12); doc.text("SAULĖS ELEKTRINĖS ĮRENGIMO SUTARTIS Nr. " + v(x.no), W / 2, y, { align: "center" }); y += 5.5;
    font("normal", FS); doc.text(DZ.shortDate(x.date).replace(/\./g, "-") + ", " + (c.city || "Šilalė"), W / 2, y, { align: "center" }); y += 9;

    rich(`**${co}**, juridinio asmens kodas ${v(c.code)}, PVM mokėtojo kodas ${v(c.vat)}, buveinės adresas ${v(c.address)}, atstovaujama direktoriaus ${v(c.director_gen || c.director)} (toliau – **Rangovas**), ir`); y += 1.5;
    rich(`**${v(o.client_name)}**, asmens / įmonės kodas ${v(o.client_code)}${o.client_vat ? ", PVM mokėtojo kodas " + o.client_vat : ""}, adresas ${v(clientAddr)}, tel. ${v(o.client_phone)}, el. paštas ${v(o.client_email)} (toliau – **Užsakovas**),`); y += 1.5;
    rich("toliau kartu vadinami **Šalimis**, o kiekvienas atskirai – **Šalimi**, sudarė šią sutartį (toliau – **Sutartis**).");

    head("1. Sutarties dalykas");
    pt("1.1.", `Rangovas įsipareigoja savo jėgomis ir priemonėmis pateikti įrangą, suprojektuoti (kiek reikia), sumontuoti, sujungti ir paleisti **${o.power_kw ? fmtQ(o.power_kw) : BL} kW** galios saulės elektrinę (toliau – **Elektrinė**) adresu ${v(o.address)} (toliau – **Objektas**), o Užsakovas įsipareigoja priimti tinkamai atliktus darbus ir už juos sumokėti Sutartyje nustatyta tvarka.`);
    pt("1.2.", `Elektrinės įrengimo vieta: ${v(x.place)}.`);
    pt("1.3.", "Tiekiamos įrangos sudėtis, kiekiai ir atliekamų darbų apimtis nurodyti Sutarties **Priede Nr. 1** „Specifikacija“. Priedai yra neatskiriama Sutarties dalis.");
    pt("1.4.", "Į Sutarties kainą įskaičiuoti darbai: įrangos pristatymas į Objektą, tvirtinimo konstrukcijos montavimas, saulės modulių ir inverterio montavimas, nuolatinės ir kintamosios srovės kabelių tiesimas ir sujungimas, apsaugos įrangos įrengimas, Elektrinės paleidimas ir derinimas, Užsakovo apmokymas naudotis Elektrine ir jos stebėsenos programėle, dokumentų Elektrinei prijungti prie skirstomojo tinklo parengimas.");
    pt("1.5.", "Į Sutarties kainą neįskaičiuota (jei Šalys raštu nesusitaria kitaip): stogo dangos ar konstrukcijų taisymas ir stiprinimas, Užsakovo elektros instaliacijos ar įvadinio skydo rekonstrukcija, AB „Energijos skirstymo operatorius“ (toliau – **ESO**) mokesčiai ir kitų institucijų rinkliavos.");

    head("2. Kaina ir atsiskaitymo tvarka");
    pt("2.1.", total ? `Sutarties kaina yra ${money(net)} EUR be PVM, PVM (${fmtQ(g.vat)} %) ${money(g.vatSum)} EUR, iš viso su PVM **${money(total)} EUR** (${DZ.eurWords(total)}).`
      : `Sutarties kaina yra ${BL} EUR be PVM, PVM (21 %) ${BL} EUR, iš viso su PVM ${BL} EUR (${BL}).`);
    pt("2.2.", "Kaina yra fiksuota ir apima visą Priede Nr. 1 nurodytą įrangą ir darbus. Kaina gali būti keičiama tik Šalims raštu susitarus dėl papildomų ar nevykdomų darbų.");
    pt("2.3.", `Užsakovas atsiskaito pagal Priede Nr. 2 nustatytą mokėjimų grafiką, pagal Rangovo išrašytas PVM sąskaitas faktūras, pavedimu į Rangovo sąskaitą Nr. ${v(c.iban)}${c.bank ? ", " + c.bank : ""}.`);
    pt("2.4.", "Jei Užsakovas Elektrinei įsigyti tikisi gauti valstybės paramą (kompensaciją) per Aplinkos projektų valdymo agentūrą (toliau – **APVA**) ar kitą programą, Rangovas, Užsakovo prašymu, padeda parengti ir pateikti reikiamus dokumentus. Paramos skyrimą lemia APVA sprendimas; paramos neskyrimas ar jos vėlavimas neatleidžia Užsakovo nuo pareigos atsiskaityti pagal Sutartį, nebent Šalys raštu susitarė kitaip.");
    pt("2.5.", "Įrangos nuosavybės teisė Užsakovui pereina visiškai atsiskaičius pagal Sutartį. Atsitiktinio įrangos žuvimo ar sugadinimo rizika Užsakovui pereina nuo įrangos pristatymo į Objektą dienos.");

    head("3. Darbų atlikimo terminai");
    pt("3.1.", `Rangovas įsipareigoja sumontuoti Elektrinę per **${x.days || BL}** kalendorinių dienų nuo avanso gavimo dienos, jei Užsakovas laiku įvykdo Sutarties 5 skyriuje nustatytus įsipareigojimus.`);
    pt("3.2.", "Darbų terminas pratęsiamas tiek, kiek truko: (a) Užsakovo vėlavimas sumokėti avansą ar suteikti sąlygas darbams; (b) darbams netinkamos oro sąlygos (lietus, sniegas, stiprus vėjas, apledėjimas), dėl kurių darbai ant stogo nesaugūs; (c) gamintojų ar tiekėjų vėlavimas pristatyti įrangą, apie kurį Rangovas nedelsdamas praneša Užsakovui; (d) nenugalimos jėgos aplinkybės.");
    pt("3.3.", "Elektrinės prijungimo prie skirstomojo tinklo terminus nustato ESO. Rangovas neatsako už ESO procedūrų trukmę, tačiau laiku pateikia visus iš jo priklausančius dokumentus.");

    head("4. Rangovo įsipareigojimai");
    pt("4.1.", "Atlikti darbus kokybiškai, laikantis galiojančių teisės aktų, elektros įrenginių įrengimo taisyklių, įrangos gamintojų montavimo instrukcijų ir darbų saugos reikalavimų.");
    pt("4.2.", "Tiekti naują, nenaudotą, Europos Sąjungoje naudoti leistiną įrangą, atitinkančią Priedą Nr. 1. Esant poreikiui, įrangą pakeisti ne prastesnių techninių savybių įranga, apie tai iš anksto informavus Užsakovą.");
    pt("4.3.", "Prieš pradedant darbus apžiūrėti Objektą ir raštu informuoti Užsakovą, jei stogo, statinio ar elektros instaliacijos būklė netinkama Elektrinei įrengti.");
    pt("4.4.", "Parengti ir Užsakovo vardu pateikti ESO dokumentus, reikalingus Elektrinei prijungti ir gaminančio vartotojo statusui įgyti (jei Užsakovas suteikia įgaliojimą), bei suteikti informaciją apie jų eigą.");
    pt("4.5.", "Baigus darbus sutvarkyti darbo vietą, išvežti pakuočių ir montavimo atliekas.");
    pt("4.6.", "Perduoti Užsakovui Elektrinę pagal priėmimo–perdavimo aktą kartu su įrangos garantiniais dokumentais, techniniais aprašymais ir prieigos prie stebėsenos sistemos duomenimis.");

    head("5. Užsakovo įsipareigojimai");
    pt("5.1.", "Laiku ir tinkamai atsiskaityti su Rangovu pagal Sutartį.");
    pt("5.2.", "Užtikrinti Rangovui priėjimą prie Objekto darbo dienomis nuo 8 iki 18 val., galimybę naudotis elektros energija (230/400 V) darbų metu ir saugią vietą įrangai laikyti.");
    pt("5.3.", "Pateikti Objekto (pastato ar žemės sklypo) nuosavybę ar teisėtą valdymą patvirtinančius dokumentus, o jei Objektas valdomas bendrosios nuosavybės teise – kitų bendraturčių sutikimus, ir kitus ESO bei APVA reikalaujamus dokumentus.");
    pt("5.4.", "Užtikrinti, kad stogo ir statinio konstrukcijos gali atlaikyti Elektrinės apkrovas, ir informuoti Rangovą apie paslėptas komunikacijas, stogo dangos defektus ar kitas darbams reikšmingas aplinkybes.");
    pt("5.5.", "Priimti tinkamai atliktus darbus Sutartyje nustatyta tvarka.");
    pt("5.6.", "Naudoti Elektrinę pagal Rangovo ir gamintojų nurodymus, be Rangovo sutikimo nekeisti Elektrinės sudėties, jos neardyti ir nereguliuoti, išskyrus veiksmus, numatytus naudojimo instrukcijoje.");

    head("6. Darbų priėmimas");
    pt("6.1.", "Baigęs darbus Rangovas informuoja Užsakovą ir pateikia pasirašyti įrangos priėmimo–perdavimo aktą.");
    pt("6.2.", "Užsakovas per 5 darbo dienas nuo pranešimo gavimo privalo darbus priimti arba raštu pateikti motyvuotą atsisakymą su nustatytų trūkumų sąrašu. Rangovas trūkumus pašalina per Šalių suderintą protingą terminą.");
    pt("6.3.", "Nežymūs trūkumai, kurie netrukdo naudoti Elektrinės, nėra pagrindas atsisakyti priimti darbus; jie įrašomi į aktą ir pašalinami per jame nurodytą terminą.");
    pt("6.4.", "Jei Užsakovas per 6.2 punkte nustatytą terminą akto nepasirašo ir motyvuoto atsisakymo nepateikia, darbai laikomi priimtais.");

    head("7. Garantijos");
    const bat = g.lines.some(l => /kaupikl|bater|akumul/i.test(l.name));
    pt("7.1.", `Įrangai taikomos gamintojų garantijos: saulės moduliams – ${x.w_mod || BL} metų produkto garantija ir ${x.w_pow || BL} metų galios garantija; inverteriui – ${x.w_inv || BL} metų${bat ? `; energijos kaupikliui – ${x.w_bat || BL} metų` : ""}; tvirtinimo konstrukcijai – ${x.w_mount || BL} metų. Garantijos sąlygos nurodytos gamintojų garantiniuose dokumentuose.`);
    pt("7.2.", `Rangovas suteikia **${x.w_work || BL} metų** garantiją atliktiems montavimo darbams, skaičiuojant nuo priėmimo–perdavimo akto pasirašymo dienos.`);
    pt("7.3.", `Garantinio laikotarpio metu nustatytus trūkumus Rangovas pašalina savo sąskaita per ${x.reply || BL} darbo dienų nuo Užsakovo rašytinio pranešimo gavimo, o jei tam reikia gamintojo sprendimo ar įrangos pakeitimo – per protingą terminą, apie jį informavęs Užsakovą. Rangovas tarpininkauja Užsakovui teikiant pretenzijas įrangos gamintojams.`);
    pt("7.4.", "Garantija netaikoma gedimams, atsiradusiems dėl stichinių nelaimių, žaibo, gaisro, mechaninių pažeidimų, netinkamo naudojimo, trečiųjų asmenų ar Užsakovo atliktų pakeitimų, elektros tinklo parametrų sutrikimų ar Užsakovui neatlikus gamintojų nurodytos priežiūros.");
    pt("7.5.", "Šis skyrius neriboja Užsakovo, kaip vartotojo, teisių, numatytų Lietuvos Respublikos civiliniame kodekse ir kituose vartotojų teisių apsaugos teisės aktuose.");

    head("8. Šalių atsakomybė");
    pt("8.1.", "Užsakovui vėluojant atsiskaityti, Rangovas turi teisę reikalauti 0,05 % dydžio delspinigių nuo laiku nesumokėtos sumos už kiekvieną pavėluotą dieną.");
    pt("8.2.", "Rangovui dėl savo kaltės vėluojant atlikti darbus, Užsakovas turi teisę reikalauti 0,05 % dydžio delspinigių nuo neatliktų darbų vertės už kiekvieną pavėluotą dieną.");
    pt("8.3.", "Rangovas neatsako už žalą, atsiradusią dėl Užsakovo pateiktos neteisingos informacijos apie Objektą, stogo ar statinio konstrukcijų netinkamumo, apie kurį Rangovas negalėjo žinoti, taip pat už Elektrinės pagamintos energijos kiekio priklausomybę nuo oro sąlygų, šešėlių ar ESO apribojimų. Rangovo pateikti energijos gamybos skaičiavimai yra orientaciniai.");
    pt("8.4.", "Šalis atleidžiama nuo atsakomybės, jei įrodo, kad Sutarties neįvykdė dėl nenugalimos jėgos (force majeure) aplinkybių, nustatytų Lietuvos Respublikos teisės aktuose. Apie tokias aplinkybes Šalis nedelsdama, bet ne vėliau kaip per 5 darbo dienas, raštu praneša kitai Šaliai.");

    head("9. Sutarties nutraukimas");
    pt("9.1.", "Sutartis gali būti nutraukta raštišku Šalių susitarimu.");
    pt("9.2.", "Jei Sutartis sudaroma ne prekybai skirtose patalpose (pvz., Užsakovo namuose) arba nuotoliniu būdu, Užsakovas, būdamas vartotojas, turi teisę per 14 dienų nuo Sutarties sudarymo dienos atsisakyti Sutarties nenurodydamas priežasties, apie tai raštu pranešęs Rangovui. Jei Užsakovas aiškiai paprašė pradėti darbus nepasibaigus šiam terminui, atsisakydamas Sutarties jis sumoka už iki pranešimo dienos atliktus darbus ir specialiai jam užsakytą įrangą.");
    pt("9.3.", "Šalis turi teisę vienašališkai nutraukti Sutartį, prieš 10 dienų raštu įspėjusi kitą Šalį, jei kita Šalis iš esmės pažeidžia Sutartį ir pažeidimo nepašalina per 10 dienų nuo rašytinio pranešimo gavimo. Esminiu pažeidimu laikomas, be kita ko, Užsakovo vėlavimas sumokėti avansą daugiau kaip 30 dienų.");
    pt("9.4.", "Nutraukus Sutartį, Užsakovas sumoka už iki nutraukimo atliktus darbus ir jam užsakytą ar pristatytą įrangą, o Rangovas grąžina sumokėtų sumų perviršį.");

    head("10. Asmens duomenys");
    pt("10.1.", "Rangovas tvarko Užsakovo asmens duomenis (vardą, pavardę, asmens kodą, adresą, kontaktus, Objekto duomenis) Sutarčiai sudaryti ir vykdyti, dokumentams ESO ir APVA pateikti, buhalterinei apskaitai tvarkyti, laikydamasis Bendrojo duomenų apsaugos reglamento (ES) 2016/679. Duomenys saugomi tiek, kiek reikalauja teisės aktai, ir teikiami tik ESO, APVA, įrangos gamintojams (garantijos tikslais) ir valstybės institucijoms, kai to reikalauja teisės aktai.");

    head("11. Ginčų sprendimas ir baigiamosios nuostatos");
    pt("11.1.", "Sutarčiai taikoma Lietuvos Respublikos teisė. Ginčai sprendžiami derybomis. Užsakovas, būdamas vartotojas, turi teisę kreiptis į Valstybinę vartotojų teisių apsaugos tarnybą (Vilniaus g. 25, Vilnius, www.vvtat.lt). Nepavykus ginčo išspręsti, jis sprendžiamas Lietuvos Respublikos teismuose.");
    pt("11.2.", "Sutartis įsigalioja jos pasirašymo dieną ir galioja, kol Šalys visiškai įvykdys savo įsipareigojimus.");
    pt("11.3.", "Sutarties pakeitimai ir papildymai galioja, jei jie sudaryti raštu ir pasirašyti abiejų Šalių. Pranešimai laikomi tinkamai pateiktais, jei išsiųsti Sutartyje nurodytais el. pašto adresais.");
    pt("11.4.", "Sutartis sudaryta dviem vienodą juridinę galią turinčiais egzemplioriais, po vieną kiekvienai Šaliai, arba pasirašyta kvalifikuotais elektroniniais parašais.");

    // Rekvizitai ir parašai
    const left = ["RANGOVAS", co, "Įm. kodas " + v(c.code), "PVM kodas " + v(c.vat), v(c.address), "A. s. " + v(c.iban), c.bank, c.phone ? "Tel. " + c.phone : "", c.email ? "El. p. " + c.email : "", "", "Direktorius " + v(c.director)].filter(s => s !== undefined && s !== null);
    const right = ["UŽSAKOVAS", v(o.client_name), "Asmens / įm. kodas " + v(o.client_code), o.client_vat ? "PVM kodas " + o.client_vat : "", v(clientAddr), "Tel. " + v(o.client_phone), "El. p. " + v(o.client_email)].filter(Boolean);
    head("12. Šalių rekvizitai ir parašai");
    const RX = ML + CW / 2 + 4, COLW = CW / 2 - 6;
    const colH = ls => ls.reduce((h, l) => h + (l ? doc.splitTextToSize(l, COLW).length : 1) * LH, 0);
    need(Math.max(colH(left), colH(right)) + 22);
    const top = y;
    const col = (ls, x0) => { let yy = top; ls.forEach((l, i) => { font(i === 0 ? "bold" : "normal"); const s = doc.splitTextToSize(l || " ", COLW); doc.text(s, x0, yy); yy += s.length * LH; }); return yy; };
    const yl = col(left, ML), yr = col(right, RX);
    const sig = (x0, yy) => { doc.setDrawColor(40); doc.setLineWidth(0.2); doc.line(x0, yy, x0 + 50, yy); font("normal", 7); doc.text("(parašas)", x0 + 25, yy + 3.2, { align: "center" }); };
    const sy = Math.max(yl, yr) + 12; sig(ML, sy); sig(RX, sy); y = sy + 8;

    // Priedas Nr. 1
    doc.addPage(); y = 20;
    font("bold", 10.5); doc.text("PRIEDAS NR. 1 – SPECIFIKACIJA", ML, y); y += 5;
    font("normal", FS); doc.text(`prie ${DZ.shortDate(x.date).replace(/\./g, "-")} Saulės elektrinės įrengimo sutarties Nr. ${v(x.no)}`, ML, y); y += 5;
    rich(`Objekto adresas: ${v(o.address).replace(/\.$/, "")}. Elektrinės galia: **${o.power_kw ? fmtQ(o.power_kw) : BL} kW**. Įrengimo vieta: ${v(x.place)}.`); y += 2;
    const table = (cols, rows, boldLast) => {
      const hdr = () => { doc.setFillColor(232, 238, 243); doc.rect(ML, y - 3.8, CW, 6, "F"); let cx = ML; font("bold", 8.5); for (const cl of cols) { doc.text(cl.t, cl.r ? cx + cl.w - 1.5 : cx + 1.5, y, { align: cl.r ? "right" : "left" }); cx += cl.w; } y += 4.5; };
      hdr();
      rows.forEach((row, ri) => {
        font(boldLast && ri === rows.length - 1 ? "bold" : "normal", 8.5);
        const cells = cols.map((cl, i) => doc.splitTextToSize(String(row[i] ?? ""), cl.w - 3));
        const h = Math.max(...cells.map(cc => cc.length)) * 3.7 + 2;
        if (need(h + 1)) hdr();
        let cx = ML; cols.forEach((cl, i) => { doc.text(cells[i], cl.r ? cx + cl.w - 1.5 : cx + 1.5, y + 0.3, { align: cl.r ? "right" : "left" }); cx += cl.w; });
        y += h; doc.setDrawColor(200); doc.setLineWidth(0.15); doc.line(ML, y - 3.2, ML + CW, y - 3.2);
      });
    };
    // Eilutės – iš pasiūlymo; jei pasiūlyme rodomos eilučių kainos, jos rodomos ir specifikacijoje
    const priced = !!(g.offer && g.offer.show_prices);
    const nm = l => l.name + (l.desc ? " (" + l.desc + ")" : "");
    const spec = g.lines.map((l, i) => priced ? [i + 1 + ".", nm(l), l.qty, l.price === "" || l.price == null ? "" : money(l.price), money(l.sum)] : [i + 1 + ".", nm(l), l.qty]);
    const extra = ["Kabeliai, MC4 jungtys, apsaugos (DC kirtiklis, viršįtampių ribotuvai), įžeminimas, kintamosios srovės skydelis", "Dokumentų ESO (ir APVA, jei taikoma) parengimas ir pateikimas", "Stebėsenos sistemos (programėlės) prijungimas, Užsakovo apmokymas"];
    for (const e of extra) if (!g.lines.some(l => DZ.norm(l.name).includes(DZ.norm(e).slice(0, 12)))) spec.push(priced ? [spec.length + 1 + ".", e, "1 kompl.", "", "įskaičiuota"] : [spec.length + 1 + ".", e, "1 kompl."]);
    if (priced && g.calc) {
      spec.push(["", "Suma be PVM", "", "", money(g.calc.sub)]);
      if (g.calc.disc) spec.push(["", "Nuolaida", "", "", "− " + money(g.calc.disc)]);
      spec.push(["", `PVM ${fmtQ(g.vat)} %`, "", "", money(g.vatSum)], ["", "Iš viso su PVM", "", "", money(g.total)]);
      table([{ t: "Nr.", w: 10 }, { t: "Įranga / darbai", w: CW - 10 - 24 - 28 - 28 }, { t: "Kiekis", w: 24, r: true }, { t: "Kaina be PVM", w: 28, r: true }, { t: "Suma be PVM", w: 28, r: true }], spec, true);
    } else {
      if (g.total) spec.push(["", "Kaina iš viso su PVM" + (g.calc && g.calc.disc ? " (su nuolaida)" : ""), money(g.total) + " €"]);
      table([{ t: "Nr.", w: 12 }, { t: "Įranga / darbai", w: CW - 12 - 32 }, { t: "Kiekis", w: 32, r: true }], spec, !!g.total);
    }

    // Priedas Nr. 2
    y += 6; need(40);
    font("bold", 10.5); doc.text("PRIEDAS NR. 2 – MOKĖJIMŲ GRAFIKAS", ML, y); y += 6;
    const rows = x.advance > 0 && x.advance < 100
      ? [["1.", "Avansas", x.advance + " %", total ? money(adv) : BL, "per 5 darbo dienas nuo Sutarties pasirašymo"],
         ["2.", "Galutinis atsiskaitymas", (100 - x.advance) + " %", total ? money(rest) : BL, "per 5 darbo dienas nuo priėmimo–perdavimo akto pasirašymo"]]
      : [["1.", "Visa suma", "100 %", total ? money(total) : BL, "per 5 darbo dienas nuo priėmimo–perdavimo akto pasirašymo"]];
    rows.push(["", "Iš viso", "100 %", total ? money(total) : BL, ""]);
    table([{ t: "Nr.", w: 12 }, { t: "Mokėjimas", w: 52 }, { t: "Dalis", w: 20, r: true }, { t: "Suma su PVM, EUR", w: 34, r: true }, { t: "Terminas", w: CW - 118 }], rows, true);
    y += 14; need(16); sig(ML, y); sig(RX, y);
    font("normal", 8); doc.text("Rangovas", ML, y - 8); doc.text("Užsakovas", RX, y - 8);

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); font("normal", 7.5); doc.setTextColor(120); doc.text(`Sutartis Nr. ${v(x.no, "")} · ${i} / ${n}`, W - MR, H - 9, { align: "right" }); doc.setTextColor(0); }
    return doc;
  };
})();
