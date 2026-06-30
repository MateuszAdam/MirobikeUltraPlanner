import { timeAtKm, CLIMB_PENALTY_M } from "./eta";
import { pid } from "./geo";
import type { DownRoute, Poi, ModeKey, TripConfig, Override } from "./types";

/** Współczynnik zmęczenia: każdy kolejny dzień ~5% wolniej (podłoga 0.7). */
export function fatigueFactor(dayIndex: number): number {
  return Math.max(0.7, 1 - 0.05 * dayIndex);
}

/** Profil czasu z malejącą prędkością wg numeru dnia (zmęczenie wielodniowe). */
function fatiguedTime(ds: DownRoute, speedKmh: number, dailyKm: number): number[] {
  const t = [0];
  const vBase = (speedKmh * 1000) / 3600;
  const pen = 3600 / CLIMB_PENALTY_M;
  for (let i = 1; i < ds.lat.length; i++) {
    const seg = Math.max(0, ds.cum[i] - ds.cum[i - 1]);
    const day = Math.floor(ds.cum[i - 1] / 1000 / dailyKm);
    const v = vBase * fatigueFactor(day);
    let up = 0;
    const a = ds.ele[i], b = ds.ele[i - 1];
    if (a != null && b != null) up = Math.max(0, a - b);
    t.push(t[i - 1] + seg / v + up * pen);
  }
  return t;
}

export interface Mode {
  key: ModeKey;
  label: string;
  speedKmh: number;
  dailyKm: number;
  sleepHours: number;
}

// Presety. Użytkownik może nadpisać prędkość / km dziennie.
export const MODES: Mode[] = [
  { key: "max", label: "Maksymalny (top 10)", speedKmh: 25, dailyKm: 350, sleepHours: 3 },
  { key: "strong", label: "Mocny", speedKmh: 22, dailyKm: 250, sleepHours: 6 },
  { key: "rec", label: "Rekreacyjny", speedKmh: 18, dailyKm: 140, sleepHours: 8 },
];

export interface DayStop {
  poi: Poi;
  km: number;
  ms: number; // szacowana godzina (epoch ms)
}
export interface PlanDay {
  index: number; // 0-based
  fromKm: number;
  toKm: number; // koniec dnia (nocleg) lub meta
  distanceKm: number;
  startMs: number;
  endMs: number;
  lunch: DayStop | null;
  sleep: DayStop | null; // null w ostatnim dniu (meta)
  stops: DayStop[];       // własne przystanki użytkownika w tym dniu (posortowane wg km)
  isLast: boolean;
}

const LUNCH_MIN = 30; // przerwa obiadowa [min]

function kmAtTime(ds: DownRoute, time: number[], sec: number): number {
  if (sec <= time[0]) return ds.cum[0] / 1000;
  for (let i = 1; i < time.length; i++) {
    if (sec <= time[i]) {
      const f = (sec - time[i - 1]) / ((time[i] - time[i - 1]) || 1);
      return (ds.cum[i - 1] + f * (ds.cum[i] - ds.cum[i - 1])) / 1000;
    }
  }
  return ds.cum[ds.cum.length - 1] / 1000;
}

function nearestByKm(pois: Poi[], cats: string[], km: number, windowKm: number, prefer: Set<string>, overridePid?: string): Poi | null {
  if (overridePid) {
    const o = pois.find((p) => pid(p) === overridePid);
    if (o) return o;
  }
  const cands = pois.filter((p) => p.cats.some((c) => cats.includes(c)) && Math.abs(p.km - km) <= windowKm);
  if (!cands.length) return null;
  cands.sort((a, b) => (prefer.has(pid(b)) ? 1 : 0) - (prefer.has(pid(a)) ? 1 : 0) || Math.abs(a.km - km) - Math.abs(b.km - km));
  return cands[0];
}

/** Kandydaci do wyboru w UI (do edycji przystanku) — najbliższe wg km. */
export function candidates(pois: Poi[], cats: string[], km: number, windowKm: number, limit = 8): Poi[] {
  return pois
    .filter((p) => p.cats.some((c) => cats.includes(c)) && Math.abs(p.km - km) <= windowKm)
    .sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km))
    .slice(0, limit);
}

/**
 * Układa wstępny wielodniowy plan: dzieli trasę po `dailyKm`, dobiera nocleg
 * na koniec dnia i obiad ~`lunchHour`, liczy szacowane godziny przyjazdu.
 */
export function planTrip(
  ds: DownRoute,
  pois: Poi[],
  totalKm: number,
  cfg: TripConfig,
  favorites: Set<string>,
  overrides: Record<number, Override> = {},
  extras: string[] = [],
): PlanDay[] {
  const time = fatiguedTime(ds, cfg.speedKmh, cfg.dailyKm);
  const startMs = Date.parse(cfg.startISO) || Date.parse(new Date().toISOString());
  const nDays = Math.max(1, Math.ceil(totalKm / cfg.dailyKm));
  const byId = new Map(pois.map((p) => [pid(p), p]));
  const extraPois = extras.map((id) => byId.get(id)).filter((p): p is Poi => !!p);
  const days: PlanDay[] = [];
  let restSec = 0; // sumaryczny postój (sen + obiady) przed bieżącym km

  for (let i = 0; i < nDays; i++) {
    const fromKm = i * cfg.dailyKm;
    const isLast = (i + 1) * cfg.dailyKm >= totalKm;
    const dayTargetKm = isLast ? totalKm : (i + 1) * cfg.dailyKm;
    const ov = overrides[i] || {};

    // obiad: km, w którym zegar mija lunchHour tego dnia
    let lunch: DayStop | null = null;
    const fromClockMs = startMs + (timeAtKm(ds, time, fromKm)! + restSec) * 1000;
    const target = new Date(fromClockMs);
    target.setHours(cfg.lunchHour, 0, 0, 0);
    let lunchBreak = 0;
    if (target.getTime() >= fromClockMs) {
      const targetSec = (target.getTime() - startMs) / 1000 - restSec;
      const lunchKm = kmAtTime(ds, time, targetSec);
      if (lunchKm >= fromKm && lunchKm <= dayTargetKm) {
        const lp = nearestByKm(pois, ["eat", "food"], lunchKm, 12, favorites, ov.lunch);
        if (lp) {
          lunch = { poi: lp, km: lp.km, ms: startMs + (timeAtKm(ds, time, lp.km)! + restSec) * 1000 };
          lunchBreak = LUNCH_MIN * 60;
        }
      }
    }

    // nocleg na koniec dnia (poza ostatnim dniem)
    let sleep: DayStop | null = null;
    if (!isLast) {
      const sp = nearestByKm(pois, ["sleep"], dayTargetKm, 25, favorites, ov.sleep);
      if (sp) sleep = { poi: sp, km: sp.km, ms: startMs + (timeAtKm(ds, time, sp.km)! + restSec + lunchBreak) * 1000 };
    }

    const endKm = sleep ? sleep.km : dayTargetKm;
    const endMs = startMs + (timeAtKm(ds, time, endKm)! + restSec + lunchBreak) * 1000;
    // własne przystanki użytkownika mieszczące się w tym dniu (czas szacunkowy)
    const stops: DayStop[] = extraPois
      .filter((p) => p.km >= fromKm && p.km <= (isLast ? totalKm : dayTargetKm))
      .map((p) => ({ poi: p, km: p.km, ms: startMs + (timeAtKm(ds, time, p.km)! + restSec) * 1000 }))
      .sort((a, b) => a.km - b.km);
    days.push({
      index: i, fromKm, toKm: endKm, distanceKm: endKm - fromKm,
      startMs: fromClockMs, endMs, lunch, sleep, stops, isLast,
    });
    restSec += lunchBreak + (sleep ? cfg.sleepHours * 3600 : 0);
  }
  return days;
}

const DOW = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${DOW[d.getDay()]} ${hh}:${mm}`;
}
