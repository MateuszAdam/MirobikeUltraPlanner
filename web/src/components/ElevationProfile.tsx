import type { DownRoute } from "../lib/types";

/** Mini-wykres profilu wysokości z danych ele (z opcjonalnym znacznikiem pozycji). */
export function ElevationProfile({ ds, totalKm, cur }: { ds: DownRoute; totalKm: number; cur: number | null }) {
  const W = 100, H = 36;
  let min = Infinity, max = -Infinity, ascent = 0, prev: number | null = null;
  for (let i = 0; i < ds.lat.length; i++) {
    const e = ds.ele[i];
    if (e == null) continue;
    if (prev != null && e > prev) ascent += e - prev;
    prev = e;
    min = Math.min(min, e); max = Math.max(max, e);
  }
  if (!isFinite(min) || max - min < 2) return null; // brak danych o wysokości
  const seg = max - min;
  const xy: [number, number][] = [];
  for (let i = 0; i < ds.lat.length; i++) {
    const e = ds.ele[i];
    if (e == null) continue;
    xy.push([(ds.cum[i] / (totalKm * 1000)) * W, H - 2 - ((e - min) / seg) * (H - 6)]);
  }
  if (xy.length < 2) return null;
  const line = "M" + xy.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");
  const area = `${line} L ${xy[xy.length - 1][0].toFixed(1)} ${H} L ${xy[0][0].toFixed(1)} ${H} Z`;
  const curX = cur != null ? (cur / totalKm) * W : null;
  return (
    <div className="profile">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={area} className="pa" />
        <path d={line} className="pl" />
        {curX != null && <line x1={curX} y1={0} x2={curX} y2={H} className="pc" />}
      </svg>
      <div className="pcap">↑ {Math.round(ascent)} m · max {Math.round(max)} m n.p.m.</div>
    </div>
  );
}
