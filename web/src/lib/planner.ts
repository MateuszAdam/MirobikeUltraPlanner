import { aheadDelta } from "./geo";
import { timeAtKm, etaAheadDelta } from "./eta";
import type { DownRoute, FoodGap, Poi } from "./types";

export interface Ahead {
  p: Poi;
  delta: number;
}

export function kmStep(total: number): number {
  return total <= 60 ? 5 : total <= 150 ? 10 : total <= 400 ? 20 : 25;
}

export function kmMarkerFeatures(ds: DownRoute, totalKm: number): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  const step = kmStep(totalKm);
  const c = ds.cum;
  for (let km = step; km < totalKm - 0.5; km += step) {
    const m = km * 1000;
    let i = 1;
    while (i < c.length && c[i] < m) i++;
    const f = (m - c[i - 1]) / ((c[i] - c[i - 1]) || 1);
    const la = ds.lat[i - 1] + f * (ds.lat[i] - ds.lat[i - 1]);
    const lo = ds.lon[i - 1] + f * (ds.lon[i] - ds.lon[i - 1]);
    out.push({ type: "Feature", properties: { km, label: String(km) }, geometry: { type: "Point", coordinates: [lo, la] } });
  }
  return out;
}

/** Lista miejsc przed pozycją (już przefiltrowanych przez widoczność), wg km. */
export function aheadList(visiblePois: Poi[], hereKm: number, isLoop: boolean, totalKm: number, rangeKm: number): Ahead[] {
  return visiblePois
    .map((p) => ({ p, delta: aheadDelta(p.km, hereKm, isLoop, totalKm) }))
    .filter((x) => x.delta > 0.02 && x.delta <= rangeKm)
    .sort((a, b) => a.delta - b.delta);
}

/** Najbliższe miejsce danej kategorii przed pozycją (z pełnej listy). */
export function nextOfCat(pois: Poi[], cat: string, hereKm: number, isLoop: boolean, totalKm: number): Ahead | null {
  return pois
    .filter((p) => p.cats.includes(cat as Poi["cats"][number]))
    .map((p) => ({ p, delta: aheadDelta(p.km, hereKm, isLoop, totalKm) }))
    .filter((x) => x.delta > 0.02)
    .sort((a, b) => a.delta - b.delta)[0] ?? null;
}

export function nextShop(pois: Poi[], hereKm: number, isLoop: boolean, totalKm: number): Ahead | null {
  return nextOfCat(pois, "food", hereKm, isLoop, totalKm);
}

export interface GapWarning {
  kmTo: number;
  gapKm: number;
}

/** Ostrzeżenie: za chwilę ostatni sklep przed długim odcinkiem bez zaopatrzenia. */
export function gapBeforeStretch(gaps: FoodGap[], hereKm: number, rangeKm: number): GapWarning | null {
  const g = gaps.find((x) => x.fromKm > hereKm - 0.5 && x.fromKm - hereKm <= rangeKm && x.fromKm - hereKm < 10);
  return g ? { kmTo: g.fromKm - hereKm, gapKm: g.gapKm } : null;
}

export interface PlanRow {
  p: Poi;
  index: number;
  segKm: number; // od poprzedniego (lub startu)
  segSec: number | null; // czas tego odcinka
  fromYouKm: number | null; // od bieżącej pozycji (lub null)
  fromYouSec: number | null;
}

/** Wiersze „Planu przystanków" z ulubionych (wg km) + czasy odcinków. */
export function planRows(
  favPois: Poi[],
  ds: DownRoute | null,
  time: number[],
  hereKm: number | null,
  isLoop: boolean,
  totalKm: number,
): PlanRow[] {
  const favs = [...favPois].sort((a, b) => a.km - b.km);
  return favs.map((p, i) => {
    const segKm = i === 0 ? p.km : p.km - favs[i - 1].km;
    const segSec = ds && time.length ? (i === 0 ? timeAtKm(ds, time, p.km)! : timeAtKm(ds, time, p.km)! - timeAtKm(ds, time, favs[i - 1].km)!) : null;
    const fromYouKm = hereKm != null ? aheadDelta(p.km, hereKm, isLoop, totalKm) : null;
    const fromYouSec = ds && time.length && hereKm != null && fromYouKm != null && fromYouKm > 0 ? etaAheadDelta(ds, time, fromYouKm, hereKm, totalKm) : null;
    return { p, index: i, segKm, segSec, fromYouKm, fromYouSec };
  });
}

export function plPlural(n: number): string {
  if (n === 1) return "przystanek";
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? "przystanki" : "przystanków";
}

/** Progi powiadomień o zbliżaniu się do ulubionego [km]. */
export const FAV_THRESHOLDS = [50, 20, 10, 5, 2];

/**
 * Najciaśniejszy próg, w którym mieści się `delta` (najmniejszy próg ≥ delta).
 * Zwraca go, jeśli nie było jeszcze powiadomienia; inaczej null. Dzięki temu nie
 * odpalamy progów „za nami" po zbliżeniu się do celu.
 */
export function crossedThreshold(delta: number, alerted: Set<number>): number | null {
  let bucket: number | null = null;
  for (const th of FAV_THRESHOLDS) {
    if (delta <= th && (bucket == null || th < bucket)) bucket = th;
  }
  if (bucket == null) return null;
  return alerted.has(bucket) ? null : bucket;
}
