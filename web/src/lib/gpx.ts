import { hav } from "./geo";
import type { Route, RoutePoint } from "./types";

/**
 * Parsuje ślad GPX przez DOMParser (odporny na kolejność atrybutów i formatowanie).
 * Preferuje punkty trasy (trkpt), potem route (rtept), na końcu waypointy (wpt).
 * Wysokość czytana z dziecka <ele> danego punktu.
 */
export function parseGPX(text: string): Route {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Nieprawidłowy plik GPX (błąd XML).");
  }
  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (nodes.length < 2) nodes = Array.from(doc.getElementsByTagName("rtept"));
  if (nodes.length < 2) nodes = Array.from(doc.getElementsByTagName("wpt"));

  const pts: RoutePoint[] = [];
  for (const n of nodes) {
    const lat = parseFloat(n.getAttribute("lat") || "");
    const lon = parseFloat(n.getAttribute("lon") || "");
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const eleEl = n.getElementsByTagName("ele")[0];
    const ele = eleEl ? parseFloat(eleEl.textContent || "") : NaN;
    pts.push({ lat, lon, ele: isFinite(ele) ? ele : undefined });
  }
  if (pts.length < 2) throw new Error("Za mało punktów w GPX.");

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + hav(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  }
  const totalM = cum[cum.length - 1];
  const last = pts[pts.length - 1];
  const isLoop = hav(pts[0].lat, pts[0].lon, last.lat, last.lon) < 200;
  return { pts, cum, totalM, isLoop };
}
