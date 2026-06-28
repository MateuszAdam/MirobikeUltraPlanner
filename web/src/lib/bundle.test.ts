import { describe, it, expect } from "vitest";
import { buildBundle, routeFromBundle, poisFromBundle, computeGaps } from "./bundle";
import { parseGPX } from "./gpx";
import type { Poi } from "./types";

const GPX = `<gpx><trkseg>
  <trkpt lat="50.0" lon="15.0"><ele>200</ele></trkpt>
  <trkpt lat="50.0" lon="15.05"><ele>260</ele></trkpt>
  <trkpt lat="50.0" lon="15.1"><ele>210</ele></trkpt>
</trkseg></gpx>`;

const pois: Poi[] = [
  { name: "Sklep A", cats: ["food"], lat: 50.0, lon: 15.0, km: 0, detourM: 30, side: "P", tags: { opening_hours: "8-20", _custom: "1" } },
  { name: "Sklep B", cats: ["food"], lat: 50.0, lon: 15.1, km: 25, detourM: 50, side: "L", tags: {} },
  { name: "Hotelik", cats: ["sleep"], lat: 50.0, lon: 15.05, km: 12, detourM: 800, side: "L", tags: {} },
];

describe("buildBundle + round-trip", () => {
  it("preserves route, elevation and pois", () => {
    const route = parseGPX(GPX);
    const b = buildBundle("Test", route, pois, computeGaps(pois));
    expect(b.name).toBe("Test");
    expect(b.pois.length).toBe(3);
    // wysokość zachowana w 4. polu route
    expect(b.route[0].length).toBe(4);

    const r2 = routeFromBundle(b);
    expect(r2.pts[0].ele).toBe(200);
    expect(r2.totalM).toBeCloseTo(route.totalM, 0);

    const p2 = poisFromBundle(b);
    expect(p2[0].name).toBe("Sklep A");
    expect(p2[0].tags.opening_hours).toBe("8-20");
    expect(p2[0].tags._custom).toBe("1");
  });

  it("tagSubset drops unknown tags", () => {
    const route = parseGPX(GPX);
    const withJunk: Poi[] = [{ ...pois[0], tags: { opening_hours: "8-20", junk: "x" } }];
    const b = buildBundle("T", route, withJunk, []);
    expect(b.pois[0].tags.opening_hours).toBe("8-20");
    expect(b.pois[0].tags.junk).toBeUndefined();
  });
});

describe("computeGaps", () => {
  it("flags food gaps >= 20 km", () => {
    const gaps = computeGaps(pois);
    expect(gaps.length).toBe(1);
    expect(gaps[0].gapKm).toBeCloseTo(25, 5);
  });
});
