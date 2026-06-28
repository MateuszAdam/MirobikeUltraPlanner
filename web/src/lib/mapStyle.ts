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
  // Brak PMTiles → standardowy OSM raster (jak w starej apce; ładny i znajomy).
  // Uwaga: do produkcji na większą skalę docelowo PMTiles (polityka kafelków OSM).
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  } as maplibregl.StyleSpecification;
}
