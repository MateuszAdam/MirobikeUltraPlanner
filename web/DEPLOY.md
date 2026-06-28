# MiroBike — wdrożenie krok po kroku (Twoja część)

Kolejność: **Supabase → PMTiles → Vercel → DNS (OVH) → GitHub Action → SEO/Google**.
Apka jest w katalogu `web/` na gałęzi `rewrite`. Najpierw zmerguj `rewrite` do `main`
(albo w Vercel ustaw Production Branch = `rewrite`).

---

## 1. Supabase (konta + sync)
1. supabase.com → New project (region np. Frankfurt). Zapamiętaj hasło do bazy.
2. **SQL Editor** → wklej całość `supabase/schema.sql` → Run. (tworzy `routes` + RLS + `heartbeat`).
3. **Authentication → Providers → Email**: włącz. (opcjonalnie Google: Providers → Google + klucze OAuth).
4. **Authentication → URL Configuration**:
   - Site URL: `https://www.mirobike.grapevest.pl`
   - Redirect URLs: dodaj `https://www.mirobike.grapevest.pl` i `http://localhost:5173`
5. **Project Settings → API**: skopiuj `Project URL` i `anon public` key (do kroku 3).

## 2. Mapa offline (PMTiles na Cloudflare R2)
> Plik jest za duży na Vercel/git, dlatego R2 (darmowy egress).
1. Pobierz binarkę `pmtiles`: https://github.com/protomaps/go-pmtiles/releases (dodaj do PATH).
2. W katalogu `web`: `MAXZOOM=14 ./scripts/build-pmtiles.sh` → powstanie `poland-border.pmtiles`
   (Polska + ~50 km bufor graniczny; z10 ≈ 135 MB, z14 więcej).
3. Cloudflare → R2 → utwórz bucket (np. `mirobike-maps`) → wgraj plik → włącz **public access**
   (R2.dev URL lub własna subdomena). Skopiuj publiczny URL pliku `.pmtiles`.
4. URL trafia do `VITE_PMTILES_URL` (krok 3). Bez tego mapa działa, ale online (OSM raster), nie offline.

## 3. Vercel (hosting)
1. vercel.com → Add New → Project → import repo `MirobikeUltraPlanner`.
2. **Root Directory: `web`**. Framework: Vite (auto). Build: `npm run build`, Output: `dist`.
3. **Settings → Environment Variables** (Production + Preview):
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   VITE_PMTILES_URL=https://<r2-public>/poland-border.pmtiles
   ```
4. (jeśli zostajesz na gałęzi) Settings → Git → Production Branch = `rewrite`. Deploy.
> Vercel **Hobby** = użytek niekomercyjny. Darowizny („Postaw kawę") OK. Bez afiliacji = OK.

## 4. Domena `www.mirobike.grapevest.pl` (DNS w OVH)
1. Vercel → projekt → **Settings → Domains** → dodaj `www.mirobike.grapevest.pl`. Vercel poda rekord.
2. OVH → `grapevest.pl` → **Strefa DNS** → dodaj:
   ```
   Typ: CNAME   Subdomena: www.mirobike   Cel: cname.vercel-dns.com.
   ```
   (dokładny cel pokaże Vercel; trzymaj się jego instrukcji)
3. (opcjonalnie) przekierowanie `mirobike.grapevest.pl` → `www.mirobike...` też dodaj w Vercel.
4. Poczekaj na propagację (minuty–godziny), kliknij **Verify** w Vercel. HTTPS dostaje się sam.

## 5. Keep-alive Supabase (free tier zasypia po 7 dniach)
GitHub repo → **Settings → Secrets and variables → Actions → New secret**:
```
SUPABASE_URL       = https://<ref>.supabase.co
SUPABASE_ANON_KEY  = <anon public key>
```
Workflow `.github/workflows/keepalive.yml` pinguje codziennie. (Możesz odpalić ręcznie: Actions → supabase-keepalive → Run workflow.)

---

## 6. SEO i pojawienie się w Google
Kod-część jest już zrobiona: `<title>`, opis, Open Graph, `canonical`, `robots.txt`, `sitemap.xml`,
`noscript` z opisem dla crawlerów. Twoje kroki:

1. **Google Search Console** (search.google.com/search-console):
   - Dodaj zasób. Najlepiej **Domain** (`grapevest.pl`) — wtedy wymaga **weryfikacji DNS**:
     OVH → Strefa DNS → dodaj rekord **TXT** o treści, którą poda GSC. (Albo zasób „URL prefix"
     dla `https://www.mirobike.grapevest.pl/` i weryfikacja przez plik/HTML tag.)
   - Po weryfikacji: **Sitemaps** → podaj `sitemap.xml` → Submit.
   - **URL Inspection** → wklej `https://www.mirobike.grapevest.pl/` → **Request indexing**.
2. **Bing Webmaster Tools** (opcjonalnie) — analogicznie, można zaimportować z GSC.
3. **Sprawdź podgląd linku** (jak wygląda udostępnienie): https://www.opengraph.xyz/ (wklej URL).
4. **Przyśpieszacze pozycjonowania** (poza kodem):
   - Zdobądź kilka linków: profil na forach ultra/rowerowych, grupa FB, opis w bio.
   - Treść = pozycja: rozważ krótką stronę/opis „jak używać" z frazami typu
     „planer noclegów ultra", „GPX noclegi sklepy trasa" (frazy, których ludzie szukają).
   - Upewnij się, że strona jest szybka i mobilna (jest — PWA) → Google to lubi.
5. **Czas**: indeksacja nowej domeny to zwykle kilka dni–2 tygodnie. „Request indexing" przyspiesza.

> Uwaga: to apka-narzędzie (mało treści), więc nie licz na top na konkurencyjne frazy bez treści/linków.
> Na frazę brandową „MiroBike ultra planner" wejdziesz szybko.

---

## Po wdrożeniu — szybki test
- Otwórz `https://www.mirobike.grapevest.pl/` na telefonie → „Dodaj do ekranu początkowego".
- Zaloguj się (e-mail magic link) → na PC pobierz miejsca → Zapisz → Sync.
- Na telefonie zaloguj → Sync → dane są offline (wyłącz sieć i sprawdź listę + pozycję).
- GPS wymaga HTTPS — na domenie zadziała (na `http://IP:5173` nie).
