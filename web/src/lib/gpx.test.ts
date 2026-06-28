// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseGPX } from "./gpx";

const GPX = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
  <trkpt lat="50.0" lon="15.0"><ele>200</ele></trkpt>
  <trkpt lat="50.0" lon="15.01"><ele>210</ele></trkpt>
  <trkpt lat="50.0" lon="15.02"><ele>205</ele></trkpt>
</trkseg></trk></gpx>`;

const LON_FIRST = `<gpx><trk><trkseg>
  <trkpt lon="15.0" lat="50.0"></trkpt>
  <trkpt lon="15.01" lat="50.0"></trkpt>
</trkseg></trk></gpx>`;

const RTEPT = `<gpx><rte>
  <rtept lat="50.0" lon="15.0"/>
  <rtept lat="50.0" lon="15.05"/>
</rte></gpx>`;

const LOOP = `<gpx><trkseg>
  <trkpt lat="50.0" lon="15.0"></trkpt>
  <trkpt lat="50.001" lon="15.001"></trkpt>
  <trkpt lat="50.0" lon="15.0"></trkpt>
</trkseg></gpx>`;

describe("parseGPX", () => {
  it("parses trkpt with elevation", () => {
    const r = parseGPX(GPX);
    expect(r.pts.length).toBe(3);
    expect(r.pts[0].ele).toBe(200);
    expect(r.pts[1].ele).toBe(210);
    expect(r.totalM).toBeGreaterThan(1400);
    expect(r.totalM).toBeLessThan(1460);
    expect(r.isLoop).toBe(false);
  });
  it("handles lon-before-lat attribute order", () => {
    const r = parseGPX(LON_FIRST);
    expect(r.pts.length).toBe(2);
    expect(r.pts[0].lat).toBe(50);
    expect(r.pts[0].lon).toBe(15);
  });
  it("falls back to rtept when no trkpt", () => {
    expect(parseGPX(RTEPT).pts.length).toBe(2);
  });
  it("detects a loop (start≈end)", () => {
    expect(parseGPX(LOOP).isLoop).toBe(true);
  });
  it("throws on too few points", () => {
    expect(() => parseGPX('<gpx><trkpt lat="50" lon="15"/></gpx>')).toThrow();
  });
});
