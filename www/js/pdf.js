// Įrangos priėmimo–perdavimo aktas (PDF) pagal UAB „Elreda“ formą; priedai – darbų žurnalas ir nuotraukos.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc, fmtQ = DZ.fmtQ;
  const MAIN_RE = /modul|inverter|keitikl|konstrukc|bater|akumul|optimiz/i;

  // Numatytieji akto tekstai iš objekto duomenų
  DZ.actDefaults = o => {
    const list = DZ.objEntries(o.id);
    const tot = DZ.totals(list);
    const main = tot.filter(m => MAIN_RE.test(m.name) || MAIN_RE.test((DZ.findProduct(m.name) || {}).category || ""));
    const goods = (main.length ? main : tot).map(m => `${fmtQ(m.qty)} ${m.unit} ${m.name}`).join("\n");
    const no = o.contract_no || "";
    const desc = (o.power_kw ? `sumontuota ${fmtQ(o.power_kw)} kW galios saulės elektrinė` : "sumontuota saulės elektrinė")
      + (no ? ` bei pateiktos Užsakovo nuosavybėn sutartyje Nr. ${no} nurodytos prekės:` : " bei pateiktos Užsakovo nuosavybėn šios prekės:");
    const works = "Atlikti elektros montavimo, paleidimo-derinimo darbai saulės elektrinėje" + (o.address ? " adresu: " + o.address : "") + ".";
    return { no, desc, goods, works };
  };

  DZ.actions["pdf-open"] = t => {
    const o = S.objects.find(x => x.id === t.dataset.id); if (!o) return;
    const d = DZ.actDefaults(o);
    const c = DZ.company();
    const photos = DZ.objEntries(o.id).reduce((s, e) => s + (e.photos || []).length, 0);
    DZ.openSheet(`<h2>Priėmimo–perdavimo aktas</h2>
      <p class="note">${esc(o.name)}${o.client_name ? " · " + esc(o.client_name) : ""}</p>
      <div class="row2"><label class="field"><span class="lbl">Akto Nr.</span><input id="pd-no" value="${esc(d.no)}" autocomplete="off" placeholder="pvz. GAM26-48046"></label>
        <label class="field"><span class="lbl">Data</span><input type="date" id="pd-date" value="${DZ.today()}"></label></div>
      <label class="field"><span class="lbl">Vieta</span><input id="pd-city" value="${esc(c.city || "Šilalė")}"></label>
      <label class="field"><span class="lbl">Objektas (tekstas po „Objektas:“)</span><textarea id="pd-desc" rows="3">${esc(d.desc)}</textarea></label>
      <label class="field"><span class="lbl">Prekės – po vieną eilutėje</span><textarea id="pd-goods" rows="5" placeholder="20 vnt. fotomodulių LONGI Solar LR7-54HVH-485M">${esc(d.goods)}</textarea></label>
      <label class="field"><span class="lbl">Atlikti darbai</span><textarea id="pd-works" rows="3">${esc(d.works)}</textarea></label>
      <label class="field"><span class="lbl">Papildomos pastabos (tuščia – bus linija ranka įrašyti)</span><textarea id="pd-notes" rows="2"></textarea></label>
      <span class="lbl">Priedai</span>
      <label class="w-who"><input type="checkbox" id="pd-log"><span>Darbų žurnalas (datos, darbai, darbuotojai, valandos)</span></label>
      <label class="w-who"><input type="checkbox" id="pd-photos" ${photos ? "" : "disabled"}><span>Nuotraukos (${photos}${photos > 24 ? ", bus įdėta 24" : ""})</span></label>
      ${!c.director || !c.iban ? `<p class="note box">Įmonės rekvizitai (direktorius, sąskaita) nustatomi meniu ⋯ → Įmonės nustatymai.</p>` : ""}
      <p class="note" id="pd-status"></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Sukurti PDF</button></div>`, { form: true, id: "pdf-form" });
    $("#pdf-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const btn = $("#pdf-form button[type=submit]"); btn.disabled = true;
      const st = $("#pd-status");
      const opt = {
        no: $("#pd-no").value.trim(), date: $("#pd-date").value || DZ.today(), city: $("#pd-city").value.trim(),
        desc: $("#pd-desc").value.trim(), goods: $("#pd-goods").value.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
        works: $("#pd-works").value.trim(), notes: $("#pd-notes").value.trim(),
        log: $("#pd-log").checked, photos: $("#pd-photos").checked
      };
      try {
        const doc = await DZ.makePdf(o, opt, m => { st.textContent = m; });
        st.textContent = "Išsaugoma…";
        const safe = o.name.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 40) || "objektas";
        await DZ.saveFile(`aktas_${(opt.no || safe).replace(/[^\p{L}\p{N}-]+/gu, "_")}.pdf`, "application/pdf", doc.output("blob"));
        DZ.closeSheet(true);
      } catch (e) {
        btn.disabled = false; st.className = "err"; st.textContent = "Nepavyko sukurti PDF: " + (e.message || e);
      }
    });
  };

  // ---------- Bibliotekos ----------
  let fonts = null;
  async function b64(url) {
    const r = await fetch(url); if (!r.ok) throw new Error("nerastas " + url);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function loadLibs(progress) {
    if (!window.jspdf) { progress("Įkeliama PDF biblioteka…"); await DZ.loadScript("vendor/jspdf.umd.min.js"); }
    if (!fonts) {
      progress("Įkeliamas šriftas…");
      try { fonts = await Promise.all(["DejaVuSerif", "DejaVuSerif-Bold", "DejaVuSerif-Italic"].map(n => b64("vendor/" + n + ".ttf"))); }
      catch (_) { const r = await b64("vendor/DejaVuSans.ttf"), b = await b64("vendor/DejaVuSans-Bold.ttf"); fonts = [r, b, r]; }
    }
  }
  const blobToDataUrl = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  const imgSize = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = rej; i.src = url; });

  // ---------- PDF ----------
  DZ.makePdf = async (o, opt, progress = () => {}) => {
    await loadLibs(progress);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addFileToVFS("SR.ttf", fonts[0]); doc.addFont("SR.ttf", "SR", "normal");
    doc.addFileToVFS("SR-B.ttf", fonts[1]); doc.addFont("SR-B.ttf", "SR", "bold");
    doc.addFileToVFS("SR-I.ttf", fonts[2]); doc.addFont("SR-I.ttf", "SR", "italic");
    const W = 210, H = 297, ML = 22, MR = 20, CW = W - ML - MR, BOT = H - 18;
    const FS = 10.5, LH = 5.6;
    let y = 30;
    const font = (style = "normal", size = FS) => { doc.setFont("SR", style); doc.setFontSize(size); };
    const need = h => { if (y + h > BOT) { doc.addPage(); y = 22; return true; } return false; };
    const center = (s, style, size) => { font(style, size); for (const l of doc.splitTextToSize(s, CW)) { need(LH); doc.text(l, W / 2, y, { align: "center" }); y += size * 0.5; } };
    const para = (s, style = "normal", x = ML, w = CW, lh = LH) => { font(style); for (const l of doc.splitTextToSize(String(s), w)) { need(lh); doc.text(l, x, y); y += lh; } };
    // Pastraipa su paryškintomis dalimis: [[tekstas, "bold"|"normal"|"italic"], ...]
    const rich = (parts, x = ML, w = CW) => {
      let cx = x;
      need(LH);
      for (const [txt, st] of parts) {
        for (const word of String(txt).split(/(?<=\s)/)) {
          font(st || "normal");
          const ww = doc.getTextWidth(word);
          if (cx + doc.getTextWidth(word.trimEnd()) > x + w && cx > x) { y += LH; need(LH); cx = x; if (!word.trim()) continue; }
          doc.text(word, cx, y); cx += ww;
        }
      }
      y += LH;
    };

    const c = DZ.company();
    const coName = c.name || "UAB „Elreda“";
    const client = (o.client_name || "Užsakovas").toUpperCase();

    // Antraštė
    center("ĮRANGOS PRIĖMIMO – PERDAVIMO NUOSAVYBĖN AKTAS" + (opt.no ? " NR. " + opt.no : ""), "bold", 12.5);
    y += 3;
    center("Data: " + DZ.shortDate(opt.date), "normal", FS); y += 1;
    if (opt.city) center(opt.city, "normal", FS);
    y += 10;

    // Šalys
    const intro = [[coName, "bold"]];
    if (c.director_gen) intro.push([" atstovaujama direktoriaus ", "normal"], [c.director_gen, "bold"]);
    intro.push([" (toliau – Vykdytojas)" + (c.code ? ", įmonės kodas " + c.code : "") + ", ir ", "normal"], [client, "bold"], [", (toliau – Užsakovas), pasirašydami šį aktą patvirtina, kad:", "normal"]);
    rich(intro);
    y += 8;

    // Paslaugos
    para("Vykdytojas Užsakovui suteikė šias paslaugas:", "italic"); y += 1.5;
    para("Objektas: " + opt.desc); y += 4;
    for (const g of opt.goods) {
      font("normal"); const ls = doc.splitTextToSize(g.replace(/;$/, "") + ";", CW - 12);
      need(LH * ls.length);
      doc.text("•", ML + 5, y); doc.text(ls, ML + 11, y); y += LH * ls.length;
    }
    y += 5;
    if (opt.works) { para(opt.works); y += 1.5; }
    if (opt.notes) { para("Papildomos pastabos: " + opt.notes); }
    else {
      font("normal"); need(LH * 2.2);
      doc.text("Papildomos pastabos:", ML, y);
      const lx = ML + doc.getTextWidth("Papildomos pastabos: ");
      doc.setDrawColor(60); doc.setLineWidth(0.2); doc.line(lx, y + 0.6, ML + CW - 12, y + 0.6);
      y += LH * 1.2; doc.line(ML, y + 0.6, ML + CW, y + 0.6); y += LH;
    }
    y += 1.5;
    para("Šiuo aktu tvirtinama, kad visa įranga nauja ir nenaudota, darbai atlikti kokybiškai ir laiku.");
    y += 1.5;
    para("Šis aktas sudarytas dviem vienodą juridinę galią turinčiais egzemplioriais – po vieną kiekvienai iš Šalių.");
    y += 10;

    // Rekvizitai ir parašai
    const left = [coName, c.address, c.iban ? "Ats. sąsk. " + c.iban : "", c.bank, c.code ? "Įmonės kodas " + c.code : "", c.vat ? "PVM mokėtojo kodas " + c.vat : "", c.phone ? "Tel. " + c.phone : "", c.email, c.director ? "Direktorius: " + c.director : ""].filter(Boolean);
    const right = [client, o.address, o.client_email ? "El.p.: " + o.client_email : "", o.client_phone ? "Tel. " + o.client_phone : ""].filter(Boolean);
    const RX = ML + 92, COLW = 82, RLH = 7;
    font("normal");
    const colH = lines => lines.reduce((h, l) => h + doc.splitTextToSize(l, COLW).length * (RLH - 1.5) + 1.5, 0);
    need(Math.max(colH(left), colH(right)) + 40);
    const top = y;
    font("normal"); doc.text("VYKDYTOJAS", ML + COLW / 2 - 10, y, { align: "center" }); doc.text("UŽSAKOVAS", RX, y);
    const col = (lines, x) => { let yy = top + 9; font("normal"); for (const l of lines) { const ls = doc.splitTextToSize(l, COLW); doc.text(ls, x, yy); yy += ls.length * (RLH - 1.5) + 1.5; } return yy; };
    const yl = col(left, ML), yr = col(right, RX);
    const sig = (x, yy) => { doc.setDrawColor(40); doc.setLineWidth(0.2); doc.line(x, yy, x + 40, yy); font("normal", 7); doc.text("parašas", x + 20, yy + 3.2, { align: "center" }); };
    sig(ML + 3, yl + 10); sig(RX, yr + 10);
    y = Math.max(yl, yr) + 20;

    // Priedas: darbų žurnalas
    const entries = DZ.objEntries(o.id).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
    let annex = 0;
    if (opt.log && entries.length) {
      doc.addPage(); y = 22;
      font("bold", 11.5); doc.text(`Priedas Nr. ${++annex}. Atliktų darbų žurnalas`, ML, y); y += 4;
      font("normal", 9); doc.text(`${o.name}${opt.no ? " · aktas Nr. " + opt.no : ""}`, ML, y + 4); y += 11;
      const cols = [{ t: "Data", w: 22 }, { t: "Atlikti darbai, medžiagos", w: 92 }, { t: "Darbuotojai", w: 42 }, { t: "Val.", w: 12, r: true }];
      const head = () => {
        doc.setFillColor(236, 239, 243); doc.rect(ML, y - 4, CW, 6, "F");
        let x = ML; font("bold", 8.5);
        for (const cl of cols) { doc.text(cl.t, cl.r ? x + cl.w - 1.5 : x + 1.5, y, { align: cl.r ? "right" : "left" }); x += cl.w; }
        y += 4.5;
      };
      head();
      let hrs = 0;
      for (const e of entries) {
        const mats = (e.materials || []).filter(m => m.name).map(m => `${m.name} ${fmtQ(m.qty)} ${m.unit || ""}`.trim()).join("; ");
        const row = [DZ.shortDate(e.date), (e.work || "—") + (mats ? "\nMedžiagos: " + mats : ""), (e.workers || []).map(w => w.name).join(", "), DZ.entryHours(e) ? fmtQ(DZ.entryHours(e)) : ""];
        hrs += DZ.entryHours(e);
        font("normal", 8.5);
        const cells = cols.map((cl, i) => doc.splitTextToSize(String(row[i]), cl.w - 3));
        const h = Math.max(...cells.map(cc => cc.length)) * 3.7 + 1.8;
        if (need(h + 1)) head();
        let x = ML;
        cols.forEach((cl, i) => { doc.text(cells[i], cl.r ? x + cl.w - 1.5 : x + 1.5, y + 0.4, { align: cl.r ? "right" : "left" }); x += cl.w; });
        y += h;
        doc.setDrawColor(215, 220, 226); doc.setLineWidth(0.15); doc.line(ML, y - 2.8, ML + CW, y - 2.8);
      }
      if (hrs) { need(7); font("bold", 9); doc.text("Iš viso valandų: " + fmtQ(hrs), ML + CW - 1.5, y + 1, { align: "right" }); y += 7; }
    }

    // Priedas: nuotraukos
    if (opt.photos) {
      const ph = []; for (const e of entries) for (const p of e.photos || []) ph.push({ p, date: e.date });
      const take = ph.slice(0, 24);
      if (take.length) {
        doc.addPage(); y = 22;
        font("bold", 11.5); doc.text(`Priedas Nr. ${++annex}. Nuotraukos`, ML, y); y += 8;
        const cw = (CW - 6) / 2, chH = 80;
        let colI = 0, done = 0;
        for (const it of take) {
          progress(`Įkeliamos nuotraukos ${++done}/${take.length}…`);
          let url, sz;
          try { url = await blobToDataUrl(await DZ.photoBlob(it.p, "1000")); sz = await imgSize(url); } catch (_) { continue; }
          if (colI === 0 && y + chH > BOT) { doc.addPage(); y = 22; }
          const x = ML + colI * (cw + 6);
          const s = Math.min(cw / sz.w, (chH - 7) / sz.h);
          const iw = sz.w * s, ih = sz.h * s;
          try { doc.addImage(url, "JPEG", x + (cw - iw) / 2, y, iw, ih, undefined, "FAST"); } catch (_) { continue; }
          font("normal", 8); doc.text(DZ.shortDate(it.date), x, y + ih + 4);
          colI = 1 - colI;
          if (colI === 0) y += chH;
        }
      }
    }

    // Puslapių numeriai (tik jei daugiau nei vienas)
    const n = doc.getNumberOfPages();
    if (n > 1) for (let i = 1; i <= n; i++) { doc.setPage(i); font("normal", 7.5); doc.setTextColor(110); doc.text(`${i} / ${n}`, W - MR, H - 9, { align: "right" }); doc.setTextColor(0); }
    return doc;
  };
})();
