import { describe, it, expect } from "vitest";
import { mapOvertureCategory, normalizeOvertureTags, parseOvertureGeoJSON, cutCorridor, type RawPoi } from "./overture";
import { downsample, hav } from "./geo";
import type { Route } from "./types";

describe("mapOvertureCategory", () => {
  it("maps known primary categories", () => {
    expect(mapOvertureCategory("supermarket", [], "")).toBe("food");
    expect(mapOvertureCategory("hotel", [], "")).toBe("sleep");
    expect(mapOvertureCategory("gas_station", [], "")).toBe("fuel");
    expect(mapOvertureCategory("restaurant", [], "")).toBe("eat");
    expect(mapOvertureCategory("fast_food_restaurant", [], "")).toBe("eat");
    expect(mapOvertureCategory("pharmacy", [], "")).toBe("pharmacy");
  });
  it("falls back to alternate then to inferCat(name)", () => {
    expect(mapOvertureCategory("xxx", ["coffee_shop"], "")).toBe("eat");
    expect(mapOvertureCategory("xxx", [], "Żabka Express")).toBe("food");
  });
  it("returns spot for unknown category + meaningless name", () => {
    expect(mapOvertureCategory("monument", [], "Pomnik")).toBe("spot");
  });
});

describe("normalizeOvertureTags", () => {
  it("extracts phone/website/email/brand/address", () => {
    const t = normalizeOvertureTags({
      phones: ["+48 600 100 200"], websites: ["https://x.pl"], emails: ["a@x.pl"],
      brand: { names: { primary: "Orlen" } },
      addresses: [{ freeform: "ul. Długa 1", locality: "Wrocław", postcode: "50-001" }],
    });
    expect(t.phone).toBe("+48 600 100 200");
    expect(t.website).toBe("https://x.pl");
    expect(t.email).toBe("a@x.pl");
    expect(t.brand).toBe("Orlen");
    expect(t["addr:street"]).toBe("ul. Długa 1");
    expect(t["addr:city"]).toBe("Wrocław");
    expect(t["addr:postcode"]).toBe("50-001");
  });
});

describe("parseOvertureGeoJSON", () => {
  const fc = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [15.0, 50.0] }, properties: { names: { primary: "Sklep" }, categories: { primary: "supermarket" }, confidence: 0.9, phones: ["111"] } },
      { type: "Feature", geometry: { type: "Point", coordinates: [15.1, 50.0] }, properties: { names: { primary: "Hotelik" }, categories: { primary: "hotel" }, confidence: 0.2 } }, // niska pewność
      { type: "Feature", geometry: { type: "Point", coordinates: [15.2, 50.0] }, properties: { names: { primary: "Pomnik" }, categories: { primary: "monument" }, confidence: 0.9 } }, // spot → pomiń
    ],
  };
  it("parses, filters confidence, skips non-categories", () => {
    const r = parseOvertureGeoJSON(fc, 0.5);
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ name: "Sklep", cats: ["food"] });
    expect(r[0].tags.phone).toBe("111");
  });
  it("supports flat (DuckDB) shape", () => {
    const flat = { type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [15, 50] }, properties: { name: "Stacja", cat_primary: "gas_station", confidence: 0.8 } },
    ] };
    expect(parseOvertureGeoJSON(flat, 0.5)[0].cats).toEqual(["fuel"]);
  });
});

function straightRoute(): Route {
  const pts = [];
  for (let i = 0; i <= 100; i++) pts.push({ lat: 50, lon: 15 + i * 0.001 });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  return { pts, cum, totalM: cum[cum.length - 1], isLoop: false };
}

describe("cutCorridor", () => {
  const ds = downsample(straightRoute(), 150);
  it("keeps a point ~300 m off the line, with km/side", () => {
    const raw: RawPoi[] = [{ name: "Blisko", cats: ["food"], lat: 50.0027, lon: 15.05, tags: {} }];
    const out = cutCorridor(ds, raw, 2000, 5000);
    expect(out.length).toBe(1);
    expect(out[0].detourM).toBeGreaterThan(200);
    expect(out[0].detourM).toBeLessThan(400);
    expect(out[0].km).toBeGreaterThan(0);
    expect(["L", "P"]).toContain(out[0].side);
  });
  it("rejects a point ~5 km off at radius 2000 (e.g. inside a loop)", () => {
    const raw: RawPoi[] = [{ name: "Daleko", cats: ["food"], lat: 50.045, lon: 15.05, tags: {} }];
    expect(cutCorridor(ds, raw, 2000, 5000).length).toBe(0);
  });
  it("keeps lodging within the wider sleep radius", () => {
    const raw: RawPoi[] = [{ name: "Hotel", cats: ["sleep"], lat: 50.035, lon: 15.05, tags: {} }];
    expect(cutCorridor(ds, raw, 2000, 5000).length).toBe(1);
  });
});
