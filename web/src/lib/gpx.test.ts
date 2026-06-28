import { describe, it, expect } from "vitest";
import { parseGPX } from "./gpx";

const GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="50.0" lon="15.0"><ele>200</ele></trkpt>
  <trkpt lat="50.0" lon="15.01"><ele>210</ele></trkpt>
  <trkpt lat="50.0" lon="15.02"><ele>205</ele></trkpt>
</trkseg></trk></gpx>`;

const LOOP = `<gpx><trkseg>
  <trkpt lat="50.0" lon="15.0"></trkpt>
  <trkpt lat="50.001" lon="15.001"></trkpt>
  <trkpt lat="50.0" lon="15.0"></trkpt>
</trkseg></gpx>`;

describe("parseGPX", () => {
  it("parses points with elevation", () => {
    const r = parseGPX(GPX);
    expect(r.pts.length).toBe(3);
    expect(r.pts[0].ele).toBe(200);
    expect(r.pts[1].ele).toBe(210);
    expect(r.totalM).toBeGreaterThan(1400);
    expect(r.totalM).toBeLessThan(1460);
    expect(r.isLoop).toBe(false);
  });
  it("detects a loop (start≈end)", () => {
    expect(parseGPX(LOOP).isLoop).toBe(true);
  });
  it("throws on too few points", () => {
    expect(() => parseGPX('<gpx><trkpt lat="50" lon="15"/></gpx>')).toThrow();
  });
});
