import { CATS, ORDER } from "./categories";
import { downsample, project } from "./geo";
import type { CatKey, Poi, Route, DownRoute } from "./types";

const OVERPASS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const FILTERS: Record<CatKey, { q: string } | null> = {
  food: { q: 'nwr["shop"~"^(supermarket|convenience|grocery|greengrocer|bakery|general|deli|butcher|farm|kiosk|health_food|pastry|confectionery|beverages|dairy|frozen_food|seafood|cheese|food|department_store)$"]' },
  sleep: { q: 'nwr["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet|camp_site|caravan_site|alpine_hut|wilderness_hut)$"]' },
  fuel: { q: 'nwr["amenity"="fuel"]' },
  eat: { q: 'nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|biergarten|canteen)$"]' },
  spot: null,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(q: string, attempts = 4): Promise<any> {
  let last = "";
  for (let a = 0; a < attempts; a++) {
    const url = OVERPASS[a % OVERPASS.length];
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 95000);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        body: "data=" + encodeURIComponent(q),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      clearTimeout(to);
      if (res.ok) return await res.json();
      last = "HTTP " + res.status;
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    } catch (e: any) {
      clearTimeout(to);
      last = e?.name === "AbortError" ? "timeout" : String(e?.message || e);
    }
    await sleep(1500 * (a + 1) + Math.random() * 800);
  }
  throw new Error(last || "brak odpowiedzi");
}

export interface FetchOptions {
  cats: Set<CatKey>;
  radiusOther: number; // [m] dla sklepów/jedzenia/paliwa
  radiusSleep?: number; // [m] dla noclegów (domyślnie max(radiusOther, 5000))
  onProgress?: (done: number, total: number, found: number) => void;
}

/**
 * Pobiera POI wzdłuż trasy (batchami) i rzutuje je na trasę.
 * Uwaga: ciężka operacja — docelowo robiona na desktopie, wynik (bundle) idzie
 * lekki na telefon. Zwraca posortowaną listę POI.
 */
export async function fetchPois(route: Route, opts: FetchOptions): Promise<Poi[]> {
  const rOther = opts.radiusOther;
  const rSleep = opts.radiusSleep ?? Math.max(rOther, 5000);
  const active = [...opts.cats].filter((c) => FILTERS[c]);
  const filters = active.map((c) => ({ q: FILTERS[c]!.q, r: c === "sleep" ? rSleep : rOther }));
  // dodatkowe statementy dla food (marketplace) i sleep (building=hotel)
  if (opts.cats.has("food")) filters.push({ q: 'nwr["amenity"="marketplace"]', r: rOther });
  if (opts.cats.has("sleep")) filters.push({ q: 'nwr["building"="hotel"]', r: rSleep });

  const q = downsample(route, 1500);
  const coords: string[] = [];
  for (let i = 0; i < q.lat.length; i++) coords.push(q.lat[i] + "," + q.lon[i]);
  const batches: string[][] = [];
  for (let i = 0; i < coords.length; i += 25) batches.push(coords.slice(i, i + 25));

  const seen = new Map<string, { name: string; cats: CatKey[]; lat: number; lon: number; tags: Record<string, string> }>();
  for (let bi = 0; bi < batches.length; bi++) {
    opts.onProgress?.(bi, batches.length, seen.size);
    const chain = batches[bi].join(",");
    const body = filters.map((f) => `  ${f.q}(around:${f.r},${chain});`).join("\n");
    const query = `[out:json][timeout:90];\n(\n${body}\n);\nout center tags;`;
    try {
      const data = await overpass(query);
      for (const el of data.elements || []) {
        const k = el.type + el.id;
        if (seen.has(k)) continue;
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        const t: Record<string, string> = el.tags || {};
        const cs: CatKey[] = [];
        for (const ck of Object.keys(CATS) as CatKey[]) if (CATS[ck].match(t)) cs.push(ck);
        if (!cs.length) continue;
        seen.set(k, { name: t.name || CATS[cs[0]].label, cats: cs, lat, lon, tags: t });
      }
    } catch {
      // pojedyncza paczka padła — kontynuujemy resztę
    }
    await sleep(350 + Math.random() * 400);
  }
  opts.onProgress?.(batches.length, batches.length, seen.size);

  const ds: DownRoute = downsample(route, 150);
  const pois: Poi[] = [];
  for (const p of seen.values()) {
    const pr = project(ds, p.lat, p.lon);
    pois.push({ ...p, km: pr.km, detourM: pr.detourM, side: pr.side });
  }
  pois.sort((a, b) => a.km - b.km);
  return pois;
}

export { ORDER };
