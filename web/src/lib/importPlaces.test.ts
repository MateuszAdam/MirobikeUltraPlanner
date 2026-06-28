import { describe, it, expect } from "vitest";
import { parseKML, parseWaypoints, parseCSV, parseImport } from "./importPlaces";

const KML = `<kml><Document>
<Placemark><name><![CDATA[Hotel Bukowy Dwór]]></name><description>nocleg ze śniadaniem</description><Point><coordinates>15.123,50.456,0</coordinates></Point></Placemark>
<Placemark><name>Żabka Centrum</name><Point><coordinates>15.2,50.5</coordinates></Point></Placemark>
</Document></kml>`;

const GPX = `<gpx>
<wpt lat="50.1" lon="15.1"><name>Stacja Orlen</name><desc>24h</desc></wpt>
<wpt lon="15.3" lat="50.3"><name>Pizzeria Roma</name></wpt>
</gpx>`;

const CSV = `nazwa;lat;lon;kategoria
Nocleg u Basi;50.7;15.9;nocleg
Punkt widokowy;50.8;15.95;`;

describe("parseKML", () => {
  it("parses placemarks with CDATA and infers category", () => {
    const r = parseKML(KML);
    expect(r.length).toBe(2);
    expect(r[0]).toMatchObject({ name: "Hotel Bukowy Dwór", lat: 50.456, lon: 15.123, cat: "sleep" });
    expect(r[1].cat).toBe("food");
  });
});

describe("parseWaypoints", () => {
  it("parses both lat/lon attribute orders", () => {
    const r = parseWaypoints(GPX);
    expect(r.length).toBe(2);
    expect(r[0]).toMatchObject({ name: "Stacja Orlen", lat: 50.1, lon: 15.1, cat: "fuel" });
    expect(r[1]).toMatchObject({ name: "Pizzeria Roma", lat: 50.3, lon: 15.3, cat: "eat" });
  });
});

describe("parseCSV", () => {
  it("uses header, explicit + inferred categories", () => {
    const r = parseCSV(CSV);
    expect(r.length).toBe(2);
    expect(r[0]).toMatchObject({ name: "Nocleg u Basi", lat: 50.7, lon: 15.9, cat: "sleep" });
    expect(r[1].cat).toBe("spot");
  });
});

describe("parseImport dispatcher", () => {
  it("routes by extension", () => {
    expect(parseImport(KML, "places.kml").length).toBe(2);
    expect(parseImport(GPX, "wpts.gpx").length).toBe(2);
    expect(parseImport(CSV, "list.csv").length).toBe(2);
  });
});
