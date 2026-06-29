import { MODES } from "./trip";
import type { CatKey, TripConfig } from "./types";

export const CAT_COLOR: Record<CatKey, string> = {
  food: "#3ec98a", sleep: "#7c8cff", fuel: "#f5a623", eat: "#ff6b6b",
  water: "#38bdf8", bike: "#9aa3b2", pharmacy: "#ff5a8a", spot: "#c77dff",
};

/** Odległość: metry < 1 km jako „X m", powyżej jako „X,X km" (przecinek dziesiętny). */
export function fmtDist(m: number): string {
  if (m >= 1000) return (m / 1000).toFixed(1).replace(".", ",") + " km";
  return Math.round(m) + " m";
}

/**
 * Link do Booking zakotwiczony na LOKALIZACJI miejsca, nie na jego nazwie.
 * Wcześniej `ss=<nazwa>` dla nieznanej/ogólnej nazwy noclegu powodował, że
 * Booking pokazywał domyślne, promowane wyniki (np. hotele nad morzem).
 * Teraz `ss` = miejscowość z OSM (albo współrzędne) + dokładne lat/lon, więc
 * wyniki są w okolicy punktu na trasie.
 */
export function bookingUrl(p: { name: string; lat: number; lon: number; tags?: Record<string, string> }): string {
  const t = p.tags ?? {};
  const place = t["addr:city"] || t["addr:town"] || t["addr:village"] || t["addr:hamlet"] || t["addr:place"] || "";
  const ss = place || `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
  const q = new URLSearchParams({ ss, latitude: String(p.lat), longitude: String(p.lon) });
  return `https://www.booking.com/searchresults.html?${q.toString()}`;
}

/** Czy miejsce jest czynne całodobowo (OSM opening_hours = 24/7). */
export function is24h(t?: Record<string, string>): boolean {
  return !!t?.opening_hours && /24\s*\/\s*7/.test(t.opening_hours);
}

/** Date → wartość dla <input type="datetime-local"> (lokalny czas, bez strefy). */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Domyślna konfiguracja plannera (tryb „mocny", start jutro 07:00). */
export function defaultCfg(): TripConfig {
  const m = MODES[1];
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0);
  return { mode: m.key, speedKmh: m.speedKmh, dailyKm: m.dailyKm, sleepHours: m.sleepHours, lunchHour: 13, startISO: toLocalInput(d) };
}
