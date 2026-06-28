import { describe, it, expect } from "vitest";
import { planTrip, candidates, MODES } from "./trip";
import type { DownRoute, Poi, TripConfig } from "./types";

const ds: DownRoute = { lat: [50, 50], lon: [15, 21], cum: [0, 600000], ele: [undefined, undefined] };

function poi(name: string, km: number, cat: Poi["cats"][number]): Poi {
  return { name, cats: [cat], lat: 50, lon: 15 + km / 100, km, detourM: 200, side: "P", tags: {} };
}
const pois: Poi[] = [];
for (let k = 30; k < 600; k += 30) pois.push(poi("Jedzenie " + k, k, "eat"));
for (let k = 50; k < 600; k += 50) pois.push(poi("Nocleg " + k, k, "sleep"));

const cfg: TripConfig = { mode: "rec", speedKmh: 20, dailyKm: 140, sleepHours: 8, lunchHour: 13, startISO: "2026-07-01T07:00" };

describe("MODES", () => {
  it("ma 3 tryby z presetami", () => {
    expect(MODES.map((m) => m.key)).toEqual(["max", "strong", "rec"]);
    expect(MODES[0].dailyKm).toBeGreaterThan(MODES[2].dailyKm);
  });
});

describe("planTrip", () => {
  const days = planTrip(ds, pois, 600, cfg, new Set(), {});
  it("dzieli trasę na dni wg dailyKm", () => {
    expect(days.length).toBe(Math.ceil(600 / 140)); // 5
    expect(days[0].fromKm).toBe(0);
    expect(days[days.length - 1].isLast).toBe(true);
  });
  it("dobiera nocleg na koniec dnia (poza ostatnim) i godziny rosną", () => {
    expect(days[0].sleep).not.toBeNull();
    expect(days[days.length - 1].sleep).toBeNull();
    for (let i = 1; i < days.length; i++) expect(days[i].endMs).toBeGreaterThan(days[i - 1].endMs);
  });
  it("proponuje obiad ~lunchHour pierwszego dnia", () => {
    // start 07:00, 20 km/h, 13:00 => ~120 km
    expect(days[0].lunch).not.toBeNull();
    expect(days[0].lunch!.km).toBeGreaterThan(90);
    expect(days[0].lunch!.km).toBeLessThan(150);
  });
  it("override wymusza konkretny nocleg", () => {
    const forced = pois.find((p) => p.cats[0] === "sleep" && p.km === 100)!;
    const id = forced.lat.toFixed(5) + "," + forced.lon.toFixed(5);
    const d2 = planTrip(ds, pois, 600, cfg, new Set(), { 0: { sleep: id } });
    expect(d2[0].sleep!.km).toBe(100);
  });
});

describe("candidates", () => {
  it("zwraca najbliższe miejsca danej kategorii", () => {
    const c = candidates(pois, ["sleep"], 140, 30);
    expect(c.length).toBeGreaterThan(0);
    expect(Math.abs(c[0].km - 140)).toBeLessThanOrEqual(30);
  });
});
