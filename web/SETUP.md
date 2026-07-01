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
3. **Authentication → Providers → Email**: włącz **Email**. **Wyłącz „Confirm email"**
   (Enable email confirmations = OFF). Dzięki temu rejestracja hasłem od razu loguje
   w PWA — bez klikania linka w mailu (na iOS link otwiera Safari, czyli inny kontekst
   niż PWA). To świadomy kompromis dla darmowej apki rowerowej.
   - Logowanie odbywa się **e-mailem + hasłem** (oraz biometrią na urządzeniu — patrz niżej).
     Magic-linki/OTP nie są używane.
4. **Authentication → URL Configuration**: ustaw **Site URL** = `https://www.mirobike.grapevest.pl`
   i dodaj ten URL do **Redirect URLs** (plus `http://localhost:5173` na dev).
   Potrzebne tylko dla linku **resetu hasła** (jedyny mailowy flow, który został).
5. **Project Settings → API**: skopiuj `Project URL` i `anon public key`.

> **Biometria (Face ID / Touch ID / Windows Hello)** działa bez konfiguracji w Supabase.
> Po pierwszym zalogowaniu hasłem w menu „Konto" pojawi się „🔒 Włącz logowanie biometrią".
> Token sesji jest wtedy trzymany lokalnie (IndexedDB) za bramką WebAuthn urządzenia
> i rotowany przy odświeżaniu. Wymaga HTTPS (prod) lub localhost.

### 1b. Markowe maile + nadawca „od Ciebie" (dostarczalność)
Logowanie jest hasłem/biometrią, więc jedyny mail, jaki realnie wysyła apka, to **reset hasła**.
Gotowe, ładne szablony (styl „świt", bursztyn `#e7a14b`, jak w aplikacji) leżą w
[`supabase/email-templates/`](../supabase/email-templates/) — po jednym na każdy typ Supabase,
z tematami i mapowaniem w `README.md` tego folderu.

**A) Szablony** — Authentication → **Email Templates** → wklej HTML z folderu:
- **Reset Password** ← `reset-password.html` · Subject: `Zmiana hasła w MiroBike` *(aktywny)*
- Confirm signup ← `confirm-signup.html` *(tylko gdy włączysz „Confirm email")*
- Magic Link ← `magic-link.html` *(nieużywane — apka loguje hasłem)*
- Change Email Address ← `change-email.html`

Każdy używa zmiennej `{{ .ConfirmationURL }}` — nic więcej nie podstawiasz.

**B) Ładny nadawca + dostarczalność (zalecane)** — Project Settings → Authentication → **SMTP Settings**
→ włącz **Custom SMTP**. Darmowy dostawca (np. **Resend** ~3000 maili/mc albo Brevo), zweryfikuj
domenę `grapevest.pl` w DNS (**SPF + DKIM**, docelowo **DMARC**) i ustaw:
- **Sender name:** `MiroBike`
- **Sender email:** `noreply@grapevest.pl` (albo `konto@grapevest.pl`)

Bez custom SMTP maile idą z `…@supabase.io` — częściej w spamie, limitowane i nie wyglądają jak Twoje.
Pełna instrukcja (rekordy DNS, host/port) w `supabase/email-templates/README.md`.

### 1c. Logowanie: PWA (ekran początkowy) vs karta w Safari — iOS
**Na iPhonie zainstalowana PWA i Safari mają OSOBNE magazyny danych** (Apple je izoluje).
Skutki, o których trzeba wiedzieć:
- **Sesji NIE da się automatycznie współdzielić** między Safari a apką z ekranu początkowego —
  to ograniczenie systemu, nie błąd. „Zaloguj w przeglądarce → zalogowany w apce” samo z siebie
  nie zadziała na iOS (na Androidzie bywa różnie).
- **Linki z maila (reset hasła) zawsze otwierają się w Safari**, nie w PWA. Nie da się przekierować
  linku do zainstalowanej PWA na iOS.

**Dlatego apka jest zaprojektowana tak, by to nie bolało:**
1. **Logowanie hasłem** (nie magic-link) — logujesz się w tym kontekście, w którym jesteś. W apce →
   masz sesję w apce, bez żadnego linku. **Zostaw „Confirm email” = OFF** (pkt 3 wyżej), inaczej
   rejestracja wymusza link z maila (Safari) i PWA zostaje niezalogowana.
2. **Biometria** (Face ID / Touch ID) — po pierwszym logowaniu hasłem w danym kontekście kolejne to
   jedno dotknięcie. Ustawiasz osobno w apce i w Safari, ale potem nie wpisujesz już hasła.
3. **Trasy są w chmurze** — po zalogowaniu (w każdym kontekście, tym samym kontem) oba widzą te same
   dane. Czyli „to samo wszędzie” działa na poziomie danych, nawet jeśli sesja jest per-kontekst.

**Reset hasła w praktyce:** klikasz link → otwiera się Safari → ustawiasz nowe hasło (jesteś zalogowany
w Safari) → otwierasz apkę z ekranu początkowego i logujesz się nowym hasłem (raz — potem Face ID).

> **URL Configuration (wymagane, by reset działał):** Site URL + Redirect URLs muszą zawierać
> `https://www.mirobike.grapevest.pl` (+ `http://localhost:5173` na dev).

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
