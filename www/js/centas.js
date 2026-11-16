// Eksportas į buhalterinę programą „Centas“: kontrahentų (klientų) XLS lentelė.
// Stulpeliai – kaip Cento „Kontrahentai → Importas iš XLS lentelės“ pavyzdyje (20 stulpelių).
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state;
  const COLS = ["Įm. Kodas", "Pavadinimas", "Korespond. adresas", "Telefonas", "Faksas", "El. paštas", "Ats. Asmuo", "PVM kodas", "Miestas", "Šalis",
    "PVM kodas pardavime", "PVM kodas pirkime", "Deb. Skola", "Kred. Skola", "Skolos fiksavimo data", "Banko sąskaita IBAN", "Vartotojas", "Grupė", "Savivaldybė", "Skola, EUR"];

  // „Mokyklos g. 12A, Nevočių k., Traksėdžio sen., Šilalės r. sav.“ → gatvė, miestas/kaimas, savivaldybė
  DZ.splitAddress = a => {
    const p = String(a || "").split(",").map(s => s.trim()).filter(Boolean);
    const sav = p.find(s => /\bsav\.?$/i.test(s)) || "";
    const rest = p.filter(s => s !== sav && !/\bsen\.?$/i.test(s));
    const isPlace = s => /\b(k\.|m\.|mstl\.|vs\.|kaimas|miestas)$/i.test(s) || !/\d/.test(s);
    let street = "", city = "";
    if (rest.length >= 2) { street = rest[0]; city = rest.slice(1).find(isPlace) || rest[1]; }
    else if (rest.length === 1) { if (/\d|g\.|al\.|pr\.|tak\./i.test(rest[0]) && !/^\d+$/.test(rest[0])) street = rest[0]; else city = rest[0]; }
    // Miesto savivaldybė be kaimo: „S. Biržišio g. 8, Šilalė“ → savivaldybė nežinoma, miestas Šilalė
    return { street: street || p[0] || "", city, sav: sav ? sav.replace(/\.?$/, ".") : "" };
  };

  function rows() {
    const seen = new Map();
    for (const o of S.objects) {
      const name = (o.client_name || "").trim(); if (!name) continue;
      const eso = o.eso || {};
      const addr = eso.client_address || o.address || "";
      const a = DZ.splitAddress(addr);
      const key = (o.client_code || "").trim() || DZ.norm(name) + "|" + DZ.norm(a.street);
      if (seen.has(key)) continue;
      seen.set(key, [
        (o.client_code || "").trim(), name, a.street, (o.client_phone || eso.phone || "").trim(), "", (o.client_email || eso.email || "").trim(), "",
        (o.client_vat || "").trim(), a.city, "Lietuva", "", "", "", "", "", "", "", "", a.sav, ""
      ]);
    }
    return [...seen.values()].sort((x, y) => DZ.byName(x[1], y[1]));
  }

  DZ.actions["centas-export"] = async () => {
    const list = rows();
    if (!list.length) { DZ.toast("Nėra objektų su klientu", true); return; }
    DZ.toast("Ruošiamas failas…");
    try {
      if (!window.XLSX) await DZ.loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
      const ws = window.XLSX.utils.aoa_to_sheet([COLS, ...list]);
      // Kodai ir telefonai – kaip tekstas (kad neprarastų nulių)
      for (let r = 1; r <= list.length; r++) for (const c of [0, 3, 7]) { const ref = window.XLSX.utils.encode_cell({ r, c }); if (ws[ref]) ws[ref].t = "s"; }
      ws["!cols"] = COLS.map((h, i) => ({ wch: [12, 30, 30, 14, 8, 26, 10, 14, 16, 8][i] || 12 }));
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const out = window.XLSX.write(wb, { bookType: "biff8", type: "array" });
      const name = "kontrahentai_centas_" + DZ.today().replace(/-/g, "") + ".xls";
      await DZ.saveFile(name, "application/vnd.ms-excel", new Blob([out], { type: "application/vnd.ms-excel" }));
      const noCode = list.filter(r => !r[0]).length;
      DZ.toast(`Eksportuota klientų: ${list.length}` + (noCode ? ` (be kodo: ${noCode})` : ""));
    } catch (e) { DZ.toast("Nepavyko: " + (e.message || e), true); }
  };
})();
