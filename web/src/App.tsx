import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { buildStyle } from "./lib/mapStyle";
import { parseGPX } from "./lib/gpx";
import { downsample, project, pid, aheadDelta } from "./lib/geo";
import { fetchPois } from "./lib/overpass";
import { buildTimeProfile, timeAtKm, etaAheadDelta, fmtDur } from "./lib/eta";
import { CATS } from "./lib/categories";
import { parseImport } from "./lib/importPlaces";
import { buildBundle, computeGaps, routeFromBundle, poisFromBundle, downsampledFromBundle } from "./lib/bundle";
import { db, listBundles, putBundle, deleteBundle, ensurePersistence, type StoredBundle } from "./lib/db";
import { isSupabaseConfigured } from "./lib/supabase";
import { getUser, signInWithEmail, signOut, syncNow } from "./lib/sync";
import type { CatKey, DownRoute, FoodGap, Poi, Route } from "./lib/types";

const CAT_COLOR: Record<CatKey, string> = {
  food: "#3ec98a", sleep: "#7c8cff", fuel: "#f5a623", eat: "#ff6b6b", spot: "#c77dff",
};
const ALL_CATS: CatKey[] = ["food", "sleep", "fuel", "eat", "spot"];

function kmStep(total: number): number {
  return total <= 60 ? 5 : total <= 150 ? 10 : total <= 400 ? 20 : 25;
}
function kmMarkerFeatures(ds: DownRoute, totalKm: number): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  const step = kmStep(totalKm);
  const c = ds.cum;
  for (let km = step; km < totalKm - 0.5; km += step) {
    const m = km * 1000;
    let i = 1;
    while (i < c.length && c[i] < m) i++;
    const f = (m - c[i - 1]) / ((c[i] - c[i - 1]) || 1);
    const la = ds.lat[i - 1] + f * (ds.lat[i] - ds.lat[i - 1]);
    const lo = ds.lon[i - 1] + f * (ds.lon[i] - ds.lon[i - 1]);
    out.push({ type: "Feature", properties: { km, label: String(km) }, geometry: { type: "Point", coordinates: [lo, la] } });
  }
  return out;
}

export default function App() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  const [route, setRoute] = useState<Route | null>(null);
  const [ds, setDs] = useState<DownRoute | null>(null);
  const [time, setTime] = useState<number[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [gaps, setGaps] = useState<FoodGap[]>([]);
  const [name, setName] = useState("");

  const [active, setActive] = useState<Set<CatKey>>(new Set(ALL_CATS));
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [range, setRange] = useState(100); // km „przede mną"

  const [hereKm, setHereKm] = useState<number | null>(null);
  const [hereOff, setHereOff] = useState(0);
  const [gpsOn, setGpsOn] = useState(false);
  const watchId = useRef<number | null>(null);

  const [detail, setDetail] = useState<Poi | null>(null);
  const [saved, setSaved] = useState<StoredBundle[]>([]);
  const [status, setStatus] = useState("Wczytaj trasę (.gpx), aby zacząć.");
  const [fetching, setFetching] = useState(false);
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const totalKm = route ? route.totalM / 1000 : 0;
  const refreshSaved = useCallback(async () => setSaved(await listBundles()), []);

  const visible = useCallback(
    (p: Poi) => p.cats.some((c) => active.has(c)) && (!favOnly || favorites.has(pid(p))),
    [active, favOnly, favorites],
  );

  // ---- init mapy ----
  useEffect(() => {
    if (!mapDiv.current || map.current) return;
    const m = new maplibregl.Map({
      container: mapDiv.current,
      style: buildStyle(),
      center: [19.0, 52.0],
      zoom: 5,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#19e0d6", "line-width": 4 } });
      m.addSource("km", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "km", type: "symbol", source: "km",
        layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Noto Sans Regular"], "text-allow-overlap": false },
        paint: { "text-color": "#19e0d6", "text-halo-color": "#0c0d10", "text-halo-width": 1.5 },
      });
      m.addSource("here", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "here", type: "circle", source: "here", paint: { "circle-radius": 8, "circle-color": "#ffd23f", "circle-stroke-color": "#3a2e00", "circle-stroke-width": 2 } });
      m.addSource("pois", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "pois", type: "circle", source: "pois",
        paint: {
          "circle-radius": ["case", ["get", "fav"], 7, 5],
          "circle-stroke-width": 1, "circle-stroke-color": "#0c0d10",
          "circle-color": ["match", ["get", "cat"], "food", CAT_COLOR.food, "sleep", CAT_COLOR.sleep, "fuel", CAT_COLOR.fuel, "eat", CAT_COLOR.eat, "spot", CAT_COLOR.spot, "#999"],
        },
      });
      m.on("click", "pois", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) setDetail(pidIndexRef.current.get(id) ?? null);
      });
      m.on("click", "km", (e) => {
        const c = (e.features?.[0]?.geometry as GeoJSON.Point)?.coordinates;
        if (c) setHere(c[1], c[0]);
      });
      m.on("click", (e) => {
        // klik w pustą mapę = symulacja pozycji
        const feats = m.queryRenderedFeatures(e.point, { layers: ["pois", "km"] });
        if (!feats.length) setHere(e.lngLat.lat, e.lngLat.lng);
      });
      setReady(true);
    });
    map.current = m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pidIndexRef = useRef(new Map<string, Poi>());
  useEffect(() => {
    const idx = new Map<string, Poi>();
    for (const p of pois) idx.set(pid(p), p);
    pidIndexRef.current = idx;
  }, [pois]);

  useEffect(() => {
    ensurePersistence();
    refreshSaved();
    if (isSupabaseConfigured()) getUser().then((u) => setUserEmail(u?.email ?? null));
  }, [refreshSaved]);

  // ---- warstwy mapy ----
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const rsrc = m.getSource("route") as maplibregl.GeoJSONSource | undefined;
    const ksrc = m.getSource("km") as maplibregl.GeoJSONSource | undefined;
    if (route && ds) {
      const coords = route.pts.map((p) => [p.lon, p.lat]);
      rsrc?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
      ksrc?.setData({ type: "FeatureCollection", features: kmMarkerFeatures(ds, totalKm) });
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, duration: 0 });
    } else {
      rsrc?.setData({ type: "FeatureCollection", features: [] });
      ksrc?.setData({ type: "FeatureCollection", features: [] });
    }
  }, [route, ds, totalKm, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const feats = pois.filter(visible).map((p) => ({
      type: "Feature" as const,
      properties: { id: pid(p), cat: p.cats[0], fav: favorites.has(pid(p)) },
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
    }));
    (m.getSource("pois") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
  }, [pois, visible, favorites, ready]);

  // ---- akcje ----
  function applyRoute(r: Route, nm: string, ps: Poi[], favs: Set<string>) {
    const d = downsample(r, 150);
    setRoute(r); setDs(d); setTime(buildTimeProfile(d).time);
    setPois(ps); setGaps(computeGaps(ps)); setName(nm); setFavorites(favs);
    setHereKm(null);
  }

  function loadRoute(r: Route, nm: string) {
    const tp = buildTimeProfile(downsample(r, 150));
    applyRoute(r, nm, [], new Set());
    setStatus(`Trasa: ${nm} · ${(r.totalM / 1000).toFixed(1)} km · ↑ ${Math.round(tp.ascent)} m · ≈ ${fmtDur(tp.time[tp.time.length - 1])}. Teraz „Pobierz miejsca".`);
  }

  async function onGpx(file: File) {
    try {
      loadRoute(parseGPX(await file.text()), file.name.replace(/\.gpx$/i, ""));
    } catch (e: any) {
      setStatus("Błąd GPX: " + e.message);
    }
  }

  async function doFetch() {
    if (!route) return;
    setFetching(true);
    try {
      const found = await fetchPois(route, {
        cats: new Set<CatKey>(["food", "sleep", "fuel", "eat"]),
        radiusOther: 500,
        onProgress: (done, total, n) => setStatus(`Pobieram… ${done}/${total} · ${n} miejsc`),
      });
      setPois(found); setGaps(computeGaps(found));
      setStatus(`${found.length} miejsc. Zapisz offline („Zapisz").`);
    } catch (e: any) {
      setStatus("Błąd pobierania: " + e.message);
    } finally {
      setFetching(false);
    }
  }

  async function onImport(file: File) {
    if (!route || !ds) { setStatus("Najpierw wczytaj trasę."); return; }
    try {
      const list = parseImport(await file.text(), file.name);
      if (!list.length) { setStatus("Nie znalazłem miejsc w pliku."); return; }
      const idx = new Map(pois.map((p) => [pid(p), p]));
      let added = 0;
      for (const it of list) {
        const pr = project(ds, it.lat, it.lon);
        const np: Poi = {
          name: it.name, cats: [CATS[it.cat] ? it.cat : "spot"], lat: it.lat, lon: it.lon,
          km: pr.km, detourM: pr.detourM, side: pr.side,
          tags: { _custom: "1", ...(it.desc ? { description: it.desc } : {}) },
        };
        const id = pid(np);
        if (idx.has(id)) continue;
        idx.set(id, np); added++;
      }
      const next = [...idx.values()].sort((a, b) => a.km - b.km);
      setPois(next); setGaps(computeGaps(next));
      setStatus(`Dodano ${added} własnych miejsc. Razem ${next.length}.`);
    } catch (e: any) {
      setStatus("Błąd importu: " + e.message);
    }
  }

  async function saveCurrent() {
    if (!route || !name) return;
    const bundle = buildBundle(name, route, pois, gaps);
    const now = new Date().toISOString();
    bundle.updated_at = now;
    await putBundle({ name, bundle, favorites: [...favorites], updated_at: now, dirty: true });
    await refreshSaved();
    setStatus(`Zapisano „${name}" offline${userEmail ? " — kliknij Sync, by wysłać na konto" : ""}.`);
  }

  async function loadSaved(n: string) {
    const sb = await db.bundles.get(n);
    if (!sb) return;
    applyRoute(routeFromBundle(sb.bundle), n, poisFromBundle(sb.bundle), new Set(sb.favorites));
    setDs(downsampledFromBundle(sb.bundle));
    setStatus(`Wczytano offline: ${n} (${sb.bundle.pois.length} miejsc).`);
  }

  async function removeSaved(n: string) {
    await deleteBundle(n);
    await refreshSaved();
    if (n === name) { setRoute(null); setDs(null); setTime([]); setPois([]); setName(""); setHereKm(null); }
    setStatus(`Usunięto „${n}".`);
  }

  function setHere(lat: number, lon: number) {
    if (!ds) { setStatus("Najpierw wczytaj trasę."); return; }
    const pr = project(ds, lat, lon);
    setHereKm(pr.km); setHereOff(pr.detourM);
    (map.current?.getSource("here") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] },
    });
  }

  function toggleGps() {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null; setGpsOn(false); setStatus("GPS zatrzymany.");
      return;
    }
    if (!("geolocation" in navigator)) { setStatus("Brak GPS."); return; }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => { setHere(p.coords.latitude, p.coords.longitude); map.current?.panTo([p.coords.longitude, p.coords.latitude]); },
      (e) => setStatus("GPS: " + e.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    setGpsOn(true); setStatus("Śledzę GPS…");
  }

  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleCat(c: CatKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  async function login() {
    if (!email) return;
    try { await signInWithEmail(email); setStatus("Wysłałem link logowania na " + email + "."); }
    catch (e: any) { setStatus("Logowanie nieudane: " + e.message); }
  }
  async function doSync() {
    try {
      const r = await syncNow();
      if (!r) { setStatus("Zaloguj się, by synchronizować."); return; }
      await refreshSaved();
      setStatus(`Sync: wysłano ${r.pushed}, pobrano ${r.pulled}.`);
    } catch (e: any) { setStatus("Sync nieudany: " + e.message); }
  }

  // ---- panel „przede mną" ----
  const ahead = useMemo(() => {
    if (hereKm == null || !route) return [];
    return pois
      .filter(visible)
      .map((p) => ({ p, delta: aheadDelta(p.km, hereKm, route.isLoop, totalKm) }))
      .filter((x) => x.delta > 0.02 && x.delta <= range)
      .sort((a, b) => a.delta - b.delta);
  }, [pois, visible, hereKm, route, totalKm, range]);

  const nextShop = useMemo(() => {
    if (hereKm == null || !route) return null;
    return pois
      .filter((p) => p.cats.includes("food"))
      .map((p) => ({ p, delta: aheadDelta(p.km, hereKm, route.isLoop, totalKm) }))
      .filter((x) => x.delta > 0.02)
      .sort((a, b) => a.delta - b.delta)[0] ?? null;
  }, [pois, hereKm, route, totalKm]);

  return (
    <div className="layout">
      <header className="bar">
        <strong onClick={() => { setDetail(null); }} style={{ cursor: "pointer" }}>MiroBike</strong>
        <span className={"state " + (route ? "ok" : "warn")}>
          {route ? `✓ ${name}${pois.length ? ` · ${pois.length} miejsc` : " — pobierz miejsca"}` : "⚠ brak trasy"}
        </span>
        {fetching && <span className="fetchdot" />}
        <span className="spacer" />
        {isSupabaseConfigured() ? (
          userEmail ? (
            <>
              <button onClick={doSync}>⟳ Sync</button>
              <button onClick={() => signOut().then(() => setUserEmail(null))}>Wyloguj</button>
            </>
          ) : (
            <>
              <input placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button onClick={login}>Zaloguj</button>
            </>
          )
        ) : null}
      </header>

      <div className="quick">
        <button className={gpsOn ? "chip on" : "chip"} disabled={!route} onClick={toggleGps}>{gpsOn ? "GPS ●" : "Śledź GPS"}</button>
        {(["food", "sleep", "fuel", "eat", "spot"] as CatKey[]).map((c) => (
          <button key={c} className={"chip cat " + (active.has(c) ? "" : "off")} onClick={() => toggleCat(c)}>
            <span className="dot" style={{ background: CAT_COLOR[c] }} />{CATS[c].label}
          </button>
        ))}
        <button className={favOnly ? "chip on" : "chip"} onClick={() => setFavOnly((v) => !v)}>★ ulubione</button>
        <label className="rng">do
          <select value={range} onChange={(e) => setRange(+e.target.value)}>
            <option value={50}>50 km</option><option value={100}>100 km</option><option value={200}>200 km</option>
          </select>
        </label>
      </div>

      <div className="toolbar">
        <label className="btn">Wczytaj trasę (.gpx)<input hidden type="file" accept=".gpx" onChange={(e) => e.target.files?.[0] && onGpx(e.target.files[0])} /></label>
        <button className="go" disabled={!route || fetching} onClick={doFetch}>{fetching ? "Pobieram…" : "Pobierz miejsca"}</button>
        <label className="btn">➕ Dodaj własne<input hidden type="file" accept=".kml,.gpx,.csv,.txt" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} /></label>
        <button disabled={!route} onClick={saveCurrent}>Zapisz offline</button>
        <select value="" onChange={(e) => e.target.value && loadSaved(e.target.value)}>
          <option value="">Zapisane offline…</option>
          {saved.map((s) => <option key={s.name} value={s.name}>{s.name} — {s.bundle.pois.length} miejsc{s.dirty ? " *" : ""}</option>)}
        </select>
        {name && saved.some((s) => s.name === name) && <button onClick={() => removeSaved(name)}>🗑 Usuń</button>}
      </div>

      <div className="status">{status}</div>

      <div className="main">
        <div ref={mapDiv} className="map" />
        <aside className="panel">
          {hereKm != null && route ? (
            <>
              <div className="here">
                <div className="lab">jesteś na</div>
                <div className="km">{hereKm.toFixed(1)}<small> / {totalKm.toFixed(0)} km</small></div>
                <div className="meta">
                  {(totalKm - hereKm).toFixed(1)} km do końca
                  {time.length ? ` · ⏱ ≈ ${fmtDur(timeAtKm(ds!, time, totalKm)! - timeAtKm(ds!, time, hereKm)!)}` : ""}
                  {` · ${hereOff} m od trasy`}
                </div>
              </div>
              {nextShop && nextShop.delta > 20 && (
                <div className="warn">⚠️ Następny sklep za <b>{nextShop.delta.toFixed(1)} km</b> ({nextShop.p.name}). Zatankuj zapasy.</div>
              )}
              {!ahead.length ? (
                <p className="empty">Nic w zasięgu {range} km dla wybranych filtrów.</p>
              ) : (
                <ul className="list">
                  {ahead.slice(0, 120).map(({ p, delta }) => {
                    const id = pid(p);
                    const eta = etaAheadDelta(ds!, time, delta, hereKm!, totalKm);
                    return (
                      <li key={id} onClick={() => setDetail(p)}>
                        <span className="dot" style={{ background: CAT_COLOR[p.cats[0]] }} />
                        <span className="nm">{p.name}<br /><small>{eta != null ? `⏱ ${fmtDur(eta)} · ` : ""}{p.detourM} m {p.side}</small></span>
                        <span className="km">+{delta.toFixed(1)}</span>
                        <span className={"star " + (favorites.has(id) ? "is" : "")} onClick={(e) => { e.stopPropagation(); toggleFav(id); }}>{favorites.has(id) ? "★" : "☆"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : !pois.length ? (
            <p className="empty">Wczytaj trasę i „Pobierz miejsca". Potem włącz GPS lub dotknij mapy, by zobaczyć co masz przed sobą.</p>
          ) : (
            <ul className="list">
              {pois.filter(visible).map((p) => {
                const id = pid(p);
                return (
                  <li key={id} onClick={() => setDetail(p)}>
                    <span className="dot" style={{ background: CAT_COLOR[p.cats[0]] }} />
                    <span className="nm">{p.name}<br /><small>km {p.km.toFixed(1)} · {p.detourM} m {p.side}</small></span>
                    <span className={"star " + (favorites.has(id) ? "is" : "")} onClick={(e) => { e.stopPropagation(); toggleFav(id); }}>{favorites.has(id) ? "★" : "☆"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      {detail && (
        <div className="sheet" onClick={() => setDetail(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <div className="dh"><b>{detail.name}</b><button onClick={() => setDetail(null)}>✕</button></div>
            <div className="dc" style={{ color: CAT_COLOR[detail.cats[0]] }}>{detail.cats.map((c) => CATS[c].label).join(" · ")}</div>
            <div className="dr">km {detail.km.toFixed(1)} · {detail.detourM} m od trasy {detail.side}{detail.tags._custom ? " · 📌 własne" : ""}</div>
            {detail.tags.opening_hours && <div className="dr">🕒 {detail.tags.opening_hours}</div>}
            {detail.tags.description && <div className="dr">📝 {detail.tags.description}</div>}
            {detail.tags["addr:city"] && <div className="dr">📍 {detail.tags["addr:street"] || ""} {detail.tags["addr:city"]}</div>}
            <div className="acts">
              <a className="act" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${detail.lat}%2C${detail.lon}`}>🧭 Nawiguj</a>
              {detail.cats.includes("sleep") && <a className="act" target="_blank" rel="noopener" href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(detail.name)}`}>🛏 Booking</a>}
              {(detail.tags.phone || detail.tags["contact:phone"]) && <a className="act" href={`tel:${detail.tags.phone || detail.tags["contact:phone"]}`}>☎ Zadzwoń</a>}
            </div>
            <button className={"favbig " + (favorites.has(pid(detail)) ? "is" : "")} onClick={() => toggleFav(pid(detail))}>
              {favorites.has(pid(detail)) ? "★ w ulubionych" : "☆ dodaj do ulubionych"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
