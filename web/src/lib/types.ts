// Domenowe typy aplikacji (współdzielone przez logikę, UI i sync).

export type CatKey = "food" | "sleep" | "fuel" | "eat" | "water" | "bike" | "pharmacy" | "spot";
export type Side = "L" | "P" | "";

export interface RoutePoint {
  lat: number;
  lon: number;
  ele?: number;
}

export interface Route {
  pts: RoutePoint[];
  cum: number[]; // skumulowany dystans [m]
  totalM: number;
  isLoop: boolean;
}

export interface DownRoute {
  lat: number[];
  lon: number[];
  cum: number[]; // [m]
  ele: (number | undefined)[];
}

export interface Poi {
  name: string;
  cats: CatKey[];
  lat: number;
  lon: number;
  km: number; // pozycja wzdłuż trasy
  detourM: number; // odległość od trasy [m]
  side: Side;
  tags: Record<string, string>;
}

export interface FoodGap {
  fromKm: number;
  toKm: number;
  gapKm: number;
}

/** Kompaktowa paczka offline — to ląduje w localStorage/IndexedDB i w Supabase. */
export interface Bundle {
  name: string;
  total_km: number;
  is_loop: boolean;
  route: number[][]; // [lat, lon, cum_km, ele?]
  pois: BundlePoi[];
  food_gaps?: { from_km: number; to_km: number; gap_km: number }[];
  updated_at?: string;
}

export interface BundlePoi {
  name: string;
  cats: CatKey[];
  lat: number;
  lon: number;
  route_km: number;
  detour_m: number;
  side: string;
  tags: Record<string, string>;
}
