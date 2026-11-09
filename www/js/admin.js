// Administravimas: vartotojai ir rolės, darbuotojų sąrašas, prekių katalogas, nustatymai, slaptažodis, meniu.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$, esc = DZ.esc, fmtQ = DZ.fmtQ;
  const back = title => `<div class="view-head"><button class="icon-btn" data-act="back" aria-label="Atgal">‹</button><h2>${esc(title)}</h2></div>`;

  // ---------- Meniu ----------
  DZ.toggleMenu = () => {
    const host = $("#menu-host");
    if (host.innerHTML) { host.innerHTML = ""; return; }
    const p = S.profile || {};
    const waiting = DZ.isAdmin() ? S.profiles.filter(x => x.status === "laukia").length : 0;
    host.innerHTML = `<div class="menu" role="menu">
      <div class="who"><b>${esc(p.name || "")}</b><br>${esc(S.user ? S.user.email : "")}<br><span class="pill">${esc(DZ.ROLES[p.role] || "")}</span></div>
      ${DZ.isAdmin() ? `<button data-act="menu-go" data-v="users">Vartotojai ir rolės${waiting ? ` <span class="badge">${waiting}</span>` : ""}</button>` : ""}
      ${DZ.isLead() ? `<button data-act="crew">Darbuotojų sąrašas</button><button data-act="menu-go" data-v="catalog">Prekių katalogas</button>` : ""}
      ${DZ.isAdmin() ? `<button data-act="menu-go" data-v="settings">Įmonės nustatymai</button>` : ""}
      <button data-act="pw-change">Keisti slaptažodį</button>
      <button data-act="refresh">Atnaujinti duomenis</button>
      <button data-act="logout">Atsijungti</button>
      <button data-act="setup">Serverio nustatymai</button>
    </div>`;
  };
  DZ.closeMenu = () => { $("#menu-host").innerHTML = ""; };
  DZ.actions["menu-go"] = t => { DZ.closeMenu(); if (t.dataset.v === "users") DZ.loadProfiles().then(() => DZ.render()); DZ.go(t.dataset.v); };
  DZ.actions["refresh"] = () => { DZ.closeMenu(); S.syncErrors = []; DZ.loadCrew(); DZ.loadProfiles(); DZ.loadAll(); };
  DZ.actions["clear-errors"] = () => { S.syncErrors = []; DZ.render(); };

  // ---------- Slaptažodžio keitimas ----------
  DZ.actions["pw-change"] = () => {
    DZ.closeMenu();
    DZ.openSheet(`<h2>Keisti slaptažodį</h2>
      <label class="field"><span class="lbl">Naujas slaptažodis</span><input type="password" id="pw1" autocomplete="new-password" minlength="6"></label>
      <label class="field"><span class="lbl">Pakartokite</span><input type="password" id="pw2" autocomplete="new-password"></label>
      <p class="note">Ne trumpesnis nei 6 simboliai.</p>
      <p class="err" id="pw-err" hidden></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Pakeisti</button></div>`, { form: true, id: "pw-form" });
    $("#pw-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const a = $("#pw1").value, b = $("#pw2").value, err = $("#pw-err");
      if (a.length < 6) { err.hidden = false; err.textContent = "Per trumpas slaptažodis."; return; }
      if (a !== b) { err.hidden = false; err.textContent = "Slaptažodžiai nesutampa."; return; }
      const { error } = await DZ.sb.auth.updateUser({ password: a });
      if (error) { err.hidden = false; err.textContent = /same|different/i.test(error.message) ? "Naujas slaptažodis turi skirtis nuo seno." : "Nepavyko: " + error.message; return; }
      DZ.closeSheet(true); DZ.toast("Slaptažodis pakeistas");
    });
  };

  // ---------- Vartotojai ----------
  DZ.views.users = {
    html() {
      if (!DZ.isAdmin()) return back("Vartotojai") + `<p class="note">Tik administratoriui.</p>`;
      const wait = S.profiles.filter(p => p.status === "laukia");
      const others = S.profiles.filter(p => p.status !== "laukia").sort((a, b) => DZ.byName(a.name || a.email, b.name || b.email));
      const roleSel = (p, id) => `<select id="${id}" ${p.id === S.user.id ? "disabled" : ""} data-uid="${esc(p.id)}">${Object.entries(DZ.ROLES).map(([k, v]) => `<option value="${k}" ${p.role === k ? "selected" : ""}>${v}</option>`).join("")}</select>`;
      return `<section class="stack16">${back("Vartotojai ir rolės")}
        <p class="note">Darbuotojai užsiregistruoja patys (el. paštas ir slaptažodis), o jūs juos čia patvirtinate. Pamiršusiam slaptažodį – nustatykite naują ir pasakykite jam.</p>
        ${wait.length ? `<h3 class="sec">Laukia patvirtinimo</h3>${wait.map(p => `<div class="card user wait">
          <div><b>${esc(p.name || "—")}</b><br><span class="note">${esc(p.email)} · ${esc(DZ.shortDate((p.created_at || "").slice(0, 10)))}</span></div>
          <label class="field"><span class="lbl">Rolė</span>${roleSel({ ...p, role: "darbuotojas" }, "role-" + p.id)}</label>
          <label class="w-who"><input type="checkbox" id="crew-${esc(p.id)}" ${S.crew.some(n => DZ.norm(n) === DZ.norm(p.name)) ? "" : "checked"}><span>Įtraukti į darbuotojų sąrašą („Dirbo“)</span></label>
          <div class="row-end"><button class="btn danger" data-act="u-set" data-id="${esc(p.id)}" data-status="uzblokuotas">Atmesti</button><button class="btn primary" data-act="u-approve" data-id="${esc(p.id)}">Patvirtinti</button></div>
        </div>`).join("")}` : ""}
        <h3 class="sec">Visi vartotojai</h3>
        ${others.map(p => `<div class="card user${p.status === "uzblokuotas" ? " blocked" : ""}">
          <div class="row-between"><div><b>${esc(p.name || "—")}</b>${p.id === S.user.id ? " <span class='muted'>(jūs)</span>" : ""}<br><span class="note">${esc(p.email)}</span></div>${p.status === "uzblokuotas" ? `<span class="pill st-baigta">Užblokuotas</span>` : ""}</div>
          <div class="row-between">
            <label class="field" style="flex:1"><span class="lbl">Rolė</span>${roleSel(p, "role-" + p.id)}</label>
          </div>
          ${p.id !== S.user.id ? `<div class="row-end">
            ${p.status === "uzblokuotas" ? `<button class="btn" data-act="u-set" data-id="${esc(p.id)}" data-status="patvirtintas">Atblokuoti</button>` : `<button class="btn danger" data-act="u-set" data-id="${esc(p.id)}" data-status="uzblokuotas">Blokuoti</button>`}
            <button class="btn" data-act="u-pass" data-id="${esc(p.id)}">Naujas slaptažodis</button>
          </div>` : ""}
        </div>`).join("")}
      </section>`;
    },
    after() {
      for (const sel of DZ.$$("select[data-uid]")) {
        const p = S.profiles.find(x => x.id === sel.dataset.uid);
        if (!p || p.status === "laukia") continue;
        sel.onchange = async () => {
          const { error } = await DZ.sb.from("profiles").update({ role: sel.value }).eq("id", p.id);
          if (error) { DZ.toast("Nepavyko: " + error.message, true); sel.value = p.role; return; }
          p.role = sel.value; DZ.toast("Rolė pakeista: " + DZ.ROLES[p.role]);
        };
      }
    }
  };
  DZ.actions["u-approve"] = async t => {
    const p = S.profiles.find(x => x.id === t.dataset.id); if (!p) return;
    const role = $("#role-" + p.id).value, addCrew = $("#crew-" + p.id).checked;
    const { error } = await DZ.sb.from("profiles").update({ status: "patvirtintas", role }).eq("id", p.id);
    if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
    p.status = "patvirtintas"; p.role = role;
    if (addCrew && p.name && !S.crew.some(n => DZ.norm(n) === DZ.norm(p.name))) { await DZ.sb.from("workers").insert({ name: p.name }); await DZ.loadCrew(); }
    DZ.toast((p.name || p.email) + " patvirtintas"); DZ.render();
  };
  DZ.actions["u-set"] = t => {
    const p = S.profiles.find(x => x.id === t.dataset.id); if (!p) return;
    const status = t.dataset.status;
    const run = async () => {
      const { error } = await DZ.sb.from("profiles").update({ status }).eq("id", p.id);
      if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
      p.status = status; DZ.toast("Išsaugota"); DZ.render();
    };
    if (status === "uzblokuotas") DZ.confirm(p.status === "laukia" ? "Atmesti registraciją?" : "Blokuoti vartotoją?", `${p.name || ""} (${p.email}) nebegalės matyti ir rašyti įrašų. Vėliau galėsite atblokuoti.`, p.status === "laukia" ? "Atmesti" : "Blokuoti", run);
    else run();
  };
  DZ.actions["u-pass"] = t => {
    const p = S.profiles.find(x => x.id === t.dataset.id); if (!p) return;
    DZ.openSheet(`<h2>Naujas slaptažodis</h2><p class="note">${esc(p.name || "")} (${esc(p.email)}). Įrašykite naują slaptažodį ir pasakykite jį darbuotojui – jis vėliau galės pasikeisti pats.</p>
      <label class="field"><span class="lbl">Slaptažodis</span><input id="up-pw" type="text" autocomplete="off" minlength="6"></label>
      <p class="err" id="up-err" hidden></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Nustatyti</button></div>`, { form: true, id: "up-form" });
    $("#up-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const pw = $("#up-pw").value, err = $("#up-err");
      if (pw.length < 6) { err.hidden = false; err.textContent = "Ne trumpesnis nei 6 simboliai."; return; }
      try { await DZ.callFn("?action=set-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: p.id, password: pw }) }); }
      catch (e) { err.hidden = false; err.textContent = "Nepavyko: " + e.message; return; }
      DZ.closeSheet(true); DZ.toast("Slaptažodis nustatytas");
    });
  };

  // ---------- Darbuotojų sąrašas ----------
  function openCrew(msg) {
    DZ.openSheet(`<h2>Darbuotojų sąrašas</h2>
      <p class="note">Šie vardai rodomi pasirenkant, kas dirbo, ir skiriant užduotis. Pašalinus vardą, seni įrašai nepasikeičia.</p>
      <table class="mat-table"><tbody>${S.crew.map(n => `<tr><td>${esc(n)}</td><td class="q"><button type="button" class="btn danger" data-act="crew-rm" data-name="${esc(n)}">Pašalinti</button></td></tr>`).join("") || `<tr><td class="note">Sąrašas tuščias.</td></tr>`}</tbody></table>
      <div class="row-between"><input id="crew-new" placeholder="Naujas vardas" style="flex:1" autocapitalize="words"><button type="submit" class="btn primary">Pridėti</button></div>
      ${msg ? `<p class="err">${esc(msg)}</p>` : ""}
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Uždaryti</button></div>`, { form: true, id: "crew-form", onClose: () => DZ.render() });
    $("#crew-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const name = $("#crew-new").value.trim(); if (!name) return;
      const { error } = await DZ.sb.from("workers").insert({ name });
      if (error) { openCrew(/duplicate/i.test(error.message) ? "Toks vardas jau yra." : "Nepavyko pridėti: " + error.message); return; }
      await DZ.loadCrew(); openCrew();
    });
  }
  DZ.actions["crew"] = () => { DZ.closeMenu(); openCrew(); };
  DZ.actions["crew-rm"] = async t => {
    const { error } = await DZ.sb.from("workers").delete().eq("name", t.dataset.name);
    if (error) { openCrew("Nepavyko pašalinti."); return; }
    await DZ.loadCrew(); openCrew();
  };

  // ---------- Prekių katalogas ----------
  const cf = { text: "" };
  DZ.views.catalog = {
    fab: () => DZ.isLead() ? { label: "+ Prekė", act: "prod-new" } : null,
    html() {
      const words = DZ.norm(cf.text).split(/\s+/).filter(Boolean);
      const list = S.products.filter(p => words.every(w => DZ.norm([p.name, p.code, p.category].join(" ")).includes(w)));
      const cats = new Map();
      for (const p of list) { const c = p.category || "Be kategorijos"; (cats.get(c) || cats.set(c, []).get(c)).push(p); }
      return `<section class="stack16">${back("Prekių katalogas")}
        <div class="card">
          <input id="c-q" type="search" placeholder="Ieškoti prekės" value="${esc(cf.text)}" autocomplete="off">
          <div class="row-end"><button class="btn" data-act="prod-import">Įkelti sąrašą</button></div>
        </div>
        <p class="note">Įraše pasirinkus prekę iš katalogo, išsaugoma jos kaina tą dieną – objekto savikaina skaičiuojama pagal ją. Likučiai neskaičiuojami.</p>
        ${list.length ? [...cats.entries()].sort((a, b) => DZ.byName(a[0], b[0])).map(([c, ps]) => `<div class="card"><span class="lbl">${esc(c)}</span>
          <table class="mat-table"><tbody>${ps.map(p => `<tr class="${p.active === false ? "muted" : ""}"><td><button class="linkbtn" data-act="prod-edit" data-id="${esc(p.id)}">${esc(p.name)}</button>${p.code ? ` <span class="muted">${esc(p.code)}</span>` : ""}</td><td class="q">${DZ.money(p.price)} / ${esc(p.unit)}</td></tr>`).join("")}</tbody></table></div>`).join("")
        : `<div class="empty"><strong>Katalogas tuščias</strong><span>Pridėkite prekes po vieną arba įkelkite sąrašą (pavadinimas; vienetai; kaina).</span></div>`}
      </section>`;
    },
    after() {
      let t = null;
      $("#c-q").addEventListener("input", ev => { clearTimeout(t); t = setTimeout(() => { cf.text = ev.target.value; DZ.render(); const i = $("#c-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    }
  };
  function openProduct(p) {
    const d = p || { code: "", name: "", unit: "vnt.", price: "", category: "", active: true };
    const cats = [...new Set(S.products.map(x => x.category).filter(Boolean))].sort(DZ.byName);
    DZ.openSheet(`<h2>${p ? "Redaguoti prekę" : "Nauja prekė"}</h2>
      <label class="field"><span class="lbl">Pavadinimas *</span><input id="p-name" value="${esc(d.name)}" autocomplete="off"></label>
      <div class="row2"><label class="field"><span class="lbl">Kaina be PVM, €</span><input id="p-price" type="number" step="any" inputmode="decimal" value="${esc(d.price)}"></label>
        <label class="field"><span class="lbl">Vienetai</span><select id="p-unit">${DZ.UNITS.map(u => `<option ${u === d.unit ? "selected" : ""}>${u}</option>`).join("")}</select></label></div>
      <div class="row2"><label class="field"><span class="lbl">Kodas</span><input id="p-code" value="${esc(d.code)}"></label>
        <label class="field"><span class="lbl">Kategorija</span><input id="p-cat" list="p-cats" value="${esc(d.category)}"></label></div>
      <datalist id="p-cats">${cats.map(c => `<option value="${esc(c)}"></option>`).join("")}</datalist>
      <label class="w-who"><input type="checkbox" id="p-active" ${d.active !== false ? "checked" : ""}><span>Rodyti pasirenkant medžiagas</span></label>
      <p class="err" id="p-err" hidden></p>
      <div class="sheet-actions">${p ? `<button type="button" class="btn danger" data-act="prod-del" data-id="${esc(p.id)}" style="margin-right:auto">Ištrinti</button>` : ""}<button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Išsaugoti</button></div>`, { form: true, id: "prod-form" });
    $("#prod-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const err = $("#p-err");
      const row = { name: $("#p-name").value.trim(), price: DZ.num($("#p-price").value), unit: $("#p-unit").value, code: $("#p-code").value.trim(), category: $("#p-cat").value.trim(), active: $("#p-active").checked };
      if (!row.name) { err.hidden = false; err.textContent = "Įrašykite pavadinimą."; return; }
      const res = p ? await DZ.sb.from("products").update(row).eq("id", p.id).select().single() : await DZ.sb.from("products").insert(row).select().single();
      if (res.error) { err.hidden = false; err.textContent = /duplicate/i.test(res.error.message) ? "Tokia prekė jau yra." : "Nepavyko: " + res.error.message; return; }
      const i = S.products.findIndex(x => x.id === res.data.id);
      if (i >= 0) S.products[i] = res.data; else S.products.push(res.data);
      S.products.sort((a, b) => DZ.byName(a.name, b.name));
      DZ.closeSheet(true); DZ.toast("Išsaugota"); DZ.render();
    });
  }
  DZ.actions["prod-new"] = () => openProduct(null);
  DZ.actions["prod-edit"] = t => openProduct(S.products.find(x => x.id === t.dataset.id));
  DZ.actions["prod-del"] = t => {
    const p = S.products.find(x => x.id === t.dataset.id); if (!p) return;
    DZ.confirm("Ištrinti prekę?", `„${p.name}“. Seni įrašai savo kainą išsaugo.`, "Ištrinti", async () => {
      const { error } = await DZ.sb.from("products").delete().eq("id", p.id);
      if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
      S.products = S.products.filter(x => x.id !== p.id); DZ.render();
    });
  };
  DZ.actions["prod-import"] = () => {
    DZ.openSheet(`<h2>Įkelti prekių sąrašą</h2>
      <p class="note">Viena prekė – viena eilutė: <b>pavadinimas; vienetai; kaina; kategorija; kodas</b>. Galima įklijuoti iš Excel (stulpeliai atskirti tabuliacija). Esamų prekių kaina atnaujinama.</p>
      <textarea id="imp" rows="8" placeholder="Saulės modulis 450 W; vnt.; 95,50; Moduliai&#10;Solarinis kabelis 6 mm²; m; 0,85; Kabeliai"></textarea>
      <p class="err" id="imp-err" hidden></p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="close">Atšaukti</button><button type="submit" class="btn primary">Įkelti</button></div>`, { form: true, id: "imp-form" });
    $("#imp-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const rows = [];
      for (const line of $("#imp").value.split(/\r?\n/)) {
        const c = line.split(/\t|;/).map(s => s.trim());
        if (!c[0] || /^pavadinimas$/i.test(c[0])) continue;
        const ex = DZ.findProduct(c[0]);
        rows.push({ ...(ex ? { id: ex.id } : {}), name: c[0], unit: DZ.UNITS.includes(c[1]) ? c[1] : (c[1] || (ex ? ex.unit : "vnt.")), price: DZ.num(c[2]), category: c[3] || (ex ? ex.category : ""), code: c[4] || (ex ? ex.code : ""), active: true });
      }
      const err = $("#imp-err");
      if (!rows.length) { err.hidden = false; err.textContent = "Neradau eilučių."; return; }
      const upd = rows.filter(r => r.id), ins = rows.filter(r => !r.id);
      let e1 = null;
      if (ins.length) e1 = (await DZ.sb.from("products").insert(ins)).error;
      if (!e1 && upd.length) e1 = (await DZ.sb.from("products").upsert(upd)).error;
      if (e1) { err.hidden = false; err.textContent = "Nepavyko: " + e1.message; return; }
      DZ.closeSheet(true); DZ.toast(`Įkelta: ${ins.length} naujų, ${upd.length} atnaujinta`); DZ.loadAll();
    });
  };

  // ---------- Įmonės nustatymai ----------
  DZ.views.settings = {
    html() {
      const c = DZ.company();
      const inp = (id, l, v, type = "text") => `<label class="field"><span class="lbl">${l}</span><input id="${id}" type="${type}" value="${esc(v ?? "")}" ${type === "number" ? 'step="any" inputmode="decimal"' : ""}></label>`;
      return `<section class="stack16">${back("Įmonės nustatymai")}
        <form class="card" id="set-form" novalidate>
          <span class="lbl">Rekvizitai (rodomi PDF akte)</span>
          ${inp("c-name", "Pavadinimas", c.name)}
          <div class="row2">${inp("c-code", "Įmonės kodas", c.code)}${inp("c-vat", "PVM kodas", c.vat)}</div>
          ${inp("c-addr", "Adresas", c.address)}
          <div class="row2">${inp("c-phone", "Telefonas", c.phone, "tel")}${inp("c-email", "El. paštas", c.email, "email")}</div>
          <span class="lbl">Savikaina</span>
          ${inp("c-rate", "Darbo valandos įkainis, €", DZ.hourRate() || "", "number")}
          <p class="note">Naudojamas objekto savikainai ir valandų ataskaitai. Palikite tuščią, jei nenorite skaičiuoti.</p>
          <div class="row-end"><button class="btn primary" type="submit">Išsaugoti</button></div>
        </form>
        <div class="card">
          <span class="lbl">Google Drive (nuotraukos)</span>
          <p class="note">Nuotraukos saugomos elredasaule@gmail.com Google Drive aplanke „Darbų žurnalas“. Jei nuotraukos nebeįkeliamos, prijunkite iš naujo.</p>
          <div class="row-end"><button class="btn" data-act="drive-connect">Prijungti Google Drive iš naujo</button></div>
        </div>
      </section>`;
    },
    after() {
      $("#set-form").addEventListener("submit", async ev => {
        ev.preventDefault();
        const v = id => $("#" + id).value.trim();
        const company = { name: v("c-name"), code: v("c-code"), vat: v("c-vat"), address: v("c-addr"), phone: v("c-phone"), email: v("c-email") };
        const hour_rate = { value: DZ.num(v("c-rate")) };
        const { error } = await DZ.sb.from("settings").upsert([{ key: "company", value: company, updated_at: new Date().toISOString() }, { key: "hour_rate", value: hour_rate, updated_at: new Date().toISOString() }]);
        if (error) { DZ.toast("Nepavyko: " + error.message, true); return; }
        S.settings.company = company; S.settings.hour_rate = hour_rate;
        DZ.lsSet("cache_settings", JSON.stringify(S.settings));
        DZ.toast("Išsaugota");
      });
    }
  };
  DZ.actions["drive-connect"] = async () => {
    try {
      const j = await DZ.callFn("?action=connect", { method: "POST" });
      if (j.url) window.open(j.url, "_blank");
    } catch (e) { DZ.toast("Nepavyko: " + e.message, true); }
  };
})();
