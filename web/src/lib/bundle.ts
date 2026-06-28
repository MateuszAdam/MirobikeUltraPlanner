import { downsample, project } from "./geo";
import type { Bundle, BundlePoi, FoodGap, Poi, Route, DownRoute } from "./types";

const KEEP_TAGS = [
  "opening_hours", "phone", "website", "email", "stars", "cuisine", "brand",
  "wheelchair", "internet_access", "contact:phone", "contact:website", "contact:email",
  "addr:street", "addr:housenumber", "addr:postcode", "addr:city", "description", "_custom",
];

/** Zostawia tylko przydatne tagi — paczka ma być lekka (offline na telefonie). */
export function tagSubset(t: Record<string, string> | undefined): Record<string, string> {
  t = t || {};
  const o: Record<string, string> = {};
  for (const k of KEEP_TAGS) if (t[k]) o[k] = t[k];
  return o;
}

/** Buduje kompaktową paczkę offline z trasy + POI. */
export function buildBundle(name: string, route: Route, pois: Poi[], gaps: FoodGap[]): Bundle {
  const ds = downsample(route, 100);
  return {
    name,
    total_km: +(route.totalM / 1000).toFixed(3),
    is_loop: route.isLoop,
    route: ds.lat.map((la, i) => {
      const e: number[] = [+la.toFixed(6), +ds.lon[i].toFixed(6), +(ds.cum[i] / 1000).toFixed(3)];
      const el = ds.ele[i];
      if (el != null) e.push(+el.toFixed(1));
      return e;
    }),
    pois: pois.map<BundlePoi>((p) => ({
      name: p.name, cats: p.cats, lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6),
      route_km: +p.km.toFixed(3), detour_m: p.detourM, side: p.side, tags: tagSubset(p.tags),
    })),
    food_gaps: gaps.map((g) => ({ from_km: +g.fromKm.toFixed(2), to_km: +g.toKm.toFixed(2), gap_km: +g.gapKm.toFixed(2) })),
  };
}

export function routeFromBundle(b: Bundle): Route {
  return {
    pts: b.route.map((a) => ({ lat: a[0], lon: a[1], ele: a[3] })),
    cum: b.route.map((a) => a[2] * 1000),
    totalM: b.total_km * 1000,
    isLoop: b.is_loop,
  };
}

export function poisFromBundle(b: Bundle): Poi[] {
  return b.pois.map((p) => ({
    name: p.name, cats: p.cats, lat: p.lat, lon: p.lon,
    km: p.route_km, detourM: p.detour_m, side: (p.side as Poi["side"]) || "", tags: p.tags || {},
  }));
}

export function downsampledFromBundle(b: Bundle): DownRoute {
  return downsample(routeFromBundle(b), 150);
}

export function computeGaps(pois: Poi[]): FoodGap[] {
  const food = pois.filter((p) => p.cats.includes("food")).sort((a, b) => a.km - b.km);
  const gaps: FoodGap[] = [];
  for (let i = 0; i < food.length - 1; i++) {
    const g = food[i + 1].km - food[i].km;
    if (g >= 20) gaps.push({ fromKm: food[i].km, toKm: food[i + 1].km, gapKm: g });
  }
  return gaps;
}

/** Rzutuje importowane miejsca na trasę i zwraca jako POI (dedup po pid). */
export { project, downsample };
