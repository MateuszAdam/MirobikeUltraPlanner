import { describe, it, expect } from "vitest";
import { kmStep, kmMarkerFeatures, aheadList, nextShop, gapBeforeStretch, planRows, plPlural, crossedThreshold } from "./planner";
import type { DownRoute, FoodGap, Poi } from "./types";

const ds: DownRoute = { lat: [50, 50], lon: [15, 15.5], cum: [0, 50000], ele: [undefined, undefined] };
const time = [0, 9000]; // 50 km w 9000 s (20 km/h)

function poi(name: string, km: number, cats: Poi["cats"], fav = false): Poi {
  return { name, cats, lat: 50, lon: 15 + km / 100, km, detourM: 100, side: "P", tags: fav ? {} : {} };
}

describe("kmStep", () => {
  it("scales with route length", () => {
    expect(kmStep(40)).toBe(5);
    expect(kmStep(120)).toBe(10);
    expect(kmStep(300)).toBe(20);
    expect(kmStep(445)).toBe(25);
  });
});

describe("kmMarkerFeatures", () => {
  it("emits markers every step km, none past the end", () => {
    const feats = kmMarkerFeatures(ds, 50); // step 5
    expect(feats.length).toBe(9); // 5..45
    expect(feats[0].properties!.km).toBe(5);
  });
});

describe("aheadList", () => {
  const pois = [poi("A", 10, ["food"]), poi("B", 30, ["sleep"]), poi("C", 5, ["eat"])];
  it("returns places ahead within range, sorted", () => {
    const out = aheadList(pois, 8, false, 50, 100);
    expect(out.map((x) => x.p.name)).toEqual(["A", "B"]); // C jest za nami
    expect(out[0].delta).toBeCloseTo(2, 5);
  });
  it("respects range", () => {
    expect(aheadList(pois, 8, false, 50, 5).map((x) => x.p.name)).toEqual(["A"]);
  });
});

describe("nextShop", () => {
  it("finds nearest food ahead regardless of filters", () => {
    const pois = [poi("Sklep1", 5, ["food"]), poi("Sklep2", 40, ["food"])];
    expect(nextShop(pois, 10, false, 50)!.p.name).toBe("Sklep2");
  });
});

describe("gapBeforeStretch", () => {
  const gaps: FoodGap[] = [{ fromKm: 12, toKm: 45, gapKm: 33 }];
  it("warns when last shop before a long stretch is near", () => {
    expect(gapBeforeStretch(gaps, 8, 100)).toMatchObject({ gapKm: 33 });
  });
  it("no warning if stretch is far", () => {
    expect(gapBeforeStretch(gaps, 0, 100)).toBeNull();
  });
});

describe("planRows", () => {
  it("computes segment km and time between favorites", () => {
    const favs = [poi("F1", 10, ["sleep"]), poi("F2", 30, ["sleep"])];
    const rows = planRows(favs, ds, time, null, false, 50);
    expect(rows[0].segKm).toBe(10);
    expect(rows[1].segKm).toBe(20);
    expect(rows[1].segSec).toBeCloseTo(3600, 0); // 20 km @ 20 km/h
  });
});

describe("plPlural + crossedThreshold", () => {
  it("pluralizes", () => {
    expect(plPlural(1)).toBe("przystanek");
    expect(plPlural(3)).toBe("przystanki");
    expect(plPlural(7)).toBe("przystanków");
  });
  it("detects newly crossed threshold (tightest bucket)", () => {
    expect(crossedThreshold(4, new Set())).toBe(5); // 4 mieści się w progu 5
    expect(crossedThreshold(4, new Set([5]))).toBeNull(); // próg 5 już zgłoszony
    expect(crossedThreshold(1.5, new Set([5]))).toBe(2); // wszedł w próg 2
    expect(crossedThreshold(60, new Set())).toBeNull(); // poza największym progiem
  });
});
