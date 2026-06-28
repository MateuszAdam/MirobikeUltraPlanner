import { PMTiles } from "pmtiles";
import type { DownRoute } from "./types";

function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latR = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latR)) / Math.PI) / 2) * n);
  return [x, y];
}

/**
 * Pre-fetch zakresów PMTiles pokrywających korytarz trasy — żeby w terenie bez zasięgu
 * mapa nie była pusta. Pobiera te same zakresy bajtów, których użyje MapLibre (ten sam URL),
 * więc Service Worker je cache'uje. Zwraca liczbę kafelków.
 */
export async function prewarmCorridor(
  url: string,
  ds: DownRoute,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ total: number; capped: boolean }> {
  const pm = new PMTiles(url);
  const h = await pm.getHeader();
  const maxZ = Math.min(h.maxZoom ?? 14, 14);
  const minZ = h.minZoom ?? 0;

  const tiles = new Set<string>();
  for (let z = minZ; z <= maxZ; z++) {
    for (let i = 0; i < ds.lat.length; i++) {
      const [x, y] = lonLatToTile(ds.lon[i], ds.lat[i], z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.add(`${z}/${x + dx}/${y + dy}`);
    }
  }
  let list = [...tiles];
  const CAP = 8000;
  let capped = false;
  if (list.length > CAP) {
    capped = true;
    const stride = Math.ceil(list.length / CAP);
    list = list.filter((_, i) => i % stride === 0);
  }

  let done = 0;
  for (const key of list) {
    if (signal?.aborted) break;
    const [z, x, y] = key.split("/").map(Number);
    try { await pm.getZxy(z, x, y); } catch { /* brak kafelka / sieć */ }
    done++;
    if (done % 25 === 0 || done === list.length) onProgress(done, list.length);
  }
  return { total: list.length, capped };
}
