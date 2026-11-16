// Darbų žurnalas: nuotraukų saugojimas Google Drive.
// POST   ?date=YYYY-MM-DD&object=...   (kūnas – JPEG, PDF ar Excel; &folder=root – į pagrindinį aplanką)  -> { id }
// GET    ?id=<driveId>&size=400|1600                    -> paveikslėlis
// DELETE { ids: [...] }                                 -> { deleted: n }
// POST   ?action=set-password { user_id, password }     -> { ok }  (tik administratoriui)
// POST   ?action=connect                               -> { url } (Google Drive prijungimas)
// Reikalingos paslaptys: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};
const ROOT_NAME = "Darbų žurnalas";
const MAX_BYTES = 15 * 1024 * 1024;

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
const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const REDIRECT = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "") + "/functions/v1/drive-photo";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const clientId = () => (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim();
const clientSecret = () => (Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "").trim();

async function refreshToken(): Promise<string> {
  const row = await db.from("google_tokens").select("refresh_token").eq("id", 1).maybeSingle();
  return (row.data?.refresh_token || Deno.env.get("GOOGLE_REFRESH_TOKEN") || "").trim();
}

function html(text: string, status = 200) {
  const page = `<!doctype html><html lang="lt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Darbų žurnalas</title></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5;color:#18222e"><h1 style="font-size:1.4rem">Darbų žurnalas</h1><p>${text}</p></body></html>`;
  return new Response(page, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

let token = { value: "", exp: 0 };
async function accessToken(): Promise<string> {
  if (token.value && token.exp > Date.now() + 60_000) return token.value;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: await refreshToken(),
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("google_token: " + [j.error, j.error_description].filter(Boolean).join(" – ") || String(r.status));
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function gfetch(url: string, init: RequestInit = {}) {
  const t = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + t);
  return fetch(url.startsWith("http") ? url : "https://www.googleapis.com" + url, { ...init, headers });
}

async function folder(key: string, name: string, parent?: string): Promise<string> {
  const found = await db.from("drive_folders").select("id").eq("key", key).maybeSingle();
  if (found.data) return found.data.id;
  const r = await gfetch("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parent ? [parent] : undefined }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("drive_folder: " + (j.error?.message || r.status));
  const ins = await db.from("drive_folders").insert({ key, id: j.id });
  if (ins.error) {
    // Kitas užklausimas aplanką sukūrė tuo pačiu metu – naudojame jo aplanką.
    const again = await db.from("drive_folders").select("id").eq("key", key).single();
    await gfetch("/drive/v3/files/" + j.id, { method: "DELETE" });
    return again.data!.id;
  }
  return j.id;
}

function cleanName(s: string) {
  const t = s.replace(/[\/\\\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return t || "Be objekto";
}

// Rolė iš profilio; null – nepatvirtintas arba užblokuotas
async function roleOf(userId: string): Promise<string | null> {
  const p = await db.from("profiles").select("role,status").eq("id", userId).maybeSingle();
  return p.data && p.data.status === "patvirtintas" ? p.data.role : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const u0 = new URL(req.url);
    // Google grąžina čia po „Prijungti Google Drive“ patvirtinimo
    if (req.method === "GET" && u0.searchParams.has("state") && (u0.searchParams.has("code") || u0.searchParams.has("error"))) {
      const st = u0.searchParams.get("state") || "";
      const row = await db.from("google_oauth_state").select("created_at").eq("state", st).maybeSingle();
      await db.from("google_oauth_state").delete().eq("state", st);
      if (!row.data || Date.now() - Date.parse(row.data.created_at) > 15 * 60_000) return html("Nuoroda nebegalioja. Paprašykite naujos prijungimo nuorodos.", 400);
      if (u0.searchParams.get("error")) return html("Prieiga nesuteikta (" + u0.searchParams.get("error") + "). Galite bandyti dar kartą.", 400);
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: u0.searchParams.get("code") || "", client_id: clientId(), client_secret: clientSecret(), redirect_uri: REDIRECT, grant_type: "authorization_code" }),
      });
      const j = await r.json();
      if (!r.ok) return html("Nepavyko prijungti: " + [j.error, j.error_description].filter(Boolean).join(" – "), 400);
      if (!j.refresh_token) return html("Google negrąžino ilgalaikio rakto. Pabandykite prijungti dar kartą.", 400);
      const up = await db.from("google_tokens").upsert({ id: 1, refresh_token: j.refresh_token, updated_at: new Date().toISOString() });
      if (up.error) return html("Nepavyko išsaugoti: " + up.error.message, 500);
      token = { value: j.access_token || "", exp: j.access_token ? Date.now() + (j.expires_in || 0) * 1000 : 0 };
      return html("✅ Google Drive prijungtas. Nuotraukos bus keliamos į aplanką „Darbų žurnalas“. Šį langą galite uždaryti.");
    }

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    const user = auth?.user;
    if (!user) return json({ error: "neprisijungta" }, 401);
    const url = new URL(req.url);
    const role = await roleOf(user.id);
    if (!role) return json({ error: "paskyra nepatvirtinta" }, 403);
    const admin = role === "admin", lead = admin || role === "brigadininkas";

    // Administratorius nustato naują slaptažodį darbuotojui
    if (req.method === "POST" && url.searchParams.get("action") === "set-password") {
      if (!admin) return json({ error: "tik administratoriui" }, 403);
      const { user_id, password } = await req.json().catch(() => ({}));
      if (!user_id || typeof password !== "string" || password.length < 6) return json({ error: "slaptažodis per trumpas" }, 400);
      const r = await db.auth.admin.updateUserById(String(user_id), { password });
      if (r.error) return json({ error: r.error.message }, 400);
      return json({ ok: true });
    }

    if (req.method === "POST" && url.searchParams.get("action") === "connect") {
      if (!admin) return json({ error: "tik administratoriui" }, 403);
      const state = crypto.randomUUID() + crypto.randomUUID();
      await db.from("google_oauth_state").insert({ state });
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({ client_id: clientId(), redirect_uri: REDIRECT, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state }).toString();
      return json({ url: auth.toString() });
    }

    if (req.method === "POST") {
      const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "bloga data" }, 400);
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length) return json({ error: "tuščias failas" }, 400);
      if (bytes.length > MAX_BYTES) return json({ error: "per didelis failas" }, 413);
      const object = cleanName(url.searchParams.get("object") || "");
      const month = date.slice(0, 7);
      const root = await folder("root", ROOT_NAME);
      // ?folder=root – tiesiai į „Darbų žurnalas“ (pvz. visų klientų eksportas į „Centą“)
      const toRoot = url.searchParams.get("folder") === "root";
      const objId = toRoot ? root : await folder("o:" + month + ":" + object.toLowerCase(), object, await folder("m:" + month, month, root));
      const time = new Date().toISOString().slice(11, 19).replace(/:/g, "");
      const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif", "application/pdf": "pdf", "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx" };
      const ctype = (req.headers.get("Content-Type") || "image/jpeg").split(";")[0].trim().toLowerCase();
      const ext = TYPES[ctype];
      if (!ext) return json({ error: "netinkamas failo tipas (tinka nuotraukos, PDF ir Excel)" }, 415);
      const orig = (url.searchParams.get("name") || "").replace(/[\/\\\u0000-\u001f]/g, " ").replace(/\.[a-z0-9]{2,5}$/i, "").trim().slice(0, 60);
      const name = `${date} ${time} ${orig || crypto.randomUUID().slice(0, 4)}.${ext}`;
      const boundary = "dz" + crypto.randomUUID().replace(/-/g, "");
      const meta = JSON.stringify({ name, parents: [objId], description: `Darbų žurnalas – ${object}, ${date}, įkėlė ${user.email ?? ""}` });
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${ctype}\r\n\r\n`,
        bytes,
        `\r\n--${boundary}--`,
      ]);
      const r = await gfetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      const j = await r.json();
      if (!r.ok) throw new Error("drive_upload: " + (j.error?.message || r.status));
      await db.from("drive_photos").insert({ file_id: j.id, user_id: user.id });
      return json({ id: j.id });
    }

    if (req.method === "GET") {
      const id = url.searchParams.get("id") || "";
      const size = Math.min(2000, Math.max(0, parseInt(url.searchParams.get("size") || "0") || 0));
      const known = await db.from("drive_photos").select("file_id").eq("file_id", id).maybeSingle();
      if (!known.data) return json({ error: "nerasta" }, 404);
      const cache = { "Cache-Control": "private, max-age=604800" };
      if (size) {
        const m = await gfetch(`/drive/v3/files/${encodeURIComponent(id)}?fields=thumbnailLink`);
        const mj = await m.json();
        if (m.ok && mj.thumbnailLink) {
          const t = await gfetch(String(mj.thumbnailLink).replace(/=s\d+$/, "=s" + size));
          if (t.ok) return new Response(t.body, { headers: { ...CORS, ...cache, "Content-Type": t.headers.get("Content-Type") || "image/jpeg" } });
        }
      }
      const f = await gfetch(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
      if (!f.ok) return json({ error: "nepavyko gauti" }, f.status);
      return new Response(f.body, { headers: { ...CORS, ...cache, "Content-Type": f.headers.get("Content-Type") || "image/jpeg" } });
    }

    if (req.method === "DELETE") {
      const { ids } = await req.json().catch(() => ({ ids: [] }));
      let deleted = 0;
      for (const id of (Array.isArray(ids) ? ids : []).slice(0, 50)) {
        const row = await db.from("drive_photos").select("user_id").eq("file_id", id).maybeSingle();
        if (!row.data) continue;
        if (!lead && row.data.user_id !== user.id) continue;
        // Į šiukšlinę, ne visam laikui – 30 d. galima atkurti Drive.
        const r = await gfetch(`/drive/v3/files/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trashed: true }),
        });
        if (r.ok || r.status === 404) { await db.from("drive_photos").delete().eq("file_id", id); deleted++; }
      }
      return json({ deleted });
    }

    return json({ error: "netinkamas metodas" }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
