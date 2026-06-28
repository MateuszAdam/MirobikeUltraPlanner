import { describe, it, expect } from "vitest";
import { CATS, inferCat, normCat } from "./categories";

describe("CATS.match", () => {
  it("matches OSM tags per category", () => {
    expect(CATS.food.match({ shop: "supermarket" })).toBe(true);
    expect(CATS.food.match({ amenity: "marketplace" })).toBe(true);
    expect(CATS.sleep.match({ tourism: "hotel" })).toBe(true);
    expect(CATS.sleep.match({ building: "hotel" })).toBe(true);
    expect(CATS.fuel.match({ amenity: "fuel" })).toBe(true);
    expect(CATS.eat.match({ amenity: "restaurant" })).toBe(true);
    expect(CATS.water.match({ amenity: "drinking_water" })).toBe(true);
    expect(CATS.water.match({ natural: "spring" })).toBe(true);
    expect(CATS.bike.match({ shop: "bicycle" })).toBe(true);
    expect(CATS.pharmacy.match({ amenity: "pharmacy" })).toBe(true);
    expect(CATS.spot.match({ shop: "supermarket" })).toBe(false);
    expect(CATS.food.match({ amenity: "restaurant" })).toBe(false);
  });
});

describe("inferCat", () => {
  it("guesses category from text", () => {
    expect(inferCat("Hotel Bukowy Dwór")).toBe("sleep");
    expect(inferCat("Żabka Centrum")).toBe("food");
    expect(inferCat("Stacja Orlen")).toBe("fuel");
    expect(inferCat("Pizzeria Roma")).toBe("eat");
    expect(inferCat("Punkt widokowy")).toBe("spot");
  });
});

describe("normCat", () => {
  it("normalizes free-text category", () => {
    expect(normCat("food")).toBe("food");
    expect(normCat("nocleg")).toBe("sleep");
    expect(normCat("paliwo")).toBe("fuel");
    expect(normCat("")).toBe("");
    expect(normCat("cokolwiek")).toBe("");
  });
});
