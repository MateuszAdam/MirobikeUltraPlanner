import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import layers from "protomaps-themes-base";

// Styl mapy. Preferowane: własny PMTiles (offline, zgodne z licencją OSM —
// w przeciwieństwie do tile.openstreetmap.org). Fallback: demo MapLibre (online).
const PMTILES_URL = import.meta.env.VITE_PMTILES_URL as string | undefined;

let registered = false;
export function registerPmtiles(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}

export function buildStyle(): maplibregl.StyleSpecification | string {
  if (PMTILES_URL) {
    registerPmtiles();
    return {
      version: 8,
      glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
      sources: {
        protomaps: {
          type: "vector",
          url: "pmtiles://" + PMTILES_URL,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: layers("protomaps", "light", "pl"),
    } as maplibregl.StyleSpecification;
  }
  // Brak PMTiles → demo (tylko do developmentu; nie do produkcji offline).
  return "https://demotiles.maplibre.org/style.json";
}
