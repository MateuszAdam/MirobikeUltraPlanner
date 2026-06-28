import { inferCat } from "./categories";
import { project } from "./geo";
import type { CatKey, DownRoute, Poi } from "./types";

export interface RawPoi {
  name: string;
  cats: CatKey[];
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

// Mapowanie kategorii Overture → nasze CatKey. Reguły po tokenie (exact + fragmenty).
// Overture NIE dostarcza realnie water/bike — te bierzemy z OSM (overpass), więc tu ich nie ma.
const RULES: [RegExp, CatKey][] = [
  [/^(supermarket|convenience_store|grocery_store|bakery|butcher|farmers_market|health_food_store|deli)$|^food/, "food"],
  [/^(hotel|motel|hostel|bed_and_breakfast|guest_house|campground|lodging)$/, "sleep"],
  [/^(gas_station|fuel|petrol)$/, "fuel"],
  [/^(restaurant|cafe|coffee_shop|bar|pub)$|^fast_food|^ice_cream/, "eat"],
  [/^(pharmacy|drugstore)$/, "pharmacy"],
];

function catForToken(tok: string): CatKey | null {
  tok = (tok || "").toLowerCase().trim();
  if (!tok) return null;
  for (const [re, c] of RULES) if (re.test(tok)) return c;
  return null;
}

/** Overture kategoria → CatKey. Sprawdza primary, potem alternate, na końcu inferCat(name).
 *  Może zwrócić "spot" (gdy nic nie pasuje) — wtedy caller pomija punkt. */
export function mapOvertureCategory(primary: string, alternate: string[] | undefined, name: string): CatKey {
  let c = catForToken(primary);
  if (!c && alternate) for (const a of alternate) { c = catForToken(a); if (c) break; }
  if (!c) c = inferCat(name); // sleep/fuel/eat/food albo "spot"
  return c;
}

/** Overture properties → tagi zgodne z KEEP_TAGS (bundle.tagSubset i tak odfiltruje resztę). */
export function normalizeOvertureTags(props: any): Record<string, string> {
  const t: Record<string, string> = {};
  const phone = props?.phones?.[0];
  const website = props?.websites?.[0];
  const email = props?.emails?.[0];
  const brand = props?.brand?.names?.primary;
  if (phone) t.phone = String(phone);
  if (website) t.website = String(website);
  if (email) t.email = String(email);
  if (brand) t.brand = String(brand);
  const a = props?.addresses?.[0];
  if (a) {
    if (a.freeform) t["addr:street"] = String(a.freeform);
    if (a.locality) t["addr:city"] = String(a.locality);
    if (a.postcode) t["addr:postcode"] = String(a.postcode);
  }
  return t;
}

function propName(p: any): string {
  return p?.names?.primary ?? p?.["names.primary"] ?? p?.name ?? "";
}
function propPrimary(p: any): string {
  return p?.categories?.primary ?? p?.cat_primary ?? "";
}
function propAlternate(p: any): string[] {
  return p?.categories?.alternate ?? p?.cat_alt ?? [];
}

/** GeoJSON FeatureCollection (z `overturemaps` lub DuckDB) → RawPoi[].
 *  Punkty bez pasującej kategorii (cat === "spot") są pomijane. Filtruje po confidence. */
export function parseOvertureGeoJSON(fc: any, minConfidence = 0): RawPoi[] {
  const out: RawPoi[] = [];
  for (const f of fc?.features ?? []) {
    const g = f?.geometry;
    if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) continue;
    const [lon, lat] = g.coordinates;
    if (!isFinite(lon) || !isFinite(lat)) continue;
    const p = f.properties ?? {};
    if (p.confidence != null && p.confidence < minConfidence) continue;
    const name = propName(p);
    const cat = mapOvertureCategory(propPrimary(p), propAlternate(p), name);
    if (cat === "spot") continue; // nie chcemy śmieci spoza kategorii
    out.push({ name: name || cat, cats: [cat], lat, lon, tags: normalizeOvertureTags(p) });
  }
  return out;
}

/** Cut korytarza: zostają tylko punkty w promieniu od linii trasy (noclegi szerzej).
 *  Pętle: punkty ze środka pętli są daleko od linii → odrzucone. */
export function cutCorridor(ds: DownRoute, raw: RawPoi[], radius: number, radiusSleep: number): Poi[] {
  const out: Poi[] = [];
  for (const r of raw) {
    const pr = project(ds, r.lat, r.lon);
    const lim = r.cats.includes("sleep") ? radiusSleep : radius;
    if (pr.detourM > lim) continue;
    out.push({ name: r.name, cats: r.cats, lat: r.lat, lon: r.lon, km: pr.km, detourM: pr.detourM, side: pr.side, tags: r.tags });
  }
  return out;
}
