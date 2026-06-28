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

### 3. Mapa offline (PMTiles)
1. Pobierz wycinek (np. Polska) jako PMTiles:
   - gotowe buildy: https://maps.protomaps.com/builds/ (plik `.pmtiles`), albo
   - własny wycinek: `pmtiles extract <planet.pmtiles> poland.pmtiles --bbox=14.0,49.0,24.2,54.9`
2. Wrzuć plik na **Cloudflare R2** / publiczny bucket z obsługą **HTTP Range** (R2 obsługuje).
3. Ustaw `VITE_PMTILES_URL` na publiczny URL pliku.
> Bez tego mapa używa demo MapLibre (online) — działa, ale nie offline i nie do produkcji.

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
