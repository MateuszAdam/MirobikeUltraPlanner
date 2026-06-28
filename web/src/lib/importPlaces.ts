import { inferCat, normCat } from "./categories";
import type { CatKey } from "./types";

export interface ImportedPlace {
  name: string;
  lat: number;
  lon: number;
  cat: CatKey;
  desc: string;
}

function stripCdata(s: string): string {
  return (s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function stripTags(s: string): string {
  return (s || "").replace(/<[^>]*>/g, " ");
}
function decodeXml(s: string): string {
  return (s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#3?9;/g, "'").replace(/&amp;/g, "&");
}
function cleanTxt(s: string | undefined): string {
  return decodeXml(stripTags(stripCdata(s || ""))).replace(/\s+/g, " ").trim();
}

/** KML z Google My Maps. */
export function parseKML(text: string): ImportedPlace[] {
  const out: ImportedPlace[] = [];
  const re = /<Placemark\b[\s\S]*?<\/Placemark>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const blk = m[0];
    const name = cleanTxt((blk.match(/<name>([\s\S]*?)<\/name>/i) || [])[1]) || "Miejsce";
    const desc = cleanTxt((blk.match(/<description>([\s\S]*?)<\/description>/i) || [])[1]);
    const co = (blk.match(/<coordinates>([\s\S]*?)<\/coordinates>/i) || [])[1];
    if (!co) continue;
    const first = co.trim().split(/\s+/)[0].split(",");
    const lon = +first[0];
    const lat = +first[1];
    if (!isFinite(lat) || !isFinite(lon)) continue;
    out.push({ name, lat, lon, cat: inferCat(name + " " + desc), desc });
  }
  return out;
}

/** GPX z waypointami (wpt). */
export function parseWaypoints(text: string): ImportedPlace[] {
  const out: ImportedPlace[] = [];
  const re = /<wpt\b[\s\S]*?(?:\/>|<\/wpt>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const blk = m[0];
    const lat = +((blk.match(/lat="([-\d.]+)"/i) || [])[1]);
    const lon = +((blk.match(/lon="([-\d.]+)"/i) || [])[1]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const name = cleanTxt((blk.match(/<name>([\s\S]*?)<\/name>/i) || [])[1]) || "Punkt";
    const desc = cleanTxt((blk.match(/<desc>([\s\S]*?)<\/desc>/i) || [])[1]);
    out.push({ name, lat, lon, cat: inferCat(name + " " + desc), desc });
  }
  return out;
}

/** CSV: nagłówek z lat/lon (+ opcjonalnie name/category) albo „nazwa,lat,lon". */
export function parseCSV(text: string): ImportedPlace[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = lines[0].indexOf(";") >= 0 && lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const li = head.findIndex((h) => /^lat/.test(h));
  const loi = head.findIndex((h) => /^(lon|lng|long)/.test(h));
  const ni = head.findIndex((h) => /name|nazwa|title|tytuł/.test(h));
  const ci = head.findIndex((h) => /cat|kateg|type|typ/.test(h));
  const hasHeader = li >= 0 && loi >= 0;
  const out: ImportedPlace[] = [];
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const c = split(lines[i]);
    let lat: number, lon: number, name: string, cat = "";
    if (hasHeader) {
      lat = +c[li];
      lon = +c[loi];
      name = (ni >= 0 ? c[ni] : "") || "Miejsce";
      cat = ci >= 0 ? c[ci] : "";
    } else {
      name = c[0] || "Miejsce";
      lat = +c[1];
      lon = +c[2];
    }
    if (!isFinite(lat) || !isFinite(lon)) continue;
    out.push({ name, lat, lon, cat: normCat(cat) || inferCat(name), desc: "" });
  }
  return out;
}

/** Dispatcher po nazwie pliku / treści. */
export function parseImport(text: string, filename: string): ImportedPlace[] {
  const nm = filename.toLowerCase();
  if (nm.endsWith(".kml") || /<kml[\s>]/i.test(text)) return parseKML(text);
  if (nm.endsWith(".gpx") || /<gpx[\s>]/i.test(text)) return parseWaypoints(text);
  return parseCSV(text);
}
