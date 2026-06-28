import { describe, it, expect } from "vitest";
import { CATS } from "./categories";

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
