# MiroBike Ultra Planner

Lekka PWA do ultra: pokazuje, co masz przed sobą na trasie (sklepy, noclegi, paliwo, jedzenie)
z odległością w kilometrach trasy, ostrzeżeniami o lukach żywieniowych i ulubionymi.
Działa offline (poza kafelkami mapy). Dane punktów są wbudowane w `data.js`.

## Struktura

```
index.html             aplikacja
data.js                wbudowane punkty (window.BUNDLE) — trasa + POI
manifest.webmanifest   metryczka PWA
sw.js                  service worker (offline)
logo.svg               logo
icon-192.png / icon-512.png / apple-touch-icon.png   ikony
leaflet/               lokalna kopia Leaflet 1.9.4 (mapa offline)
```

## Uruchomienie lokalne

To statyczne pliki — wystarczy dowolny serwer HTTP z katalogu projektu, np.:

```
npx http-server -p 8000
# i wejdź na http://localhost:8000
```

GPS w przeglądarce działa tylko w bezpiecznym kontekście (HTTPS lub localhost).
Na `localhost` PC możesz testować klikaniem po mapie (symulacja pozycji).

## Wdrożenie: GitHub → Vercel

1. Utwórz repozytorium na GitHub i wrzuć tam zawartość tego katalogu (cały folder).
2. Na vercel.com: **Add New… → Project → Import** to repo.
3. Framework Preset: **Other** (to czysta statyka — bez buildu).
   Root Directory: katalog z `index.html`. Output: bez zmian.
4. Deploy. Dostajesz adres `https://twoj-projekt.vercel.app` po HTTPS.

## Instalacja na iPhonie

W Safari otwórz adres z Vercela → przycisk **Udostępnij** → **Dodaj do ekranu początkowego**.
Apka wskoczy ikoną, odpali się na pełnym ekranie i będzie działać offline.
GPS zadziała, bo strona jest po HTTPS.

## Aktualizacja punktów

Wymień `data.js` (format: `window.BUNDLE = { name, total_km, is_loop, route, pois, food_gaps };`).
Najprościej: w aplikacji „Eksportuj punkty" → dostajesz `bundle.json` → wklej jego treść do
`data.js` po `window.BUNDLE=` (i średnik na końcu). Po zmianie podbij wersję cache w `sw.js`
(`mirobike-v1` → `v2`), żeby telefon pobrał nowe dane.
