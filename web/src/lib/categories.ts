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
  water: {
    label: "Woda", cssVar: "--water",
    match: (t) => t.amenity === "drinking_water" || t.amenity === "water_point" || t.man_made === "water_tap" || t.man_made === "water_well" || t.natural === "spring",
  },
  bike: { label: "Rower", cssVar: "--bike", match: (t) => t.shop === "bicycle" || t.amenity === "bicycle_repair_station" },
  pharmacy: { label: "Apteka", cssVar: "--pharmacy", match: (t) => t.amenity === "pharmacy" },
  spot: { label: "Własne", cssVar: "--spot", match: () => false },
};

// Kolejność w wierszu „następne wg kategorii" (woda ważna w ultra).
export const ORDER: CatKey[] = ["food", "water", "fuel", "eat", "sleep"];
