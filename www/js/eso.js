// ESO prijungimo sąlygų importas: PDF arba nuotrauka → objekto kortelės laukai.
// PDF tekstas skaitomas telefone (pdf.js), nuotrauka ar skenuotas PDF – teksto atpažinimu (Tesseract, lietuvių k.).
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc;
  const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/";
  const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

  // ---------- Teksto analizė ----------
  // Lietuviškas raides keičiame lotyniškomis 1:1, kad pozicijos sutaptų (atpažinimas dažnai pameta nosines).
  const LT = { ą: "a", č: "c", ę: "e", ė: "e", į: "i", š: "s", ų: "u", ū: "u", ž: "z", Ą: "A", Č: "C", Ę: "E", Ė: "E", Į: "I", Š: "S", Ų: "U", Ū: "U", Ž: "Z" };
  const fold = s => s.replace(/[ąčęėįšųūžĄČĘĖĮŠŲŪŽ]/g, c => LT[c]);
  const num = s => { if (s == null) return null; const n = parseFloat(String(s).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
  const title = s => s.toLowerCase().replace(/(^|[\s\-–.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const clean = s => (s || "").replace(/\s{2,}.*$/, "").replace(/[\s,;]+$/, "").trim();

  DZ.esoParse = raw => {
    const text = raw.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n");
    const f = fold(text);
    // m(regex ant „sulankstyto“ teksto) → grupės paimamos iš originalo tose pačiose vietose
    const m = (re, from = 0) => {
      const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"); r.lastIndex = from;
      const x = r.exec(f); if (!x) return null;
      const out = [text.substr(x.index, x[0].length)];
      let pos = x.index;
      for (let i = 1; i < x.length; i++) {
        if (x[i] == null) { out.push(null); continue; }
        const at = f.indexOf(x[i], pos); out.push(at >= 0 ? text.substr(at, x[i].length) : x[i]); if (at >= 0) pos = at;
      }
      out.index = x.index; return out;
    };
    const d = {};
    let x;
    if ((x = m(/PRI[JI]UNGIMO\s+SALYGOS\s+NR\.?\s*([A-Z]{2,4}\s?\d{2}\s?-\s?\d{3,})/i))) d.no = x[1].replace(/\s/g, "").toUpperCase();
    if ((x = m(/Parengta:?\s*(\d{4}-\d{2}-\d{2})/i))) d.date = x[1];
    if ((x = m(/Galioja\s+iki:?\s*(\d{4}-\d{2}-\d{2})/i))) d.valid_until = x[1];
    if ((x = m(/(?:^|\n)\s*Klientas:?\s*([^\n]+)/i))) d.client = title(clean(x[1]));
    const ci = f.search(/Kliento\s+kontaktiniai\s+duomenys/i), oi = f.search(/Objekto\s+pavadinimas/i);
    if (ci >= 0) {
      const block = text.slice(ci, oi > ci ? oi : ci + 300).replace(/Kliento\s+kontaktiniai\s+duomenys:?/i, "");
      const ph = block.match(/(\+?370[\s\-]?\d[\d\s\-]{6,10}\d|\b8[\s\-]?6\d[\d\s\-]{5,8}\d)/);
      if (ph) d.phone = ph[1].replace(/[\s\-]/g, "").replace(/^8(?=6)/, "+370").replace(/^370/, "+370");
      const em = block.replace(/\s*\n\s*/g, "").match(/[\w.+\-]+@[\w\-]+(\.[\w\-]+)+/);
      if (em) d.email = em[0].toLowerCase();
      const addr = block.split(/,\s*(?:\+?370|8\s?6)/)[0].replace(/\s+/g, " ").trim();
      if (addr && addr.length > 5) d.client_address = addr.replace(/,$/, "");
    }
    if ((x = m(/Objekto\s+pavadinimas:?\s*([^\n]+)/i))) d.object_title = clean(x[1]);
    if ((x = m(/Objekto\s+adresas:?\s*([^\n]+)/i))) d.address = clean(x[1]);
    if ((x = m(/Investicinio\s+projekto\s+Nr\.?:?\s*([A-Z0-9\-]+)/i))) d.project_no = x[1];
    if ((x = m(/Nauja\s+leistina\s+naudoti\s+galia\s+kW\s+([\d.,]+)/i))) d.use_kw_new = num(x[1]);
    if ((x = m(/Visa\s+leistina\s+naudoti\s+galia\s+kW\s+([\d.,]+)\s*(Trifazis|Vienfazis)?/i))) { d.use_kw = num(x[1]); if (x[2]) d.phase = title(x[2]); }
    if (!d.phase && (x = m(/naudoti\s+galia[^\n]*?(Trifazis|Vienfazis)/i))) d.phase = title(x[1]);
    // Elektrinės lentelė: Nauji / Iš viso – įrengtoji, leistina generuoti, keitiklių, sinchroninių generatorių galia
    const ti = f.search(/Objekto\s+duomenys|Sumine\s+irengtoji/i);
    if (ti >= 0) {
      if ((x = m(/Is\s+viso\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i, ti))) { d.installed_kw = num(x[1]); d.gen_kw = num(x[2]); d.inverter_kw = num(x[3]); }
      if ((x = m(/Nauji\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)\s+(Taip|Ne)\b/i, ti))) { d.voltage_kv = num(x[1]); d.hybrid = x[2]; }
    }
    if ((x = m(/(?:^|\n)\s*(Saule|Vejas|Hidro\S*|Biokuras|Biodujos)\s+[\d.,]+\s+[\d.,]+/i, ti >= 0 ? ti : 0))) d.source = x[1];
    if ((x = m(/spintoje[^\n]*?\b((?:KS|KAS|KSK|AS)\s?-\s?\d+[A-Z]?)/i))) d.cabinet = x[1].replace(/\s/g, "");
    if ((x = m(/transformatorines\s+([A-Z]{1,4}\s?-\s?\d+[A-Z0-9\-]*)/i))) d.substation = x[1].replace(/\s/g, "");
    if ((x = m(/(trifazi|vienfazi)\s+\W?\s*([A-D])\s*\W?\s+charakteristikos\s+(\d+)\s*A\b/i))) d.breaker = `${x[1].toLowerCase().startsWith("t") ? "3P" : "1P"} ${x[2].toUpperCase()}${x[3]} A`;
    return d;
  };

  // ---------- Dokumento skaitymas ----------
  const loadPdfJs = async () => {
    if (window.pdfjsLib) return window.pdfjsLib;
    await DZ.loadScript(PDFJS + "pdf.min.js");
    // Darbinis failas iš kito domeno – per blob, kad veiktų ir programėlėje
    const src = await (await fetch(PDFJS + "pdf.worker.min.js")).text();
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    return window.pdfjsLib;
  };
  // Teksto elementai → eilutės (pagal aukštį), tarpai tarp stulpelių – dvigubi
  async function pdfText(buf, progress) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
      progress(`Skaitomas PDF (${p} psl.)…`);
      const page = await pdf.getPage(p), tc = await page.getTextContent();
      const rows = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = it.transform[5], xx = it.transform[4];
        let r = rows.find(r => Math.abs(r.y - y) < 3);
        if (!r) { r = { y, items: [] }; rows.push(r); }
        r.items.push({ x: xx, w: it.width || 0, s: it.str });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        let line = "", end = null;
        for (const it of r.items) { line += end == null ? it.s : (it.x - end > 6 ? "   " : (/\s$/.test(line) || /^\s/.test(it.s) ? "" : " ")) + it.s; end = it.x + it.w; }
        out.push(line);
      }
    }
    return { text: out.join("\n"), pdf };
  }
  async function ocr(images, progress) {
    if (!window.Tesseract) { progress("Įkeliamas teksto atpažinimas…"); await DZ.loadScript(TESS); }
    const worker = await window.Tesseract.createWorker("lit", 1, { logger: l => { if (l.status === "recognizing text") progress(`Atpažįstamas tekstas… ${Math.round(l.progress * 100)} %`); } });
    let text = "";
    try { for (const im of images) text += (await worker.recognize(im)).data.text + "\n"; } finally { await worker.terminate(); }
    return text;
  }
  async function renderPages(pdf, n) {
    const out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, n); p++) {
      const page = await pdf.getPage(p), vp = page.getViewport({ scale: 2.2 });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; out.push(c);
    }
    return out;
  }
  DZ.esoRead = async (file, progress) => {
    const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name || "");
    if (isPdf) {
      const r = await pdfText(await file.arrayBuffer(), progress);
      if (r.text.replace(/\s/g, "").length > 200) return r.text;
      progress("PDF be teksto – atpažįstama kaip nuotrauka…");
      return ocr(await renderPages(r.pdf, 2), progress);   // skenuotas PDF
    }
    return ocr([file], progress);
  };

  if (DZ.DOC_TYPES) DZ.DOC_TYPES.eso = "ESO sąlygos";

  // ---------- Objekto redagavimo lange ----------
  DZ.esoPending = null;
  DZ.esoButtonHtml = () => `<div class="eso-import">
      <label class="btn eso-btn"><input type="file" id="eso-file" accept="application/pdf,.pdf,image/*" hidden>📄 Užpildyti iš ESO prijungimo sąlygų</label>
      <p class="note" id="eso-status">PDF arba dokumento nuotrauka. Laukus galėsite pataisyti prieš išsaugant.</p>
    </div>`;
  const FIELDS = [
    ["o-name", d => d.client || d.address, "Pavadinimas"],
    ["o-addr", d => d.address, "Adresas"],
    ["o-cname", d => d.client, "Klientas"],
    ["o-cphone", d => d.phone, "Telefonas"],
    ["o-cmail", d => d.email, "El. paštas"],
    ["o-kw", d => d.gen_kw ?? d.installed_kw, "Galia"],
    ["o-cno", d => d.no, "Sutarties Nr."]
  ];
  DZ.esoBind = () => {
    DZ.esoPending = null;
    const inp = $("#eso-file"); if (!inp) return;
    inp.addEventListener("change", async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      const st = $("#eso-status"), lbl = inp.closest("label");
      const progress = t => { st.textContent = t; };
      lbl.classList.add("busy"); st.classList.remove("err");
      try {
        const text = await DZ.esoRead(file, progress);
        const d = DZ.esoParse(text);
        if (!d.no && !d.client && !d.address) throw new Error("Dokumente neradau prijungimo sąlygų duomenų. Ar tai ESO prijungimo sąlygos? Jei nuotrauka – nufotografuokite pirmą lapą tiesiai ir ryškiai.");
        const filled = [], kept = [];
        for (const [id, get, label] of FIELDS) {
          const el = $("#" + id), val = get(d);
          if (!el || val == null || val === "") continue;
          if (!el.value.trim()) { el.value = val; el.classList.add("eso-filled"); filled.push(label); }
          else if (String(el.value.trim()).toLowerCase() !== String(val).toLowerCase()) kept.push(`${label}: ${val}`);
        }
        d.file = file.name || "";
        DZ.esoPending = { data: d, file };
        st.innerHTML = `<b>Nuskaityta${d.no ? " " + esc(d.no) : ""}.</b> ${filled.length ? "Užpildyta: " + esc(filled.join(", ").replace(/\.$/, "")) + "." : "Laukai jau buvo užpildyti."}` +
          (kept.length ? `<br>Palikta kaip buvo (dokumente kitaip): ${esc(kept.join("; "))}.` : "") +
          `<br>Kiti ESO duomenys (leistina galia, įvadas, galiojimas) bus išsaugoti objekto kortelėje, o dokumentas – prie objekto dokumentų.`;
      } catch (e) {
        st.classList.add("err");
        st.textContent = /fetch|network|load|Failed/i.test(e.message || "") ? "Nepavyko įkelti skaitymo įrankio – reikia interneto ryšio." : (e.message || String(e));
      } finally { lbl.classList.remove("busy"); inp.value = ""; }
    });
  };
  // Išsaugojus objektą – dokumentas į Google Drive (objekto aplankas) ir prie objekto dokumentų
  DZ.esoAfterSave = async o => {
    const p = DZ.esoPending; DZ.esoPending = null;
    if (!p || !p.file || !DZ.uploadFile) return;
    try {
      const isPdf = /pdf/i.test(p.file.type) || /\.pdf$/i.test(p.file.name || "");
      const blob = p.file;
      const name = "ESO_salygos_" + (p.data.no || "").replace(/[^\w\-]/g, "");
      const path = await DZ.uploadFile(blob, isPdf ? "application/pdf" : (blob.type || "image/jpeg"), name, o.name, DZ.today());
      if (DZ.isAdmin()) {
        const r = await DZ.sb.from("object_docs").insert({ object_id: o.id, path, type: "eso", mime: isPdf ? "application/pdf" : (blob.type || "image/jpeg"), name: name + (isPdf ? ".pdf" : ".jpg"), date: p.data.date || DZ.today() }).select().single();
        if (!r.error && S.docs) S.docs.push(r.data);
      }
      DZ.toast("ESO sąlygos įkeltos į Google Drive");
    } catch (e) { DZ.toast("ESO dokumento į Google Drive įkelti nepavyko: " + (e.message || e), true); }
    DZ.render();
  };

  // ---------- Objekto kortelėje ----------
  DZ.objEsoHtml = o => {
    const d = o.eso; if (!d || typeof d !== "object" || !Object.keys(d).length) return "";
    const kw = v => v == null ? "" : String(v).replace(".", ",") + " kW";
    const exp = d.valid_until && d.valid_until < DZ.today();
    const rows = [
      ["Sąlygų Nr.", [d.no, d.date ? "nuo " + DZ.shortDate(d.date) : ""].filter(Boolean).join(", ")],
      ["Galioja iki", d.valid_until ? DZ.shortDate(d.valid_until) + (exp ? " – nebegalioja" : "") : ""],
      ["Leistina generuoti", kw(d.gen_kw)],
      ["Įrengtoji / keitiklių", [kw(d.installed_kw), kw(d.inverter_kw)].filter(Boolean).join(" / ")],
      ["Leistina naudoti", [kw(d.use_kw), d.phase].filter(Boolean).join(", ")],
      ["Įvadas", [d.cabinet, d.substation ? "nuo " + d.substation : "", d.breaker ? "jungiklis " + d.breaker : ""].filter(Boolean).join(", ")],
      ["Hibridinė", d.hybrid || ""],
      ["Projekto Nr.", d.project_no || ""],
      ["Objektas", d.object_title || ""]
    ].filter(r => r[1]);
    return `<div class="card eso-card"><span class="lbl">ESO prijungimo sąlygos</span>
      <table class="mat-table"><tbody>${rows.map(([a, b]) => `<tr${a === "Galioja iki" && exp ? ' class="neg"' : ""}><td class="muted">${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</tbody></table></div>`;
  };
})();
