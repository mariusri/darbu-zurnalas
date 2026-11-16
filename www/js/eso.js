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

  // m(regex ant „sulankstyto“ teksto) → grupės paimamos iš originalo tose pačiose vietose
  const matcher = raw => {
    const text = raw.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n");
    const f = fold(text);
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
    return { text, f, m };
  };

  DZ.esoParse = raw => {
    const { text, f, m } = matcher(raw);
    if (/DEKLARACIJA/i.test(f) && /keitiklio/i.test(f) && !/PRI[JI]UNGIMO\s+SALYGOS\s+NR/i.test(f)) return DZ.esoParseDecl(raw);
    const d = { kind: "salygos" };
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

  // Rangovo deklaracija apie iki 100 kW elektrinės įrengimą: moduliai, keitiklis, galios
  const watts = model => { const w = (model || "").match(/(?:^|[\s\-])(\d{3})(?:\s?W|[A-Z]{0,3})?\s*$/i); return w && +w[1] >= 200 && +w[1] <= 900 ? +w[1] : null; };
  DZ.esoParseDecl = raw => {
    const { text, f, m } = matcher(raw);
    const d = { kind: "deklaracija" };
    let x;
    const di = f.search(/DEKLARACIJA/i);
    if ((x = m(/(20\d\d-\d\d-\d\d)/, di >= 0 ? di : 0))) d.date = x[1];
    if ((x = m(/Objekto\s+pavadinimas\s+ir\s+adresas\s+([^\n]+)(\n(?!\s*Objekto\s+savininkas)[^\n:]{3,60}(?=\n))?/i))) {
      const v = (x[1] + (x[2] ? " " + x[2].trim() : "")).replace(/\s+/g, " ").replace(/[,\s]+$/, "");
      d.object = v; const parts = v.split(/,\s*/); d.address = parts.length > 2 ? parts.slice(1).join(", ") : v;
    }
    if ((x = m(/Objekto\s+savininkas[^\n]*?\s{2,}(\S[^\n]+)/i))) d.owner = title(clean(x[1]));
    if ((x = m(/salygu\s+data[^\n]*?(\d{4}-\d{2}-\d{2})/i))) d.cond_date = x[1];
    if ((x = m(/salygu\s+numeris[^\n]*?\)\s+([A-Z]{0,4}\s?\d{2}\s?-\s?\d{3,})/i))) d.cond_no = x[1].replace(/\s/g, "");
    // Kiekvienas įtampos keitiklis – atskira dalis
    const secs = [], re = /Itampos\s+keitiklio\s+Nr\.?\s*(\d+)/gi; let s;
    while ((s = re.exec(f))) secs.push(s.index);
    const units = secs.map((a, i) => {
      const sub = matcher(text.slice(a, i + 1 < secs.length ? secs[i + 1] : f.search(/Bendra\s+objekto/i) > a ? f.search(/Bendra\s+objekto/i) : text.length));
      const u = {}; let y;
      if ((y = sub.m(/Fotomoduliu\s+tipas[^\n]*?\)\s+([^\n]+)/i))) u.module = clean(y[1]);
      if ((y = sub.m(/keitiklio\s+modelis\s*\(gamintojas\)\s+([^\n]+)/i))) u.inverter = clean(y[1]);
      if ((y = sub.m(/irengtoji\s+galia,?\s*kW\s+([\d.,]+)(?:\s+([\d.,]+))?/i))) u.installed_kw = num(y[2] ?? y[1]);
      if ((y = sub.m(/leistina\s+generuoti\s+galia,?\s*kW\s+([\d.,]+)(?:\s+([\d.,]+))?/i))) u.gen_kw = num(y[2] ?? y[1]);
      if ((y = sub.m(/keitiklio\s+vardine\s+aktyvioji\s+galia,?\s*kW\s+([\d.,]+)/i))) u.inverter_kw = num(y[1]);
      if ((y = sub.m(/prijungiami[^\n]*?\s{2,}(\S[^\n]+)/i))) u.source = clean(y[1]);
      return u;
    }).filter(u => u.module || u.inverter);
    if (units.length) {
      const mods = [...new Set(units.map(u => u.module).filter(Boolean))], invs = [...new Set(units.map(u => u.inverter).filter(Boolean))];
      d.module_type = mods.join(" + "); d.inverter = invs.join(" + ");
      d.inverter_count = units.filter(u => u.inverter).length;
      d.installed_kw = units.reduce((t, u) => t + (u.installed_kw || 0), 0) || null;
      d.inverter_kw = units.reduce((t, u) => t + (u.inverter_kw || 0), 0) || null;
      d.gen_kw = units.reduce((t, u) => t + (u.gen_kw || 0), 0) || null;
      d.module_w = mods.length === 1 ? watts(mods[0]) : null;
      if (d.module_w && d.installed_kw) { const c = d.installed_kw * 1000 / d.module_w; if (Math.abs(c - Math.round(c)) < 0.05) d.module_count = Math.round(c); }
      d.units = units;
    }
    // Bendra lentelė: suminė įrengtoji, leistina generuoti, keitiklių, Pmax, leistina naudoti
    const bi = f.search(/Bendra\s+objekto/i);
    if (bi >= 0 && (x = m(/\n\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/, bi))) {
      d.installed_kw = num(x[1]) ?? d.installed_kw; d.gen_kw = num(x[2]) ?? d.gen_kw; d.inverter_kw = num(x[3]) ?? d.inverter_kw; d.pmax_kw = num(x[4]); d.use_kw = num(x[5]);
      if (d.module_w && d.installed_kw && !d.module_count) { const c = d.installed_kw * 1000 / d.module_w; if (Math.abs(c - Math.round(c)) < 0.05) d.module_count = Math.round(c); }
    }
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
      <label class="btn eso-btn"><input type="file" id="eso-file" accept="application/pdf,.pdf,image/*" hidden>📄 Užpildyti iš ESO sąlygų arba deklaracijos</label>
      <p class="note" id="eso-status">ESO prijungimo sąlygos arba rangovo deklaracija – PDF ar nuotrauka. Laukus galėsite pataisyti prieš išsaugant.</p>
    </div>`;
  const FIELDS = [
    ["o-name", d => d.client || d.owner || d.address, "Pavadinimas"],
    ["o-addr", d => d.address, "Adresas"],
    ["o-cname", d => d.client || d.owner, "Klientas"],
    ["o-cphone", d => d.phone, "Telefonas"],
    ["o-cmail", d => d.email, "El. paštas"],
    ["o-kw", d => d.kind === "deklaracija" ? d.installed_kw : (d.gen_kw ?? d.installed_kw), "Galia", d => d.kind === "deklaracija"],
    ["o-cno", d => d.no, "Sutarties Nr."],
    // Iš deklaracijos – pagrindas aktui, todėl perrašoma
    ["o-mtype", d => d.module_type, "Modulių tipas", true],
    ["o-mcount", d => d.module_count, "Modulių kiekis", true],
    ["o-inv", d => d.inverter, "Inverteris", true],
    ["o-icount", d => d.inverter_count, "Inverterių kiekis", true]
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
        const decl = d.kind === "deklaracija";
        if (decl ? !(d.module_type || d.inverter) : !(d.no || d.client || d.address)) throw new Error("Dokumente neradau reikalingų duomenų. Tinka ESO prijungimo sąlygos arba rangovo deklaracija. Jei nuotrauka – nufotografuokite pirmą lapą tiesiai ir ryškiai.");
        const filled = [], changed = [], kept = [];
        for (const [id, get, label, force] of FIELDS) {
          const el = $("#" + id), val = get(d);
          if (!el || val == null || val === "") continue;
          const cur = el.value.trim();
          if (!cur) { el.value = val; el.classList.add("eso-filled"); filled.push(label); }
          else if (cur.toLowerCase() !== String(val).toLowerCase() && !(DZ.num(cur) && DZ.num(cur) === Number(val))) {
            if (typeof force === "function" ? force(d) : force) { el.value = val; el.classList.add("eso-filled"); changed.push(`${label}: ${cur} → ${val}`); }
            else kept.push(`${label}: ${val}`);
          }
        }
        // Saugoma kartu su ankstesniais ESO duomenimis (sąlygos + deklaracija)
        const obj = S.view === "object" ? S.objects.find(x => x.id === S.objectId) : null;
        const prev = obj && obj.eso && typeof obj.eso === "object" ? obj.eso : {};
        d.file = file.name || "";
        const merged = decl ? Object.assign({}, prev, { decl: d }) : Object.assign({}, d, prev.decl ? { decl: prev.decl } : {});
        DZ.esoPending = { data: merged, doc: d, file };
        st.innerHTML = `<b>Nuskaityta ${decl ? "deklaracija" : "ESO sąlygos"}${d.no || d.cond_no ? " " + esc(d.no || d.cond_no) : ""}.</b> ${filled.length ? "Užpildyta: " + esc(filled.join(", ")) + "." : ""}` +
          (changed.length ? `<br>Pakeista pagal deklaraciją: ${esc(changed.join("; "))}.` : "") +
          (kept.length ? `<br>Palikta kaip buvo (dokumente kitaip): ${esc(kept.join("; "))}.` : "") +
          (decl ? `<br>Moduliai ir inverteris su galia pateks į aktą.` : `<br>Kiti ESO duomenys (leistina galia, įvadas, galiojimas) bus išsaugoti objekto kortelėje.`) + ` Dokumentas bus įkeltas prie objekto dokumentų.`;
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
      const doc = p.doc || p.data, decl = doc.kind === "deklaracija";
      const name = (decl ? "Deklaracija_" : "ESO_salygos_") + (doc.no || doc.cond_no || "").replace(/[^\w\-]/g, "");
      const path = await DZ.uploadFile(blob, isPdf ? "application/pdf" : (blob.type || "image/jpeg"), name, o.name, DZ.today());
      if (DZ.isAdmin()) {
        const r = await DZ.sb.from("object_docs").insert({ object_id: o.id, path, type: "eso", mime: isPdf ? "application/pdf" : (blob.type || "image/jpeg"), name: name + (isPdf ? ".pdf" : ".jpg"), date: doc.date || DZ.today() }).select().single();
        if (!r.error && S.docs) S.docs.push(r.data);
      }
      DZ.toast((decl ? "Deklaracija" : "ESO sąlygos") + " įkeltos į Google Drive");
    } catch (e) { DZ.toast("ESO dokumento į Google Drive įkelti nepavyko: " + (e.message || e), true); }
    DZ.render();
  };

  // ---------- Objekto kortelėje ----------
  DZ.objEsoHtml = o => {
    const d = o.eso; if (!d || typeof d !== "object" || !Object.keys(d).length) return "";
    const k = d.decl || null;
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
      ["Objektas", d.object_title || ""],
      ["Deklaracija", k ? (k.date ? DZ.shortDate(k.date) : "pateikta") : ""],
      ["Moduliai", k && k.module_type ? [k.module_count ? k.module_count + " vnt." : "", k.module_type, k.installed_kw ? "(" + kw(k.installed_kw) + ")" : ""].filter(Boolean).join(" ") : ""],
      ["Inverteris", k && k.inverter ? [k.inverter_count > 1 ? k.inverter_count + " vnt." : "", k.inverter, k.inverter_kw ? "(" + kw(k.inverter_kw) + ")" : ""].filter(Boolean).join(" ") : ""]
    ].filter(r => r[1]);
    return `<div class="card eso-card"><span class="lbl">${d.no || !k ? "ESO prijungimo sąlygos" : "ESO deklaracija"}</span>
      <table class="mat-table"><tbody>${rows.map(([a, b]) => `<tr${a === "Galioja iki" && exp ? ' class="neg"' : ""}><td class="muted">${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</tbody></table></div>`;
  };
})();
