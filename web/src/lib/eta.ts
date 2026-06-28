import type { DownRoute } from "./types";

// Model czasu jazdy: prędkość bazowa (płasko) + kara za przewyższenie (typu Naismith).
export const RIDE_KMH = 20;
export const CLIMB_PENALTY_M = 600; // metrów podjazdu = +1 h

export interface TimeProfile {
  time: number[]; // sekundy, wyrównane do DownRoute.cum
  ascent: number; // suma podjazdów [m]
}

export function buildTimeProfile(ds: DownRoute): TimeProfile {
  const time = [0];
  const vMs = (RIDE_KMH * 1000) / 3600;
  const penSecPerM = 3600 / CLIMB_PENALTY_M;
  let ascent = 0;
  for (let i = 1; i < ds.lat.length; i++) {
    const seg = Math.max(0, ds.cum[i] - ds.cum[i - 1]);
    let up = 0;
    const a = ds.ele[i];
    const b = ds.ele[i - 1];
    if (a != null && b != null) up = Math.max(0, a - b);
    ascent += up;
    time.push(time[i - 1] + seg / vMs + up * penSecPerM);
  }
  return { time, ascent };
}

/** Interpolowany czas [s] od startu do podanego kilometra. */
export function timeAtKm(ds: DownRoute, time: number[], km: number): number | null {
  if (!time.length) return null;
  const m = km * 1000;
  const c = ds.cum;
  if (m <= c[0]) return time[0];
  for (let i = 1; i < c.length; i++) {
    if (m <= c[i]) {
      const f = (m - c[i - 1]) / ((c[i] - c[i - 1]) || 1);
      return time[i - 1] + f * (time[i] - time[i - 1]);
    }
  }
  return time[time.length - 1];
}

/** ETA do punktu oddalonego o `delta` km od pozycji `cur` (obsługa pętli). */
export function etaAheadDelta(
  ds: DownRoute,
  time: number[],
  delta: number | null,
  cur: number,
  totalKm: number,
): number | null {
  if (!time.length || delta == null || delta <= 0) return null;
  let tk = cur + delta;
  const tEnd = timeAtKm(ds, time, totalKm)!;
  const tCur = timeAtKm(ds, time, cur)!;
  if (tk > totalKm) {
    tk -= totalKm;
    return tEnd - tCur + timeAtKm(ds, time, tk)!;
  }
  return timeAtKm(ds, time, tk)! - tCur;
}

export function fmtDur(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return "";
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}
