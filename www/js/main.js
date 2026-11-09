// Paleidimas: prisijungimas, registracija, laukimas patvirtinimo, įvykiai, navigacija.
(function () {
  "use strict";
  const DZ = window.DZ, S = DZ.state, $ = DZ.$;

  // ---------- Įvykiai ----------
  document.addEventListener("click", ev => {
    const t = ev.target.closest("[data-act]");
    if ($("#menu-host").innerHTML && !ev.target.closest(".menu") && ev.target.id !== "menu-btn") DZ.closeMenu();
    if (!t) {
      if (ev.target.id === "sheet-bg") DZ.closeSheet();
      else if (ev.target.id === "lb") DZ.closeLb();
      return;
    }
    const a = t.dataset.act;
    if (a === "close") { DZ.closeSheet(); return; }
    const fn = DZ.actions[a];
    if (fn) { try { fn(t, ev); } catch (e) { console.error(e); DZ.toast("Klaida: " + e.message, true); } }
  });
  document.addEventListener("change", ev => {
    const p = ev.target.dataset && ev.target.dataset.pick;
    if (!p || !ev.target.value) return;
    if (p === "day") S.date = ev.target.value; else S.taskDate = ev.target.value;
    DZ.render();
  });
  $("#menu-btn").onclick = () => DZ.toggleMenu();
  $("#bottom-nav").addEventListener("click", ev => {
    const b = ev.target.closest("[data-tab]"); if (!b) return;
    if (b.dataset.tab === "reports") S.month = S.date.slice(0, 7);
    DZ.go(b.dataset.tab);
  });

  const PARENT = { search: "day", object: "objects", users: "day", catalog: "day", settings: "day" };
  DZ.actions["back"] = () => DZ.go(PARENT[S.view] || "day");

  function onBack() {
    if (DZ.lbOpen()) { DZ.closeLb(); return; }
    if ($("#menu-host").innerHTML) { DZ.closeMenu(); return; }
    if (DZ.sheet) { DZ.closeSheet(); return; }
    if (S.screen === "register") { S.screen = "login"; DZ.render(); return; }
    if (S.screen === "app" && S.view !== "day") { DZ.actions.back(); return; }
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App) App.exitApp();
  }
  const refreshIfIdle = () => { if (S.screen === "app" && !DZ.sheet) { DZ.loadAll(); } else if (S.screen === "pending") checkProfile(); };
  try {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App) { App.addListener("backButton", onBack); App.addListener("resume", refreshIfIdle); }
  } catch (_) {}
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") onBack(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshIfIdle(); });
  window.addEventListener("online", () => { S.offline = false; refreshIfIdle(); });
  window.addEventListener("offline", () => { S.offline = true; if (S.screen === "app" && !DZ.sheet) DZ.render(); });

  // ---------- Serverio nustatymai ----------
  function getCfg() {
    const c = window.APP_CONFIG || {};
    return { url: (DZ.lsGet("sb_url") || c.SUPABASE_URL || "").trim(), key: (DZ.lsGet("sb_key") || c.SUPABASE_KEY || "").trim() };
  }
  function openSetup() {
    DZ.closeMenu();
    const c = getCfg();
    $("#s-url").value = c.url; $("#s-key").value = c.key;
    S.screen = "setup"; DZ.render();
  }
  DZ.actions["setup"] = openSetup;
  $("#setup-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const url = $("#s-url").value.trim().replace(/\/+$/, ""), key = $("#s-key").value.trim().replace(/\s+/g, "");
    const err = $("#setup-err");
    if (!/^https:\/\/.+/.test(url) || key.length < 20) { err.hidden = false; err.textContent = "Patikrinkite adresą (turi prasidėti https://) ir raktą."; return; }
    err.hidden = true;
    DZ.lsSet("sb_url", url); DZ.lsSet("sb_key", key);
    await start();
  });

  // ---------- Prisijungimas / registracija ----------
  DZ.actions["show-register"] = () => { S.screen = "register"; DZ.render(); setTimeout(() => $("#r-name").focus(), 50); };
  DZ.actions["show-login"] = () => { S.screen = "login"; DZ.render(); };
  DZ.actions["forgot"] = () => {
    const el = $("#login-err"); el.hidden = false; el.className = "note box";
    el.textContent = "Pamiršote slaptažodį? Paskambinkite arba parašykite administratoriui – jis nustatys naują slaptažodį, o jūs vėliau galėsite jį pasikeisti meniu ⋯ → „Keisti slaptažodį“.";
  };
  $("#login-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const err = $("#login-err"), btn = $("#login-btn");
    err.hidden = true; err.className = "err"; btn.disabled = true; btn.textContent = "Jungiamasi…";
    try {
      const { data, error } = await DZ.sb.auth.signInWithPassword({ email: $("#l-email").value.trim(), password: $("#l-pass").value });
      if (error) throw error;
      S.user = data.user;
      await afterAuth();
    } catch (e) {
      err.hidden = false;
      const m = (e && e.message) || "";
      err.textContent = /invalid/i.test(m) ? "Neteisingas el. paštas arba slaptažodis." : /not confirmed/i.test(m) ? "El. paštas nepatvirtintas. Kreipkitės į administratorių." : "Nepavyko prisijungti: " + (m || "patikrinkite internetą.");
    }
    btn.disabled = false; btn.textContent = "Prisijungti";
  });
  $("#register-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const err = $("#reg-err"), btn = $("#reg-btn");
    const name = $("#r-name").value.trim(), email = $("#r-email").value.trim(), p1 = $("#r-pass").value, p2 = $("#r-pass2").value;
    err.hidden = false;
    if (name.length < 2) { err.textContent = "Įrašykite vardą ir pavardę."; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "Patikrinkite el. pašto adresą."; return; }
    if (p1.length < 6) { err.textContent = "Slaptažodis – ne trumpesnis nei 6 simboliai."; return; }
    if (p1 !== p2) { err.textContent = "Slaptažodžiai nesutampa."; return; }
    err.hidden = true; btn.disabled = true; btn.textContent = "Registruojama…";
    try {
      const { data, error } = await DZ.sb.auth.signUp({ email, password: p1, options: { data: { name } } });
      if (error) throw error;
      if (!data.session) {
        // Supabase dar reikalauja el. pašto patvirtinimo arba vartotojas jau yra
        err.hidden = false; err.className = "note box";
        err.textContent = data.user && data.user.identities && data.user.identities.length === 0
          ? "Toks el. paštas jau užregistruotas. Prisijunkite arba kreipkitės į administratorių."
          : "Registracija priimta. Jei gavote laišką – patvirtinkite el. paštą, tada prisijunkite. Administratorius turės jus patvirtinti.";
      } else { S.user = data.user; await afterAuth(); }
    } catch (e) {
      err.hidden = false; err.className = "err";
      const m = (e && e.message) || "";
      err.textContent = /already|registered/i.test(m) ? "Toks el. paštas jau užregistruotas. Prisijunkite." : /signups? not allowed|disabled/i.test(m) ? "Registracija šiuo metu išjungta. Kreipkitės į administratorių." : "Nepavyko užsiregistruoti: " + m;
    }
    btn.disabled = false; btn.textContent = "Registruotis";
  });
  async function logout() {
    DZ.closeMenu();
    try { await DZ.sb.auth.signOut(); } catch (_) {}
    DZ.clearCache();
    Object.assign(S, { entries: [], objects: [], tasks: [], products: [], profiles: [], loaded: false, user: null, profile: null, view: "day", syncErrors: [] });
    S.screen = "login"; DZ.render();
  }
  DZ.actions["logout"] = () => {
    const n = DZ.queueSize();
    if (n) DZ.confirm("Atsijungti?", `Telefone yra ${n} dar neišsiųstų pakeitimų. Atsijungus jie bus prarasti. Geriau palaukite, kol atsiras ryšys.`, "Vis tiek atsijungti", logout);
    else logout();
  };

  // ---------- Profilis ir patvirtinimas ----------
  async function fetchProfile() {
    const { data, error } = await DZ.sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
    if (error) throw error;
    return data || { id: S.user.id, email: S.user.email, name: "", role: "darbuotojas", status: "laukia" };
  }
  function showPending() {
    const p = S.profile || {};
    $("#pending-title").textContent = p.status === "uzblokuotas" ? "Prieiga sustabdyta" : "Laukiama patvirtinimo";
    $("#pending-text").textContent = p.status === "uzblokuotas"
      ? "Administratorius sustabdė šios paskyros prieigą. Jei manote, kad tai klaida, susisiekite su juo."
      : `Sveiki${p.name ? ", " + p.name : ""}! Jūsų paskyra (${S.user.email}) sukurta. Administratorius turi ją patvirtinti – tada matysite darbų žurnalą.`;
    S.screen = "pending"; DZ.render();
  }
  async function checkProfile() {
    try { S.profile = await fetchProfile(); DZ.lsSet("profile", JSON.stringify(S.profile)); } catch (_) {}
    if (S.profile && S.profile.status === "patvirtintas") enterApp(); else if (S.profile) showPending();
  }
  DZ.actions["pending-check"] = async t => { t.disabled = true; await checkProfile(); t.disabled = false; if (S.screen === "pending") DZ.toast("Dar nepatvirtinta"); };
  async function afterAuth() {
    const cached = DZ.lsJson("profile", null);
    try { S.profile = await fetchProfile(); DZ.lsSet("profile", JSON.stringify(S.profile)); }
    catch (e) {
      if (cached && cached.id === S.user.id) S.profile = cached; // be ryšio – paskutinis žinomas
      else { S.profile = null; }
    }
    if (!S.profile) { S.screen = "login"; DZ.render(); const el = $("#login-err"); el.hidden = false; el.textContent = "Nepavyko patikrinti paskyros. Patikrinkite internetą."; return; }
    if (S.profile.status !== "patvirtintas") { showPending(); return; }
    enterApp();
  }
  async function enterApp() {
    S.screen = "app";
    DZ.loadCache();
    DZ.render();
    DZ.loadCrew();
    DZ.loadProfiles().then(() => { if (!DZ.sheet) DZ.render(); });
    await DZ.loadAll();
  }

  async function start() {
    const c = getCfg();
    if (!c.url || !c.key) { openSetup(); return; }
    if (!window.supabase || !window.supabase.createClient) { DZ.setSync("trūksta bibliotekos"); openSetup(); return; }
    try {
      DZ.sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } });
      DZ.fnBase = c.url.replace(/\/+$/, "") + "/functions/v1/drive-photo"; DZ.fnKey = c.key;
    } catch (e) { openSetup(); $("#setup-err").hidden = false; $("#setup-err").textContent = "Netinkami serverio duomenys."; return; }
    let session = null;
    try { session = (await DZ.sb.auth.getSession()).data.session; } catch (_) {}
    if (session) { S.user = session.user; await afterAuth(); }
    else { S.screen = "login"; DZ.render(); }
  }
  start();
})();
