// Darbų žurnalas: rytinis priminimas el. paštu su dienos užduotimis.
// Kviečia Supabase laikmatis (pg_cron, žr. supabase/reminders.sql) kas 15 min. tarp 05:00–06:59 UTC;
// laiškai išsiunčiami vieną kartą per dieną, kai Lietuvoje jau 8:00 (vasaros / žiemos laikas tvarkomas čia).
//   POST {}               -> laikmatis: siunčia, jei ≥ 8:00 ir šiandien dar nesiųsta
//   POST ?test=1 (JWT)    -> administratorius: šiandienos suvestinė tik jam (bandymui), žurnalas neliečiamas
// Paslaptys: GMAIL_APP_PASSWORD (Google „App password“), neprivaloma GMAIL_USER (numatyta elredasaule@gmail.com).
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.15";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const APP_URL = "https://mariusri.github.io/darbu-zurnalas/";
const SEND_HOUR = 8;

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const first = Array.isArray(keys) ? keys[0] : Object.values(keys)[0];
    if (first) return String(first);
  } catch (_) { /* ignored */ }
  throw new Error("nėra serverio rakto");
}
const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Lietuvos data ir valanda
function vilnius() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}
const norm = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
// Ar užduoties darbuotojo vardas atitinka profilio vardą (pilnas arba vardas be pavardės) – kaip programėlėje DZ.isMe
const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0]); };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const WD = ["sekmadienis", "pirmadienis", "antradienis", "trečiadienis", "ketvirtadienis", "penktadienis", "šeštadienis"];
const MON = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const longDate = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${MON[m - 1]} ${dd} d., ${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}`; };

type Task = { id: string; date: string; time: string | null; title: string | null; description: string | null; object_id: string | null; assignees: string[] | null; status: string };
type Obj = { id: string; name: string; address: string | null };

function taskHtml(t: Task, objs: Map<string, Obj>, showPeople: boolean) {
  const o = t.object_id ? objs.get(t.object_id) : undefined;
  const map = o && o.address ? `https://maps.google.com/?q=${encodeURIComponent(o.address)}` : "";
  return `<div style="border:1px solid #dde3ea;border-radius:10px;padding:12px 14px;margin:0 0 10px">
    <div style="font-size:16px;font-weight:bold;color:#18222e">${t.time ? `<span style="font-family:monospace;color:#5b6775">${esc(t.time.slice(0, 5))}</span> ` : ""}${esc(t.title || "Užduotis")}</div>
    ${o ? `<div style="margin-top:4px;color:#18222e">📍 ${esc(o.name)}</div>` : ""}
    ${o && o.address ? `<div style="color:#5b6775">${esc(o.address)} · <a href="${map}" style="color:#1f6f5c">Žemėlapis</a></div>` : ""}
    ${t.description ? `<div style="margin-top:6px;color:#18222e;white-space:pre-wrap">${esc(t.description)}</div>` : ""}
    ${showPeople && (t.assignees || []).length ? `<div style="margin-top:6px;color:#5b6775">Dirba: ${esc((t.assignees || []).join(", "))}</div>` : ""}
  </div>`;
}
function mail(title: string, intro: string, body: string) {
  return `<!doctype html><html lang="lt"><body style="margin:0;background:#eef2f5;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:20px 14px">
    <div style="background:#fff;border-radius:12px;padding:18px 16px">
      <div style="font-size:20px;font-weight:bold;color:#18222e;margin-bottom:4px">${esc(title)}</div>
      <div style="color:#5b6775;margin-bottom:14px">${intro}</div>
      ${body}
      <a href="${APP_URL}" style="display:inline-block;margin-top:6px;background:#e0a100;color:#18222e;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:8px">Atidaryti Darbų žurnalą</a>
    </div>
    <div style="color:#8a95a2;font-size:12px;margin-top:10px">UAB „Elreda“ · automatinis priminimas iš Darbų žurnalo</div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "netinkamas metodas" }, 405);
  try {
    const url = new URL(req.url);
    const test = url.searchParams.get("test") === "1";
    const now = vilnius();
    let testTo = "";
    if (test) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: auth } = await db.auth.getUser(jwt);
      const p = auth?.user ? await db.from("profiles").select("role,status").eq("id", auth.user.id).maybeSingle() : null;
      if (!auth?.user || !p?.data || p.data.role !== "admin" || p.data.status !== "patvirtintas") return json({ error: "tik administratoriui" }, 403);
      testTo = auth.user.email || "";
    } else {
      if (now.hour < SEND_HOUR) return json({ skipped: "dar ne " + SEND_HOUR + ":00" });
      const done = await db.from("reminder_log").select("day").eq("day", now.date).maybeSingle();
      if (done.data) return json({ skipped: "šiandien jau išsiųsta" });
    }

    const pass = (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s/g, "");
    const user = (Deno.env.get("GMAIL_USER") || "elredasaule@gmail.com").trim();
    if (!pass) return json({ error: "nenustatytas GMAIL_APP_PASSWORD" }, 500);

    const [tq, pq] = await Promise.all([
      db.from("tasks").select("id,date,time,title,description,object_id,assignees,status").eq("date", now.date).neq("status", "atlikta").order("time", { ascending: true }),
      db.from("profiles").select("id,name,role,status").eq("status", "patvirtintas"),
    ]);
    if (tq.error) throw tq.error;
    if (pq.error) throw pq.error;
    const tasks = (tq.data || []) as Task[];
    const objIds = [...new Set(tasks.map((t) => t.object_id).filter(Boolean))] as string[];
    const oq = objIds.length ? await db.from("objects").select("id,name,address").in("id", objIds) : { data: [] };
    const objs = new Map(((oq.data || []) as Obj[]).map((o) => [o.id, o]));
    // El. paštai iš prisijungimų
    const emails = new Map<string, string>();
    for (let page = 1; page < 20; page++) {
      const r = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (r.error) throw r.error;
      for (const u of r.data.users) if (u.email) emails.set(u.id, u.email);
      if (r.data.users.length < 200) break;
    }
    const profiles = (pq.data || []).map((p) => ({ ...p, email: emails.get(p.id) || "" }));

    const tr = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    const from = `"Darbų žurnalas – UAB Elreda" <${user}>`;
    const title = "Šiandienos užduotys – " + longDate(now.date);
    const sent: string[] = [];

    // Asmeniniai laiškai (tik ne bandymo metu)
    const covered = new Set<string>();
    if (!test) {
      for (const p of profiles) {
        if (!p.email || !p.name) continue;
        const mine = tasks.filter((t) => (t.assignees || []).some((n) => same(n, p.name)));
        if (!mine.length) continue;
        mine.forEach((t) => (t.assignees || []).forEach((n) => { if (same(n, p.name)) covered.add(t.id + "|" + norm(n)); }));
        await tr.sendMail({ from, to: p.email, subject: title, html: mail(title, `Labas rytas, ${esc(p.name.split(/\s+/)[0])}! Šiandien jums paskirta užduočių: ${mine.length}.`, mine.map((t) => taskHtml(t, objs, true)).join("")) });
        sent.push(p.email);
      }
    }

    // Suvestinė administratoriams
    const admins = test ? [testTo] : profiles.filter((p) => p.role === "admin" && p.email).map((p) => p.email);
    if (tasks.length && admins.length) {
      const unassigned = tasks.filter((t) => !(t.assignees || []).length);
      const noMail = tasks.filter((t) => (t.assignees || []).some((n) => !covered.has(t.id + "|" + norm(n))));
      const extra = (test ? "" : [unassigned.length ? `be paskirto žmogaus: ${unassigned.length}` : "", noMail.length ? `kai kurie paskirti žmonės laiško negavo (nėra paskyros ar el. pašto): ${noMail.length}` : ""].filter(Boolean).join("; "));
      const intro = `Visos dienos užduotys: ${tasks.length}.` + (extra ? ` <b>Dėmesio:</b> ${esc(extra)}.` : "") + (test ? " <i>(Bandomasis laiškas – darbuotojams nesiųsta.)</i>" : "");
      await tr.sendMail({ from, to: admins.join(", "), subject: (test ? "[Bandymas] " : "") + "Dienos suvestinė – " + longDate(now.date), html: mail("Dienos suvestinė – " + longDate(now.date), intro, tasks.map((t) => taskHtml(t, objs, true)).join("")) });
      sent.push(...admins);
    } else if (test) {
      await tr.sendMail({ from, to: testTo, subject: "[Bandymas] Dienos suvestinė – " + longDate(now.date), html: mail("Dienos suvestinė – " + longDate(now.date), "Šiandien neatliktų užduočių nėra. <i>(Bandomasis laiškas – laiškų siuntimas veikia.)</i>", "") });
      sent.push(testTo);
    }

    if (!test) await db.from("reminder_log").insert({ day: now.date, tasks: tasks.length, sent: sent.length });
    return json({ ok: true, date: now.date, tasks: tasks.length, sent: sent.length });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
