// Darbų žurnalas: medžiagų atpažinimas iš nuotraukos (ranka rašytas sąrašas, važtaraštis, sąskaita).
// POST (JWT, patvirtintas vartotojas) { image: base64 JPEG, known: [katalogo pavadinimai], units: [...] }
// -> { object, materials: [{ name, qty, unit }] }. Naudoja Claude (paslaptis ANTHROPIC_API_KEY).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UNITS = ["vnt.", "m", "kompl.", "kg", "l", "m²", "pak.", "val."];

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

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["object", "materials"],
  properties: {
    object: { type: "string", description: "Kliento vardas / objekto adresas, jei užrašytas; kitaip tuščia" },
    materials: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "qty", "unit"],
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unit: { type: "string", enum: UNITS },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "netinkamas metodas" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    const p = auth?.user ? await db.from("profiles").select("status").eq("id", auth.user.id).maybeSingle() : null;
    if (!auth?.user || p?.data?.status !== "patvirtintas") return json({ error: "neprisijungta" }, 401);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "Nenustatytas ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets)" }, 500);

    const body = await req.json();
    const image = String(body.image || "").replace(/^data:[^,]+,/, "");
    if (image.length < 1000) return json({ error: "nėra nuotraukos" }, 400);
    if (image.length > 7_000_000) return json({ error: "per didelė nuotrauka" }, 413);
    const known: string[] = Array.isArray(body.known) ? body.known.map(String).slice(0, 600) : [];

    const system = `Tu padedi saulės elektrinių montuotojams (UAB Elreda) perkelti medžiagų sąrašą iš nuotraukos į darbų žurnalą.
Nuotraukoje dažniausiai ranka rašytas sąrašas užrašų knygelėje, važtaraštis ar sąskaita lietuvių kalba.
Perskaityk kiekvieną medžiagos eilutę ir grąžink pavadinimą, kiekį ir vienetus.
- Pavadinimą rašyk aiškiai, taisyklinga lietuvių kalba, su skersmenimis ir dydžiais (pvz. „Vamzdis 25 mm“, „Kabelis 5x6“, „Laikikliai 25 mm“, „Kampai 25 mm“). Jei eilutė aiškiai atitinka katalogo pavadinimą – naudok tikslų katalogo pavadinimą.
- Vienetai – tik iš sąrašo: ${UNITS.join(", ")}. „gr.“ (grupės), „dantys“ ir panašiai palik pavadinime, o vienetu rinkis „vnt.“. Metrai – „m“.
- Jei kiekis nenurodytas, rašyk 1. Užbraukti skaičiai negalioja – imk galiojantį (pvz. apvestą).
- Saulės modulius rašyk kaip „Saulės modulis 480 W“ su kiekiu.
- Kliento vardą, adresą, datas ir laikus į medžiagas nedėk; vardą/adresą įrašyk į laukelį object.
- Neprasimanyk eilučių, kurių nuotraukoje nėra.`;

    const client = new Anthropic();
    const msg = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: (known.length ? "Katalogo pavadinimai:\n" + known.join("\n") + "\n\n" : "") + "Ištrauk medžiagas iš nuotraukos." },
        ],
      }],
    // deno-lint-ignore no-explicit-any
    } as any);
    // deno-lint-ignore no-explicit-any
    const m = msg as any;
    if (m.stop_reason === "refusal") return json({ error: "nepavyko atpažinti" }, 422);
    // deno-lint-ignore no-explicit-any
    const text = (m.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const out = JSON.parse(text || "{}");
    // deno-lint-ignore no-explicit-any
    const materials = (out.materials || []).filter((x: any) => x && x.name).map((x: any) => ({
      name: String(x.name).trim(), qty: Number(x.qty) > 0 ? Number(x.qty) : 1, unit: UNITS.includes(x.unit) ? x.unit : "vnt.",
    }));
    return json({ object: String(out.object || "").trim(), materials });
  } catch (e) {
    if (e instanceof Anthropic.APIError) return json({ error: `Claude API ${e.status}: ${e.message}` }, 502);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
