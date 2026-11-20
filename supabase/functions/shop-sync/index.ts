// Darbų žurnalas: elreda.lt parduotuvės prekių ir kainų atnaujinimas (tik administratoriui).
// POST (JWT) -> nuskaito https://www.elreda.lt/wp-json/wc/store/v1/products ir įrašo į shop_products.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SHOP = "https://www.elreda.lt/wp-json/wc/store/v1/products";
const VAT = 1.21;

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
// HTML simboliai pavadinimuose (&#8211; &amp; ir pan.)
const unhtml = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "netinkamas metodas" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    const p = auth?.user ? await db.from("profiles").select("role,status").eq("id", auth.user.id).maybeSingle() : null;
    if (!auth?.user || !p?.data || p.data.role !== "admin" || p.data.status !== "patvirtintas") return json({ error: "tik administratoriui" }, 403);

    // deno-lint-ignore no-explicit-any
    const all: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await fetch(`${SHOP}?per_page=100&page=${page}`, { headers: { "User-Agent": "DarbuZurnalas/1.0", Accept: "application/json" } });
      if (!r.ok) throw new Error("elreda.lt atsakė " + r.status);
      const items = await r.json();
      all.push(...items);
      if (items.length < 100) break;
    }
    const now = new Date().toISOString();
    const rows = all.map((x) => {
      const mu = Number(x.prices?.currency_minor_unit ?? 2);
      const raw = x.prices?.price ? Number(x.prices.price) / Math.pow(10, mu) : null;
      const vat = raw && raw > 0 ? Math.round(raw * 100) / 100 : null;
      return {
        id: x.id, sku: x.sku || null, name: unhtml(x.name), category: x.categories?.[0] ? unhtml(x.categories[0].name) : null,
        price_vat: vat, price: vat ? Math.round((vat / VAT) * 100) / 100 : null,
        variable: x.type === "variable", in_stock: x.is_in_stock ?? null, url: x.permalink || null,
        image: x.images?.[0]?.thumbnail || x.images?.[0]?.src || null, active: true, updated_at: now,
      };
    });
    if (!rows.length) throw new Error("elreda.lt negrąžino prekių");
    const up = await db.from("shop_products").upsert(rows);
    if (up.error) throw up.error;
    // Prekės, kurių parduotuvėje nebėra – pažymimos neaktyviomis (neištrinamos)
    const ids = rows.map((r) => r.id);
    const off = await db.from("shop_products").update({ active: false, updated_at: now }).eq("active", true).not("id", "in", `(${ids.join(",")})`).select("id");
    return json({ ok: true, count: rows.length, priced: rows.filter((r) => r.price_vat).length, inactive: off.data?.length || 0 });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
