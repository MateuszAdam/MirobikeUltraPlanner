import type { Route, DownRoute, Side } from "./types";

/** Odległość Haversine [m]. */
export function hav(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const Rk = 6371000;
  const t = Math.PI / 180;
  const p1 = aLat * t;
  const p2 = bLat * t;
  const dp = (bLat - aLat) * t;
  const dl = (bLon - aLon) * t;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Rk * Math.asin(Math.sqrt(a));
}

/** Stabilny identyfikator POI po zaokrąglonych współrzędnych. */
export function pid(p: { lat: number; lon: number }): string {
  return p.lat.toFixed(5) + "," + p.lon.toFixed(5);
}

/** Próbkowanie trasy co ~stepM metrów (zachowuje wysokość). */
export function downsample(r: Route, stepM: number): DownRoute {
  const lat = [r.pts[0].lat];
  const lon = [r.pts[0].lon];
  const cum = [0];
  const ele: (number | undefined)[] = [r.pts[0].ele];
  let acc = 0;
  for (let i = 1; i < r.pts.length; i++) {
    acc += hav(r.pts[i - 1].lat, r.pts[i - 1].lon, r.pts[i].lat, r.pts[i].lon);
    if (acc >= stepM) {
      lat.push(r.pts[i].lat);
      lon.push(r.pts[i].lon);
      cum.push(r.cum[i]);
      ele.push(r.pts[i].ele);
      acc = 0;
    }
  }
  const last = r.pts[r.pts.length - 1];
  lat.push(last.lat);
  lon.push(last.lon);
  cum.push(r.totalM);
  ele.push(last.ele);
  return { lat, lon, cum, ele };
}

export interface Projection {
  km: number;
  detourM: number;
  side: Side;
}

/**
 * Rzutuje punkt na trasę: zwraca kilometraż, odległość w bok i stronę (L/P).
 * `win` ogranicza wyszukiwanie do okna ±winKm wokół znanego km (anty-„teleport" na
 * pętlach/lollipopach). Gdy brak trafienia (best>3 km), wraca do wyszukiwania globalnego.
 */
export function project(d: DownRoute, plat: number, plon: number, win?: { km: number; winKm: number }): Projection {
  let best = Infinity;
  let bk = 0;
  let bside: Side = "";
  const kx = Math.cos((plat * Math.PI) / 180) * 111320;
  const ky = 110540;
  const px = plon * kx;
  const py = plat * ky;
  for (let i = 0; i < d.lat.length - 1; i++) {
    if (win) {
      const c0 = d.cum[i] / 1000;
      const c1 = d.cum[i + 1] / 1000;
      if (Math.abs(c0 - win.km) > win.winKm && Math.abs(c1 - win.km) > win.winKm) continue;
    }
    const ax = d.lon[i] * kx;
    const ay = d.lat[i] * ky;
    const bx = d.lon[i + 1] * kx;
    const by = d.lat[i + 1] * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const fx = ax + t * dx;
    const fy = ay + t * dy;
    const dist = Math.hypot(px - fx, py - fy);
    if (dist < best) {
      best = dist;
      bk = d.cum[i] + t * (d.cum[i + 1] - d.cum[i]);
      bside = dx * (py - ay) - dy * (px - ax) > 0 ? "L" : "P";
    }
  }
  if (win && (best === Infinity || best > 3000)) return project(d, plat, plon); // fallback globalny
  return { km: bk / 1000, detourM: Math.round(best), side: bside };
}

/** Delta „przede mną" z obsługą pętli. */
export function aheadDelta(km: number, cur: number, isLoop: boolean, totalKm: number): number {
  let dlt = km - cur;
  if (dlt < -0.05 && isLoop) dlt += totalKm;
  return dlt;
}
