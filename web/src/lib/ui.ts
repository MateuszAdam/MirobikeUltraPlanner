import { MODES } from "./trip";
import type { CatKey, TripConfig } from "./types";

export const CAT_COLOR: Record<CatKey, string> = {
  food: "#3ec98a", sleep: "#7c8cff", fuel: "#f5a623", eat: "#ff6b6b",
  water: "#38bdf8", bike: "#9aa3b2", pharmacy: "#ff5a8a", spot: "#c77dff",
};

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
