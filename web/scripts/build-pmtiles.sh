#!/usr/bin/env bash
set -euo pipefail

# Tworzy wycinek mapy (PMTiles) dla Polski + bufor graniczny (~50 km),
# żeby trasy biegnące przy samej granicy też miały podkład.
#
# Wymaga narzędzia `pmtiles` (Go): https://github.com/protomaps/go-pmtiles/releases
# (rozpakuj i dodaj do PATH). Plik źródłowy to dzienny build planety Protomaps.
#
# Użycie:
#   ./build-pmtiles.sh                      # użyje domyślnego źródła i maxzoom=14
#   MAXZOOM=12 ./build-pmtiles.sh           # mniejszy plik (mniej detalu)
#   ./build-pmtiles.sh <src.pmtiles> <out>  # własne ścieżki
#
# Domyślne źródło: stabilny publiczny build demo Protomaps. Najświeższe dzienne
# buildy: https://maps.protomaps.com/builds/ . pmtiles pobiera tylko potrzebne
# zakresy bajtów (HTTP Range) — nie ściąga całej planety.
#
# ZMIERZONE ROZMIARY (Polska + bufor graniczny, z demo-bucket):
#   maxzoom=10 -> ~135 MB. Detal ulic wymaga z13-14 -> setki MB.
#   => Plik trzymaj na Cloudflare R2 (GitHub odrzuca >100 MB; Vercel niepraktyczny).
#      Tylko bardzo niski zoom (<=8, brak ulic) zmieści się w web/public/ na Vercelu.

SRC="${1:-https://demo-bucket.protomaps.com/v4.pmtiles}"
OUT="${2:-poland-border.pmtiles}"
MAXZOOM="${MAXZOOM:-14}"

# bbox: Polska (~14.07,49.0,24.15,54.84) + bufor ~0.5° (~50 km) na granice.
BBOX="13.4,48.5,24.8,55.4"

echo "Źródło : $SRC"
echo "Wyjście: $OUT"
echo "bbox   : $BBOX  (Polska + bufor graniczny)"
echo "maxzoom: $MAXZOOM"

pmtiles extract "$SRC" "$OUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"

echo
echo "Gotowe: $OUT"
echo "Wgraj go na Cloudflare R2 (lub web/public/ jeśli mały) i ustaw VITE_PMTILES_URL."
