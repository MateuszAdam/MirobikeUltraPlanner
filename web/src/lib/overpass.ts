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
  water: { q: 'nwr["amenity"~"^(drinking_water|water_point)$"]' },
  bike: { q: 'nwr["shop"="bicycle"]' },
  pharmacy: { q: 'nwr["amenity"="pharmacy"]' },
  spot: null,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(q: string, attempts = 4, ext?: AbortSignal): Promise<any> {
  let last = "";
  for (let a = 0; a < attempts; a++) {
    if (ext?.aborted) throw new Error("anulowano");
    const url = OVERPASS[a % OVERPASS.length];
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    ext?.addEventListener("abort", onAbort, { once: true });
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
      if (ext?.aborted) throw new Error("anulowano");
      last = e?.name === "AbortError" ? "timeout" : String(e?.message || e);
    } finally {
      ext?.removeEventListener("abort", onAbort);
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
  signal?: AbortSignal; // przerwanie (przycisk „Pomiń")
}

interface RawPoi { name: string; cats: CatKey[]; lat: number; lon: number; tags: Record<string, string>; }

/** Stan pobierania — pozwala wznowić i dociągnąć tylko nieudane paczki. */
export interface FetchSession {
  batches: string[][];
  done: Set<number>;
  seen: Map<string, RawPoi>;
  filters: { q: string; r: number }[];
}

export interface FetchResult {
  pois: Poi[];
  failed: number; // ile paczek się nie pobrało (do „dobierz brakujące")
  session: FetchSession;
}

function buildSession(route: Route, opts: FetchOptions): FetchSession {
  const rOther = opts.radiusOther;
  const rSleep = opts.radiusSleep ?? Math.max(rOther, 5000);
  const active = [...opts.cats].filter((c) => FILTERS[c]);
  const filters = active.map((c) => ({ q: FILTERS[c]!.q, r: c === "sleep" ? rSleep : rOther }));
  if (opts.cats.has("food")) filters.push({ q: 'nwr["amenity"="marketplace"]', r: rOther });
  if (opts.cats.has("sleep")) filters.push({ q: 'nwr["building"="hotel"]', r: rSleep });
  if (opts.cats.has("water")) {
    filters.push({ q: 'nwr["man_made"~"^(water_tap|water_well)$"]', r: rOther });
    filters.push({ q: 'nwr["natural"="spring"]["drinking_water"!="no"]', r: rOther });
  }
  if (opts.cats.has("bike")) filters.push({ q: 'nwr["amenity"="bicycle_repair_station"]', r: rOther });

  const q = downsample(route, 1500);
  const coords: string[] = [];
  for (let i = 0; i < q.lat.length; i++) coords.push(q.lat[i] + "," + q.lon[i]);
  const batches: string[][] = [];
  for (let i = 0; i < coords.length; i += 25) batches.push(coords.slice(i, i + 25));
  return { batches, done: new Set(), seen: new Map(), filters };
}

/**
 * Pobiera POI wzdłuż trasy (batchami) i rzutuje je na trasę. Ciężka operacja —
 * docelowo na desktopie, wynik (bundle) idzie lekki na telefon.
 * Podaj `prev`, by dociągnąć tylko nieudane paczki (wznowienie).
 */
export async function fetchPois(route: Route, opts: FetchOptions, prev?: FetchSession): Promise<FetchResult> {
  const S = prev ?? buildSession(route, opts);
  const todo = S.batches.map((_, i) => i).filter((i) => !S.done.has(i));
  for (const bi of todo) {
    if (opts.signal?.aborted) break;
    opts.onProgress?.(S.done.size, S.batches.length, S.seen.size);
    const chain = S.batches[bi].join(",");
    const body = S.filters.map((f) => `  ${f.q}(around:${f.r},${chain});`).join("\n");
    const query = `[out:json][timeout:90];\n(\n${body}\n);\nout center tags;`;
    try {
      const data = await overpass(query, 4, opts.signal);
      for (const el of data.elements || []) {
        const k = el.type + el.id;
        if (S.seen.has(k)) continue;
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        const t: Record<string, string> = el.tags || {};
        const cs: CatKey[] = [];
        for (const ck of Object.keys(CATS) as CatKey[]) if (CATS[ck].match(t)) cs.push(ck);
        if (!cs.length) continue;
        S.seen.set(k, { name: t.name || CATS[cs[0]].label, cats: cs, lat, lon, tags: t });
      }
      S.done.add(bi);
    } catch {
      // paczka padła — zostaje nieoznaczona, do dociągnięcia
    }
    await sleep(350 + Math.random() * 400);
  }
  opts.onProgress?.(S.done.size, S.batches.length, S.seen.size);

  const ds: DownRoute = downsample(route, 150);
  const pois: Poi[] = [];
  for (const p of S.seen.values()) {
    const pr = project(ds, p.lat, p.lon);
    pois.push({ ...p, km: pr.km, detourM: pr.detourM, side: pr.side });
  }
  pois.sort((a, b) => a.km - b.km);
  return { pois, failed: S.batches.length - S.done.size, session: S };
}

export { ORDER };
