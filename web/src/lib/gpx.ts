import { hav } from "./geo";
import type { Route, RoutePoint } from "./types";

/** Parsuje ślad GPX (trkpt) wraz z wysokością (<ele>). */
export function parseGPX(text: string): Route {
  const re = /lat="([-\d.]+)"\s+lon="([-\d.]+)"/g;
  const pts: RoutePoint[] = [];
  const ends: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    pts.push({ lat: +m[1], lon: +m[2] });
    ends.push(re.lastIndex);
  }
  if (pts.length < 2) throw new Error("Za mało punktów w GPX.");
  const ele = /<ele>\s*([-\d.]+)\s*<\/ele>/g;
  for (let i = 0; i < pts.length; i++) {
    ele.lastIndex = ends[i];
    const em = ele.exec(text);
    const limit = i + 1 < ends.length ? ends[i + 1] : text.length;
    if (em && em.index < limit) pts[i].ele = +em[1];
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + hav(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  }
  const totalM = cum[cum.length - 1];
  const last = pts[pts.length - 1];
  const isLoop = hav(pts[0].lat, pts[0].lon, last.lat, last.lon) < 200;
  return { pts, cum, totalM, isLoop };
}
