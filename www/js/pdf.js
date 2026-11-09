// PDF aktas objektui: darbai, medžiagos, (kainos), nuotraukos, parašų vietos popieriui.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc, fmtQ = DZ.fmtQ;

  DZ.actions["pdf-open"] = t => {
    const o = S.objects.find(x => x.id === t.dataset.id); if (!o) return;
    const list = DZ.objEntries(o.id);
    const dates = list.map(e => e.date).sort();
    const photos = list.reduce((s, e) => s + (e.photos || []).length, 0);
    DZ.openSheet(`<h2>PDF aktas</h2>
      <p class="note">${esc(o.name)} · ${list.length} įrašai</p>
      <div class="row2"><label class="field"><span class="lbl">Nuo</span><input type="date" id="pd-from" value="${dates[0] || DZ.today()}"></label>
        <label class="field"><span class="lbl">Iki</span><input type="date" id="pd-to" value="${dates[dates.length - 1] || DZ.today()}"></label></div>
      <label class="field"><span class="lbl">Akto Nr. (nebūtina)</span><input id="pd-no" autocomplete="off"></label>
      <label class="w-who"><input type="checkbox" id="pd-prices" ${DZ.isLead() ? "checked" : ""}><span>Rodyti kainas ir sumas</span></label>
      <label class="w-who"><input type="checkbox" id="pd-workers" checked><span>Rodyti darbuotojus ir valandas</span></label>
      <label class="w-who"><input type="checkbox" id="pd-photos" ${photos ? "checked" : "disabled"}><span>Pridėti nuotraukas (${photos}${photos > 24 ? ", bus įdėta 24" : ""})</span></label>
      <p class="note" id="pd-status"></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Sukurti PDF</button></div>`, { form: true, id: "pdf-form" });
    $("#pdf-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const btn = $("#pdf-form button[type=submit]"); btn.disabled = true;
      const st = $("#pd-status");
      try {
        await makePdf(o, { from: $("#pd-from").value, to: $("#pd-to").value, no: $("#pd-no").value.trim(), prices: $("#pd-prices").checked, workers: $("#pd-workers").checked, photos: $("#pd-photos").checked }, m => { st.textContent = m; });
        DZ.closeSheet(true);
      } catch (e) {
        btn.disabled = false; st.className = "err"; st.textContent = "Nepavyko sukurti PDF: " + (e.message || e);
      }
    });
  };

  let fontsB64 = null;
  async function b64(url) {
    const r = await fetch(url); if (!r.ok) throw new Error("nerastas " + url);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function loadLibs(progress) {
    if (!window.jspdf) { progress("Įkeliama PDF biblioteka…"); await DZ.loadScript("vendor/jspdf.umd.min.js"); }
    if (!fontsB64) { progress("Įkeliamas šriftas…"); fontsB64 = await Promise.all([b64("vendor/DejaVuSans.ttf"), b64("vendor/DejaVuSans-Bold.ttf")]); }
  }
  const blobToDataUrl = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  const imgSize = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = rej; i.src = url; });

  async function makePdf(o, opt, progress) {
    await loadLibs(progress);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addFileToVFS("DejaVuSans.ttf", fontsB64[0]); doc.addFont("DejaVuSans.ttf", "DV", "normal");
    doc.addFileToVFS("DejaVuSans-Bold.ttf", fontsB64[1]); doc.addFont("DejaVuSans-Bold.ttf", "DV", "bold");
    const W = 210, H = 297, M = 15, CW = W - 2 * M;
    let y = M;
    const font = (size, bold) => { doc.setFont("DV", bold ? "bold" : "normal"); doc.setFontSize(size); };
    const lh = size => size * 0.42;
    const need = h => { if (y + h > H - M) { doc.addPage(); y = M; return true; } return false; };
    const text = (s, x, size = 10, bold = false, opts = {}) => { font(size, bold); doc.text(String(s), x, y, opts); };
    const para = (s, size = 10, bold = false, x = M, w = CW) => {
      font(size, bold);
      for (const l of doc.splitTextToSize(String(s), w)) { need(lh(size) + 1); doc.text(l, x, y); y += lh(size) + 0.8; }
    };

    const list = DZ.objEntries(o.id).filter(e => (!opt.from || e.date >= opt.from) && (!opt.to || e.date <= opt.to)).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
    const c = DZ.company();

    // Antraštė
    text(c.name || "UAB Elreda", M, 12, true); y += 5;
    const req = [c.code ? "Įm. k. " + c.code : "", c.vat ? "PVM k. " + c.vat : "", c.address, c.phone, c.email].filter(Boolean).join(" · ");
    if (req) para(req, 8);
    y += 6;
    text("ATLIKTŲ DARBŲ AKTAS" + (opt.no ? " Nr. " + opt.no : ""), W / 2, 15, true, { align: "center" }); y += 6;
    text(DZ.shortDate(DZ.today()), W / 2, 9, false, { align: "center" }); y += 8;

    const info = [["Objektas", o.name], ["Adresas", o.address], ["Užsakovas", [o.client_name, o.client_phone, o.client_email].filter(Boolean).join(", ")], ["Galia", o.power_kw ? fmtQ(o.power_kw) + " kW" : ""], ["Inverteris", o.inverter], ["Sutartis", [o.contract_date ? DZ.shortDate(o.contract_date) : "", opt.prices && o.contract_sum ? DZ.money(o.contract_sum) : ""].filter(Boolean).join(", ")], ["Laikotarpis", DZ.shortDate(opt.from) + " – " + DZ.shortDate(opt.to)]];
    for (const [k, v] of info) if (v) { font(9, true); need(5); doc.text(k + ":", M, y); font(9); const ls = doc.splitTextToSize(String(v), CW - 30); doc.text(ls, M + 30, y); y += ls.length * 4 + 1; }
    y += 4;

    // Lentelė
    function table(title, cols, rows, foot) {
      need(14);
      text(title, M, 11, true); y += 5;
      const head = () => {
        doc.setFillColor(235, 238, 242); doc.rect(M, y - 4, CW, 6, "F");
        let x = M; font(8, true);
        for (const col of cols) { doc.text(col.t, col.r ? x + col.w - 1.5 : x + 1.5, y, { align: col.r ? "right" : "left" }); x += col.w; }
        y += 4;
      };
      head();
      for (const row of rows) {
        font(8.5);
        const cells = cols.map((col, i) => doc.splitTextToSize(String(row[i] ?? ""), col.w - 3));
        const h = Math.max(...cells.map(cc => cc.length)) * 3.7 + 1.6;
        if (need(h + 1)) head();
        let x = M;
        cols.forEach((col, i) => { font(8.5, !!row.bold); doc.text(cells[i], col.r ? x + col.w - 1.5 : x + 1.5, y + 0.6, { align: col.r ? "right" : "left" }); x += col.w; });
        y += h;
        doc.setDrawColor(215, 220, 226); doc.line(M, y - 3, M + CW, y - 3);
      }
      if (foot) for (const f of foot) {
        need(6); font(9, true);
        doc.text(f[0], M + CW - 35, y + 0.6, { align: "right" }); doc.text(f[1], M + CW - 1.5, y + 0.6, { align: "right" }); y += 5;
      }
      y += 5;
    }

    // Darbai
    const workCols = opt.workers
      ? [{ t: "Data", w: 22 }, { t: "Atlikti darbai", w: 98 }, { t: "Darbuotojai", w: 45 }, { t: "Val.", w: 15, r: true }]
      : [{ t: "Data", w: 22 }, { t: "Atlikti darbai", w: 158 }];
    const workRows = list.map(e => {
      const r = [DZ.shortDate(e.date), e.work || "—"];
      if (opt.workers) r.push((e.workers || []).map(w => w.name).join(", "), DZ.entryHours(e) ? fmtQ(DZ.entryHours(e)) : "");
      return r;
    });
    const hours = list.reduce((t, e) => t + DZ.entryHours(e), 0);
    table("Atlikti darbai", workCols, workRows.length ? workRows : [["", "Įrašų nėra"]], opt.workers && hours ? [["Iš viso valandų:", fmtQ(hours)]] : null);

    // Medžiagos
    const tot = DZ.totals(list);
    if (tot.length) {
      const cols = opt.prices
        ? [{ t: "Nr.", w: 10 }, { t: "Medžiaga", w: 88 }, { t: "Kiekis", w: 22, r: true }, { t: "Mat. vnt.", w: 18 }, { t: "Kaina", w: 21, r: true }, { t: "Suma", w: 21, r: true }]
        : [{ t: "Nr.", w: 10 }, { t: "Medžiaga", w: 130 }, { t: "Kiekis", w: 22, r: true }, { t: "Mat. vnt.", w: 18 }];
      const rows = tot.map((m, i) => {
        const r = [String(i + 1), m.name, fmtQ(m.qty), m.unit];
        if (opt.prices) r.push(m.noPrice || !m.qty ? "" : DZ.money(m.sum / m.qty), m.noPrice ? "—" : DZ.money(m.sum));
        return r;
      });
      const matSum = tot.reduce((t, m) => t + m.sum, 0);
      const foot = [];
      if (opt.prices) {
        foot.push(["Medžiagos:", DZ.money(matSum)]);
        const rate = DZ.hourRate();
        if (rate && hours) foot.push([`Darbas (${fmtQ(hours)} val. × ${DZ.money(rate)}):`, DZ.money(hours * rate)], ["Iš viso be PVM:", DZ.money(matSum + hours * rate)]);
      }
      table("Panaudotos medžiagos", cols, rows, foot.length ? foot : null);
    }

    // Parašai
    need(42); y += 6;
    const sig = (x, who, name) => {
      font(9, true); doc.text(who, x, y);
      font(9); doc.text(name, x, y + 5);
      doc.setDrawColor(120); doc.line(x, y + 20, x + 75, y + 20);
      font(7); doc.text("(vardas, pavardė, parašas)", x, y + 24);
      doc.line(x, y + 32, x + 40, y + 32); doc.text("(data)", x, y + 36);
    };
    sig(M, "Darbus perdavė:", c.name || "UAB Elreda");
    sig(M + 95, "Darbus priėmė:", o.client_name || "Užsakovas");
    y += 42;

    // Nuotraukos
    if (opt.photos) {
      const ph = []; for (const e of list) for (const p of e.photos || []) ph.push({ p, date: e.date });
      const take = ph.slice(0, 24);
      if (take.length) {
        doc.addPage(); y = M;
        text("Nuotraukos", M, 12, true); y += 6;
        const cw = (CW - 6) / 2, chH = 78;
        let col = 0, done = 0;
        for (const it of take) {
          progress(`Įkeliamos nuotraukos ${++done}/${take.length}…`);
          let url, sz;
          try { url = await blobToDataUrl(await DZ.photoBlob(it.p, "1000")); sz = await imgSize(url); } catch (_) { continue; }
          if (col === 0 && y + chH + 6 > H - M) { doc.addPage(); y = M; }
          const x = M + col * (cw + 6);
          const s = Math.min(cw / sz.w, (chH - 6) / sz.h);
          const iw = sz.w * s, ih = sz.h * s;
          try { doc.addImage(url, "JPEG", x + (cw - iw) / 2, y, iw, ih, undefined, "FAST"); } catch (_) { continue; }
          font(7.5); doc.text(DZ.shortDate(it.date), x, y + ih + 4);
          col = 1 - col;
          if (col === 0) y += chH;
        }
      }
    }

    // Puslapių numeriai
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); font(7); doc.setTextColor(120); doc.text(`${o.name} · ${i}/${n}`, W - M, H - 8, { align: "right" }); doc.setTextColor(0); }

    progress("Išsaugoma…");
    const safe = o.name.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 40) || "objektas";
    await DZ.saveFile(`aktas_${safe}_${opt.to || DZ.today()}.pdf`, "application/pdf", doc.output("blob"));
  }
})();
