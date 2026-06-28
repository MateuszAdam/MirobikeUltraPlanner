import { describe, it, expect } from "vitest";
import { hav, pid, downsample, project, aheadDelta } from "./geo";
import type { Route } from "./types";

function straightRoute(): Route {
  const pts = [];
  for (let i = 0; i <= 100; i++) pts.push({ lat: 50, lon: 15 + i * 0.001 });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  return { pts, cum, totalM: cum[cum.length - 1], isLoop: false };
}

describe("hav", () => {
  it("~111 km per degree of longitude at equator", () => {
    expect(hav(0, 0, 0, 1)).toBeGreaterThan(111000);
    expect(hav(0, 0, 0, 1)).toBeLessThan(111400);
  });
  it("zero for identical points", () => {
    expect(hav(50, 15, 50, 15)).toBe(0);
  });
});

describe("pid", () => {
  it("rounds coords to 5 decimals", () => {
    expect(pid({ lat: 50.123456, lon: 15.654321 })).toBe("50.12346,15.65432");
  });
});

describe("downsample", () => {
  it("keeps endpoints and total distance", () => {
    const r = straightRoute();
    const d = downsample(r, 150);
    expect(d.lat[0]).toBe(50);
    expect(d.lon[0]).toBe(15);
    expect(d.cum[0]).toBe(0);
    expect(d.cum[d.cum.length - 1]).toBeCloseTo(r.totalM, 5);
    expect(d.lat.length).toBeLessThan(r.pts.length); // faktycznie próbkuje
  });
});

describe("project", () => {
  it("finds km along route and lateral detour", () => {
    const r = straightRoute();
    const d = downsample(r, 150);
    const pr = project(d, 50.0005, 15.05); // ~55 m na północ od środka
    expect(pr.km).toBeGreaterThan(0);
    expect(pr.km).toBeLessThan(r.totalM / 1000);
    expect(pr.detourM).toBeGreaterThan(40);
    expect(pr.detourM).toBeLessThan(70);
    expect(["L", "P"]).toContain(pr.side);
  });
});

describe("project window (anti-teleport)", () => {
  // out-and-back: noga w tę stronę (lat 50.000) i powrotna tuż obok (lat 50.001)
  function outAndBack(): Route {
    const pts = [];
    for (let i = 0; i <= 100; i++) pts.push({ lat: 50.0, lon: 15 + i * 0.001 }); // 0–~7 km
    for (let i = 0; i <= 100; i++) pts.push({ lat: 50.001, lon: 15.1 - i * 0.001 }); // ~7–14 km
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
    return { pts, cum, totalM: cum[cum.length - 1], isLoop: false };
  }
  const ds = downsample(outAndBack(), 100);
  const total = ds.cum[ds.cum.length - 1] / 1000;
  it("keeps you on the outbound leg with a window near low km", () => {
    const pr = project(ds, 50.0005, 15.05, { km: 3.5, winKm: 2 });
    expect(pr.km).toBeGreaterThan(1.5);
    expect(pr.km).toBeLessThan(5.5);
  });
  it("keeps you on the return leg with a window near high km", () => {
    const pr = project(ds, 50.0005, 15.05, { km: total - 3.5, winKm: 2 });
    expect(pr.km).toBeGreaterThan(total - 5.5);
  });
  it("falls back to global when window has no segment", () => {
    const pr = project(ds, 50.0005, 15.05, { km: 999, winKm: 2 });
    expect(pr.detourM).toBeLessThan(200); // znalazł realny punkt mimo pustego okna
  });
});

describe("aheadDelta", () => {
  it("returns positive delta ahead", () => {
    expect(aheadDelta(10, 5, false, 100)).toBe(5);
  });
  it("wraps on loops", () => {
    expect(aheadDelta(2, 98, true, 100)).toBeCloseTo(4, 5);
  });
  it("no wrap when not a loop", () => {
    expect(aheadDelta(2, 98, false, 100)).toBe(-96);
  });
});
