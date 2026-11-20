# Darbų dienoraščio programėlė (UAB Elreda)

Darbų žurnalas saulės elektrinių montavimo įmonei: dienos įrašai (objektas, darbuotojai, laikas, darbai, medžiagos, nuotraukos), užduotys, objektai, CRM, aktai. Kalba – lietuvių (UI, komentarai, commit žinutės).

## Kur kas
- **Android APK**: GitHub Release `latest` → `darbu-zurnalas.apk` (Capacitor 8, appId `lt.darbuzurnalas.app`).
- **Naršyklės versija**: GitHub Pages `https://mariusri.github.io/darbu-zurnalas/`.
- **Duomenys**: Supabase projektas `fzrqlqhzqvatpthyflta` (publishable key yra `www/config.js`).
- **Nuotraukos ir dokumentai**: Google Drive per Edge funkciją `supabase/functions/drive-photo` (aplankai: Darbų žurnalas → mėnuo → objektas).
- Kiekvienas push į `main` paleidžia `.github/workflows/android.yml`: surenka APK (versionCode = run_number, pasirašoma visada tuo pačiu `android-build/debug.keystore`, kad veiktų atnaujinimas), išleidžia Release ir Pages. Tarpiniams commit'ams – `[skip ci]`.

## Kodas (`www/`)
Vanilla JS be bundlerio, bendra vardų sritis `window.DZ` (`DZ.state`, `DZ.views.<vardas>`, `DZ.actions["data-act"]`, `DZ.hooks.afterLoad`). Skriptų tvarka – `www/index.html`.
- `core.js` – būsena, offline eilė (enqueue/flush), nuotraukos, render, navigacija, rolių apribojimai.
- `entries.js` – „Diena“, įrašo redaktorius, paieška, nuotraukų peržiūra.
- `objects.js` – objektų sąrašas/kalendorius, kortelė, redaktorius.
- `tasks.js` – užduotys (`DZ.newTask(preset)`).
- `reports.js`, `admin.js` (meniu, „Mano profilis“, vartotojai, katalogas, nustatymai).
- `pdf.js` – priėmimo–perdavimo aktas (jsPDF + DejaVu šriftai `www/vendor`), įkeliamas ir į Drive.
- `calendar.js` – objektų kalendorius, administratorių dokumentai (`object_docs`), `DZ.uploadFile`.
- `crm.js` – etapai (Užklausa → Pasiūlymas → Montavimas → Apmokėjimas → Užbaigta / Atšaukta), kitas veiksmas, skiltis „Šiandien“.
- `pay.js` – sąskaitos ir mokėjimai. `service.js` – SMS šablonai (sms: nuoroda), garantinės užklausos.
- `offers.js` – komerciniai pasiūlymai (tik administratoriams): eilutės iš katalogo, viena kaina arba eilučių kainos, nuolaida, PVM, šablonai (`offer_templates`, eilutės `per`: "kW"/"mod" – kiekis pagal objektą), PDF (jsPDF + DejaVuSans) → Drive ir `object_docs` (tipas „pasiulymas“).
- `shop.js` – elreda.lt parduotuvės prekės su kainomis (`shop_products`, tik admin; atnaujina Edge funkcija `shop-sync` iš WooCommerce Store API, kainos su PVM → be PVM /1,21). Naudojamos pasiūlymuose. Darbuotojams – atskiras medžiagų katalogas `products`.
- `contract.js` – sutartis (PDF) iš objekto ir pasiūlymo → Drive ir `object_docs` (tipas „sutartis“); terminai/garantijos `settings.contract`.
- `centas.js` – kontrahentų XLS eksportas į buhalterinę programą „Centas“ (20 stulpelių), įkeliamas ir į Drive.
- Programėlė (APK) – `html.native` kompaktiška išvaizda (`?native=1` naršyklėje); `MainActivity` (generuojamas workflow) riboja Android šrifto padidinimą iki 110 %.
- Edge `task-reminder` – kasdien 8:00 (pg_cron `supabase/reminders.sql`) el. laiškai su dienos užduotimis per Gmail (paslaptis `GMAIL_APP_PASSWORD`).
- `eso.js` – ESO prijungimo sąlygų ir rangovo deklaracijos importas (pdf.js / Tesseract iš jsDelivr CDN), užpildo objekto laukus, `objects.eso` jsonb.

## Rolės
admin (2 administratoriai), brigadininkas (lead), darbuotojas (mato tik „Diena“ ir savo užduotis). CRM, apmokėjimai, garantija, dokumentai – tik administratoriams (RLS `public.is_admin()`).

## Duomenų bazė
SQL failai `supabase/*.sql` (v2, crm, pay, service, profile, offers). Lentelės: profiles, objects (+ eso jsonb), entries, tasks, products, settings, object_docs, object_crm, object_invoices, object_payments, object_warranty, offers (no – numeris nuo 179), offer_templates, shop_products, reminder_log, workers, drive_photos, drive_folders, google_tokens. Funkcija `set_my_name(text)`.

## Taisyklės
- Slaptų raktų (API raktai, tokenai, slaptažodžiai) į kodą ar laukus nerašyti – tik Supabase secrets, įrašo pats naudotojas.
- Prieš ištrinant duomenis – klausti naudotojo.
- Telefone dažnai padidintas šriftas – tikrinti 360 px pločiu ir didesniu šriftu.

## Atvira
- SMS Biuras (smsbiuras.lt) integracija – laukiama siuntėjo vardo ir sprendimo.
- Prekių kainos kataloge – 0, laukiama kainoraščio.
