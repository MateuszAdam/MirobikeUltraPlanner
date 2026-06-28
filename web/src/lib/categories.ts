import type { CatKey } from "./types";

export interface CatDef {
  label: string;
  cssVar: string;
  match: (t: Record<string, string>) => boolean;
}

const FOOD_SHOPS = [
  "supermarket", "convenience", "grocery", "greengrocer", "bakery", "general",
  "deli", "butcher", "farm", "kiosk", "health_food", "pastry", "confectionery",
  "beverages", "dairy", "frozen_food", "seafood", "cheese", "food", "department_store",
];
const SLEEP_TOURISM = [
  "hotel", "guest_house", "hostel", "motel", "apartment", "chalet",
  "camp_site", "caravan_site", "alpine_hut", "wilderness_hut",
];
const EAT_AMENITY = [
  "restaurant", "cafe", "fast_food", "bar", "pub", "food_court", "ice_cream", "biergarten", "canteen",
];

export const CATS: Record<CatKey, CatDef> = {
  food: {
    label: "Spożywcze",
    cssVar: "--food",
    match: (t) => FOOD_SHOPS.includes(t.shop) || t.amenity === "marketplace",
  },
  sleep: {
    label: "Nocleg",
    cssVar: "--sleep",
    match: (t) => SLEEP_TOURISM.includes(t.tourism) || t.building === "hotel",
  },
  fuel: { label: "Paliwo", cssVar: "--fuel", match: (t) => t.amenity === "fuel" },
  eat: { label: "Jedzenie", cssVar: "--eat", match: (t) => EAT_AMENITY.includes(t.amenity) },
  spot: { label: "Własne", cssVar: "--spot", match: () => false },
};

export const ORDER: CatKey[] = ["food", "fuel", "eat", "sleep"];

/** Zgaduje kategorię importowanego punktu z nazwy/opisu. */
export function inferCat(s: string): CatKey {
  s = (s || "").toLowerCase();
  if (/hotel|nocleg|pensjonat|hostel|motel|guest|apartament|kwatera|schronisko|camping|kemping|agrotur|willa|chata|dom\s+gości/.test(s)) return "sleep";
  if (/stacja|paliw|orlen|\bbp\b|shell|lotos|circle\s*k|amic|moya|fuel|lpg|tankow|benzyn/.test(s)) return "fuel";
  if (/restaur|\bbar\b|\bpub\b|kawiar|caf[eé]|pizz|bistro|jadł|kebab|burger|lodziar|piwiar|food|gospoda|karczma/.test(s)) return "eat";
  if (/sklep|market|żabka|biedronka|lidl|kaufland|delikates|spożyw|piekar|grocer|\bshop\b|carrefour|dino|lewiatan|stokrotka|netto|aldi|auchan/.test(s)) return "food";
  return "spot";
}

export function normCat(s: string): CatKey | "" {
  s = (s || "").toLowerCase().trim();
  if (["food", "sleep", "fuel", "eat", "spot"].includes(s)) return s as CatKey;
  if (/nocleg|hotel|sleep/.test(s)) return "sleep";
  if (/paliw|fuel|stacja/.test(s)) return "fuel";
  if (/jedz|eat|restaur/.test(s)) return "eat";
  if (/sklep|spożyw|food|market/.test(s)) return "food";
  return "";
}

/** Filtry Overpass per kategoria (do zapytania nwr). */
export function overpassFilters(): { tag: string; values: string }[] {
  return [
    { tag: "shop", values: FOOD_SHOPS.join("|") },
    { tag: "tourism", values: SLEEP_TOURISM.join("|") },
    { tag: "amenity", values: EAT_AMENITY.join("|") },
  ];
}
