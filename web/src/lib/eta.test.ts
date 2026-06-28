import { describe, it, expect } from "vitest";
import { buildTimeProfile, timeAtKm, etaAheadDelta, fmtDur, RIDE_KMH } from "./eta";
import type { DownRoute } from "./types";

const flat: DownRoute = { lat: [50, 50], lon: [15, 15.1], cum: [0, 20000], ele: [undefined, undefined] };
const hilly: DownRoute = { lat: [50, 50], lon: [15, 15.1], cum: [0, 20000], ele: [100, 700] }; // +600 m

describe("buildTimeProfile", () => {
  it("flat: time = distance / base speed, no ascent", () => {
    const { time, ascent } = buildTimeProfile(flat);
    expect(ascent).toBe(0);
    expect(time[1]).toBeCloseTo(20000 / ((RIDE_KMH * 1000) / 3600), 3); // 3600 s
  });
  it("ascent adds penalty (600 m => +1 h)", () => {
    const { time, ascent } = buildTimeProfile(hilly);
    expect(ascent).toBe(600);
    expect(time[1]).toBeCloseTo(3600 + 3600, 1); // płaski czas + 1h kary
  });
});

describe("timeAtKm", () => {
  it("interpolates linearly on flat", () => {
    const { time } = buildTimeProfile(flat);
    expect(timeAtKm(flat, time, 10)).toBeCloseTo(1800, 3);
  });
});

describe("etaAheadDelta", () => {
  it("computes time between current and ahead km", () => {
    const { time } = buildTimeProfile(flat);
    expect(etaAheadDelta(flat, time, 5, 5, 20)).toBeCloseTo(900, 3);
  });
  it("returns null for non-positive delta", () => {
    const { time } = buildTimeProfile(flat);
    expect(etaAheadDelta(flat, time, 0, 5, 20)).toBeNull();
  });
});

describe("fmtDur", () => {
  it("formats hours and minutes", () => {
    expect(fmtDur(3600)).toBe("1 h");
    expect(fmtDur(3660)).toBe("1 h 1 min");
    expect(fmtDur(90)).toBe("2 min");
    expect(fmtDur(null)).toBe("");
  });
});
