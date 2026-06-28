/**
 * Prep CLI (desktop): GPX → Overture (biznesy w korytarzu trasy) + Overpass (woda/rower) → bundle.json.
 * Uruchom: npm run build:bundle -- --gpx <plik.gpx> --name "<nazwa>" [opcje]
 *
 * Cały ruch sieciowy żyje TU (desktop). Telefon dostaje gotową paczkę (zero zapytań w runtime).
 * Atrybucja danych: © OpenStreetMap contributors, Overture Maps Foundation.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";

// parseGPX używa DOMParser (przeglądarkowy) — w Node podstawiamy jsdom.
(globalThis as any).DOMParser = new JSDOM().window.DOMParser;

import { parseGPX } from "../src/lib/gpx";
import { downsample } from "../src/lib/geo";
import { parseOvertureGeoJSON, cutCorridor } from "../src/lib/overture";
import { fetchPois } from "../src/lib/overpass";
import { buildBundle, computeGaps } from "../src/lib/bundle";
import type { CatKey, Poi } from "../src/lib/types";

// ---- argumenty ----
function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { a[key] = next; i++; }
      else flags.add(key);
    }
  }
  return { a, flags };
}
const { a, flags } = parseArgs(process.argv.slice(2));
if (!a.gpx || !a.name) {
  console.error("Użycie: npm run build:bundle -- --gpx <plik.gpx> --name \"<nazwa>\" [--radius 2000] [--radius-sleep 5000] [--release 2026-05-21.0] [--confidence 0.5] [--out ./out/<slug>] [--from-geojson <plik>] [--also-data-js]");
  process.exit(1);
}
const radius = +(a.radius ?? 2000);
const radiusSleep = +(a["radius-sleep"] ?? 5000);
const confidence = +(a.confidence ?? 0.5);
const slug = a.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trasa";
const outDir = a.out ?? join("out", slug);

// ---- 1. trasa ----
const route = parseGPX(readFileSync(a.gpx, "utf8"));
const lons = route.pts.map((p) => p.lon), lats = route.pts.map((p) => p.lat);
const margin = radiusSleep / 111320;
const bbox = [Math.min(...lons) - margin, Math.min(...lats) - margin, Math.max(...lons) + margin, Math.max(...lats) + margin];
console.log(`Trasa: ${a.name} · ${(route.totalM / 1000).toFixed(1)} km${route.isLoop ? " (pętla)" : ""}`);
console.log(`bbox: ${bbox.map((n) => n.toFixed(4)).join(",")} (margines ${radiusSleep} m)`);

// ---- 2-3. pobranie Overture do GeoJSON ----
const tmp = mkdtempSync(join(tmpdir(), "mirobike-"));
const geojsonPath = a["from-geojson"] ?? join(tmp, "places.geojson");

function have(cmd: string): boolean {
  try { execFileSync(cmd, ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
}

if (!a["from-geojson"]) {
  if (have("overturemaps")) {
    const args = ["download", `--bbox=${bbox.join(",")}`, "-f", "geojson", "--type=place", "-o", geojsonPath];
    if (a.release) args.push("--release", a.release);
    console.log("Pobieram Overture (overturemaps CLI)…");
    execFileSync("overturemaps", args, { stdio: "inherit" });
  } else if (have("duckdb")) {
    if (!a.release) { console.error("DuckDB wymaga --release <YYYY-MM-DD.N> (sprawdź overturemaps.org/release)."); process.exit(1); }
    console.log("Pobieram Overture (DuckDB + S3 pushdown po bbox)…");
    const sql = `INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';
COPY (SELECT id, names.primary AS name, categories.primary AS cat_primary, categories.alternate AS cat_alt,
  confidence, websites, phones, emails, addresses, brand, ST_X(geometry) AS lon, ST_Y(geometry) AS lat
  FROM read_parquet('s3://overturemaps-us-west-2/release/${a.release}/theme=places/type=place/*', hive_partitioning=1)
  WHERE bbox.xmin <= ${bbox[2]} AND bbox.xmax >= ${bbox[0]} AND bbox.ymin <= ${bbox[3]} AND bbox.ymax >= ${bbox[1]}
    AND confidence >= ${confidence})
TO '${geojsonPath.replace(/\\/g, "/")}' (FORMAT GDAL, DRIVER 'GeoJSON');`;
    execFileSync("duckdb", ["-c", sql], { stdio: "inherit" });
  } else {
    console.error("Brak `overturemaps` (pip install overturemaps) ani `duckdb` w PATH.");
    console.error("Możesz też podać gotowy plik: --from-geojson <places.geojson>.");
    process.exit(1);
  }
}

// ---- 4-5. parse + cut korytarza (Overture: food/sleep/fuel/eat/pharmacy) ----
const fc = JSON.parse(readFileSync(geojsonPath, "utf8"));
const raw = parseOvertureGeoJSON(fc, confidence);
const ds = downsample(route, 150);
const overturePois = cutCorridor(ds, raw, radius, radiusSleep);
const rejected = raw.length - overturePois.length;
console.log(`Overture: ${raw.length} POI w bbox → ${overturePois.length} w korytarzu (odrzucono poza korytarzem: ${rejected}).`);

// ---- 6. woda/rower z OSM (Overpass) ----
console.log("Pobieram wodę i serwis rowerowy z OSM…");
const { pois: osmPois } = await fetchPois(route, {
  cats: new Set<CatKey>(["water", "bike"]),
  radiusOther: radius,
  onProgress: (done, total, found) => process.stdout.write(`\r  Overpass ${done}/${total} · ${found} POI   `),
});
process.stdout.write("\n");

// ---- 7-9. scal, luki, bundle ----
const merged: Poi[] = [...overturePois, ...osmPois].sort((x, y) => x.km - y.km);
const gaps = computeGaps(merged);
const bundle = buildBundle(a.name, route, merged, gaps);

mkdirSync(outDir, { recursive: true });
const bundlePath = join(outDir, "bundle.json");
const json = JSON.stringify(bundle);
writeFileSync(bundlePath, json);
if (flags.has("also-data-js")) writeFileSync(join(outDir, "data.js"), `window.BUNDLE = ${json};\n`);

// ---- 10. podsumowanie ----
const perCat: Record<string, number> = {};
for (const p of merged) perCat[p.cats[0]] = (perCat[p.cats[0]] ?? 0) + 1;
console.log("\nPodsumowanie:");
console.log("  POI wg kategorii:", perCat);
console.log(`  Razem: ${merged.length} · odrzucono poza korytarzem (Overture): ${rejected}`);
console.log(`  Zapisano: ${bundlePath} (${(json.length / 1024).toFixed(0)} KB)${flags.has("also-data-js") ? " + data.js" : ""}`);
console.log("  Źródła: © OpenStreetMap contributors, Overture Maps Foundation");
