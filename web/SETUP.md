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

## Stan rewrite (gałąź `rewrite`)
✅ Scaffold, core logic (GPX/geo/ETA/import/Overpass), Dexie + `persist()`, Supabase client + sync, MapLibre+PMTiles, PWA, schemat SQL, keep-alive.
⏳ Do przeniesienia z `main` (kolejne kroki): przewodnik krokowy, filtry kategorii, GPS „śledź", panel „przede mną", Plan przystanków, arkusz szczegółów, import w UI, znaczniki km, ostrzeżenia o brakach sklepów.
