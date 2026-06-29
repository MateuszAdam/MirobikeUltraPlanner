# MiroBike (rewrite) — setup i kroki manualne

Nowa wersja: **React + Vite + TS**, offline-first PWA (IndexedDB/Dexie + service worker),
mapa **MapLibre GL + PMTiles**, konta + sync przez **Supabase** (bez E2E).
Stary `index.html` (vanilla) został na gałęzi `main` i działa dalej.

## Uruchomienie lokalne (dev)
```bash
cd web
npm install
cp .env.example .env.local   # uzupełnij zmienne (niżej)
npm run dev
```
Bez `.env.local` apka działa **lokalnie** (offline, bez kont) — mapa używa demo MapLibre.

---

## ✅ Co musisz zrobić ręcznie

### 1. Supabase (konta + sync)
1. Projekt na supabase.com (możesz użyć istniejącego).
2. **SQL Editor** → wklej i uruchom `supabase/schema.sql` (tabela `routes` + RLS + `heartbeat`).
3. **Authentication → Providers**: włącz **Email** (magic link). Opcjonalnie **Google** (OAuth).
4. **Authentication → URL Configuration**: ustaw **Site URL** = `https://www.mirobike.grapevest.pl`
   i dodaj ten URL do **Redirect URLs** (plus `http://localhost:5173` na dev).
5. **Project Settings → API**: skopiuj `Project URL` i `anon public key`.

### 1b. Ładny mail logowania (zamiast domyślnego „spamu")
Domyślny mail Supabase jest po angielsku i od `…@supabase.io` (wygląda jak spam, ląduje w spamie).
Popraw to w panelu:

**A) Polski szablon** — Authentication → **Email Templates → Magic Link**:
- **Subject:** `Twój kod / link logowania do MiroBike`
- **Message (HTML):**
```html
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#14161b">
  <h2 style="margin:0 0 6px">🚴 MiroBike Ultra Planner</h2>
  <p style="font-size:15px;line-height:1.5">Cześć! Aby zalogować się do MiroBike, wpisz w aplikacji ten kod:</p>
  <p style="text-align:center;margin:18px 0">
    <span style="display:inline-block;font-size:30px;font-weight:800;letter-spacing:8px;background:#f1f5f4;color:#04201e;padding:14px 22px;border-radius:12px">{{ .Token }}</span>
  </p>
  <p style="font-size:14px;line-height:1.5;text-align:center;color:#667">albo kliknij przycisk (na tym samym urządzeniu):</p>
  <p style="text-align:center;margin:14px 0 22px">
    <a href="{{ .ConfirmationURL }}" style="background:#19e0d6;color:#04201e;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:10px;display:inline-block">Zaloguj się</a>
  </p>
  <p style="font-size:13px;color:#667">Kod/link działa krótko i tylko raz. Jeśli to nie Ty prosiłeś o logowanie — zignoruj tę wiadomość.</p>
  <p style="font-size:13px;color:#667">Rowerowych kilometrów!<br>— MiroBike · mirobike.grapevest.pl</p>
</div>
```
> **Ważne:** `{{ .Token }}` to 6-cyfrowy kod. Aplikacja na iOS w trybie PWA loguje się **kodem** (link otwiera się w Safari, czyli w innym kontekście niż PWA — tam byś nie był zalogowany w aplikacji). Dlatego szablon musi zawierać `{{ .Token }}`.

(zrób to samo dla „Confirm signup" — dodaj `{{ .Token }}`; pozostałe szablony możesz zostawić.)

**B) Ładny nadawca + dostarczalność (mocno zalecane)** — Project Settings → Authentication → **SMTP Settings** → włącz **Custom SMTP**. Użyj darmowego dostawcy (np. **Resend** ~3000 maili/mc albo Brevo), zweryfikuj domenę `grapevest.pl` (SPF/DKIM) i ustaw:
- **Sender name:** `MiroBike`
- **Sender email:** `noreply@grapevest.pl` (albo `logowanie@grapevest.pl`)

Bez custom SMTP maile idą z `…@supabase.io`, częściej trafiają do spamu i są limitowane.

### 2. Zmienne środowiskowe
W `web/.env.local` (dev) oraz w Vercel (prod → Settings → Environment Variables):
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PMTILES_URL=https://<twój-cdn>/poland.pmtiles
```

### 3. Mapa offline (PMTiles)  ⚠️ wymaga R2 (plik za duży na Vercel/git)
Gotowy skrypt z **buforem granicznym** (trasy przy granicy PL): `web/scripts/build-pmtiles.sh`.
1. Pobierz binarkę `pmtiles` (Go): https://github.com/protomaps/go-pmtiles/releases (dodaj do PATH).
2. Uruchom (z katalogu `web`):
   ```bash
   MAXZOOM=14 ./scripts/build-pmtiles.sh
   # tworzy poland-border.pmtiles, bbox 13.4,48.5,24.8,55.4 (Polska + ~50 km bufor)
   ```
   **Zmierzone rozmiary:** maxzoom=10 ≈ **135 MB**; detal ulic (z13–14) → setki MB.
3. Wrzuć plik na **Cloudflare R2** (publiczny bucket, obsługuje HTTP Range). Ustaw `VITE_PMTILES_URL` na jego URL.

> Dlaczego nie Vercel/git? GitHub odrzuca pliki >100 MB, a sensowny detal Polski to >100 MB.
> Na `web/public/` (Vercel) zmieści się tylko bardzo niski zoom (≤8, bez ulic). Stąd R2.
> Bez `VITE_PMTILES_URL` mapa używa demo MapLibre (online) — działa, ale nie offline.

### 4. Vercel (hosting)
1. New Project → import repo `MirobikeUltraPlanner`.
2. **Root Directory** = `web`. Framework: **Vite** (auto). Build: `npm run build`, output `dist`.
3. Dodaj zmienne środowiskowe (jak wyżej).
4. **Domains** → dodaj `www.mirobike.grapevest.pl`.
> Uwaga: Vercel **Hobby = niekomercyjne**. Darowizny („Postaw kawę") są OK. Afiliacja została usunięta, więc Hobby jest zgodny. Gdybyś wrócił do afiliacji — potrzebny Pro albo Cloudflare Pages.

### 5. DNS w OVHcloud
W panelu domeny `grapevest.pl` → strefa DNS dodaj rekord wg instrukcji z Vercel (Domains):
```
CNAME   mirobike   →   cname.vercel-dns.com.
```
(lub `www.mirobike` zależnie od tego co wpiszesz w Vercel). Poczekaj na propagację i kliknij **Verify** w Vercel.

### 6. Keep-alive Supabase (free tier zasypia po 7 dniach)
W repo (Settings → Secrets and variables → Actions) dodaj sekrety:
```
SUPABASE_URL        = https://<ref>.supabase.co
SUPABASE_ANON_KEY   = <anon key>
```
Workflow `.github/workflows/keepalive.yml` pinguje `heartbeat` codziennie.

---

## Flow docelowy
- **Na komputerze**: logujesz się → wczytujesz GPX → „Pobierz miejsca" (ciężki Overpass) → „Zapisz" → „Sync" wysyła lekką paczkę (jsonb) na konto.
- **Na telefonie**: logujesz się → „Sync" pobiera paczki do IndexedDB → działasz **offline** na małych danych.

## Prep CLI: bogatsze POI z Overture (desktop)
OSM (Overpass) bywa ubogie w biznesy. Alternatywa: **Overture Places** (~60 mln POI,
licencja CDLA Permissive 2.0 — wolno pobierać i bundle'ować). Skrypt produkuje gotowy
`bundle.json` z **korytarza trasy** (pętle: nic ze środka), bez zapytań w runtime apki.

```bash
cd web
# wymaga jednego z: `pip install overturemaps`  ALBO  `duckdb` w PATH
npm run build:bundle -- \
  --gpx ../trasa.gpx --name "3C 2026" \
  --radius 2000 --radius-sleep 5000 \
  --release 2026-05-21.0 --confidence 0.5 \
  --out ./out/3c-2026 --also-data-js
```
- Overture → food/sleep/fuel/eat/pharmacy; woda i serwis rowerowy dobierane z OSM.
- `--release` sprawdź na overturemaps.org/release (DuckDB wymaga tego argumentu).
- `--from-geojson <plik>` — pomiń pobieranie, użyj gotowego GeoJSON.
- Wynik `out/<slug>/bundle.json` wczytasz w aplikacji: ☰ → „Wczytaj z pliku (.json)".
- In-app pobieranie z Overpass zostaje jako alternatywa (bez zmian).

**Atrybucja:** © OpenStreetMap contributors, Overture Maps Foundation.

## Stan rewrite (gałąź `rewrite`) — PARYTET FUNKCJONALNY ✅
✅ Scaffold, core logic (GPX/geo/ETA/import/Overpass/planner), Dexie + `persist()`, Supabase client + sync, MapLibre+PMTiles, PWA, schemat SQL, keep-alive.
✅ UI: przewodnik krokowy, filtry kategorii, GPS „śledź" + kółko dokładności + powiadomienia o ulubionych, panel „przede mną" z ETA, ostrzeżenia (następny sklep / luka przed odcinkiem), Plan przystanków, arkusz szczegółów, import KML/CSV/GPX w UI, znaczniki km, zapis/wczytanie/zmiana nazwy/usuwanie offline, przełącznik mapa/lista (mobile).
✅ 37 testów jednostkowych (rdzeń + planner). `npm run build` i `npm test` przechodzą.
⏳ Poler/później: code-split (bundle ~1.1 MB przez MapLibre), migracja `protomaps-themes-base` → `@protomaps/basemaps`, testy komponentów (jsdom).
