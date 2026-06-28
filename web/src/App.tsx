import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { buildStyle } from "./lib/mapStyle";
import { parseGPX } from "./lib/gpx";
import { downsample } from "./lib/geo";
import { fetchPois } from "./lib/overpass";
import { buildTimeProfile, timeAtKm, fmtDur } from "./lib/eta";
import { buildBundle, computeGaps, routeFromBundle, poisFromBundle, downsampledFromBundle } from "./lib/bundle";
import { db, listBundles, putBundle, deleteBundle, ensurePersistence, type StoredBundle } from "./lib/db";
import { isSupabaseConfigured } from "./lib/supabase";
import { getUser, signInWithEmail, signOut, syncNow } from "./lib/sync";
import type { CatKey, DownRoute, Poi, Route } from "./lib/types";

const CAT_COLOR: Record<CatKey, string> = {
  food: "#3ec98a", sleep: "#7c8cff", fuel: "#f5a623", eat: "#ff6b6b", spot: "#c77dff",
};
const ALL_CATS: CatKey[] = ["food", "sleep", "fuel", "eat"];

function poisGeoJson(pois: Poi[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pois.map((p) => ({
      type: "Feature",
      properties: { cat: p.cats[0], name: p.name },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    })),
  };
}

export default function App() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  const [route, setRoute] = useState<Route | null>(null);
  const [ds, setDs] = useState<DownRoute | null>(null);
  const [time, setTime] = useState<number[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [name, setName] = useState("");

  const [saved, setSaved] = useState<StoredBundle[]>([]);
  const [status, setStatus] = useState("Wczytaj trasę (.gpx), aby zacząć.");
  const [fetching, setFetching] = useState(false);
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const refreshSaved = useCallback(async () => setSaved(await listBundles()), []);

  // init mapy
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
      m.addSource("pois", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "pois", type: "circle", source: "pois",
        paint: {
          "circle-radius": 5,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0c0d10",
          "circle-color": [
            "match", ["get", "cat"],
            "food", CAT_COLOR.food, "sleep", CAT_COLOR.sleep,
            "fuel", CAT_COLOR.fuel, "eat", CAT_COLOR.eat, "spot", CAT_COLOR.spot,
            "#999",
          ],
        },
      });
      setReady(true);
    });
    map.current = m;
  }, []);

  // boot: konto + lista offline
  useEffect(() => {
    ensurePersistence();
    refreshSaved();
    if (isSupabaseConfigured()) getUser().then((u) => setUserEmail(u?.email ?? null));
  }, [refreshSaved]);

  // odśwież warstwę trasy
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const src = m.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (route) {
      const coords = route.pts.map((p) => [p.lon, p.lat]);
      src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40 });
    } else {
      src.setData({ type: "FeatureCollection", features: [] });
    }
  }, [route, ready]);

  // odśwież warstwę POI
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("pois") as maplibregl.GeoJSONSource | undefined)?.setData(poisGeoJson(pois));
  }, [pois, ready]);

  function loadRoute(r: Route, nm: string) {
    const d = downsample(r, 150);
    const tp = buildTimeProfile(d);
    setRoute(r); setDs(d); setTime(tp.time); setPois([]); setName(nm);
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
        cats: new Set(ALL_CATS),
        radiusOther: 500,
        onProgress: (done, total, n) => setStatus(`Pobieram… ${done}/${total} · ${n} miejsc`),
      });
      setPois(found);
      setStatus(`${found.length} miejsc. Zapisz offline („Zapisz").`);
    } catch (e: any) {
      setStatus("Błąd pobierania: " + e.message);
    } finally {
      setFetching(false);
    }
  }

  async function saveCurrent() {
    if (!route || !name) return;
    const bundle = buildBundle(name, route, pois, computeGaps(pois));
    const now = new Date().toISOString();
    bundle.updated_at = now;
    const existing = await db.bundles.get(name);
    await putBundle({ name, bundle, favorites: existing?.favorites ?? [], updated_at: now, dirty: true });
    await refreshSaved();
    setStatus(`Zapisano „${name}" offline${userEmail ? " (kliknij Sync, by wysłać do konta)" : ""}.`);
  }

  async function loadSaved(n: string) {
    const sb = await db.bundles.get(n);
    if (!sb) return;
    const r = routeFromBundle(sb.bundle);
    const d = downsampledFromBundle(sb.bundle);
    setRoute(r); setDs(d); setTime(buildTimeProfile(d).time);
    setPois(poisFromBundle(sb.bundle)); setName(n);
    setStatus(`Wczytano offline: ${n} (${sb.bundle.pois.length} miejsc).`);
  }

  async function removeSaved(n: string) {
    await deleteBundle(n);
    await refreshSaved();
    if (n === name) { setRoute(null); setDs(null); setTime([]); setPois([]); setName(""); }
    setStatus(`Usunięto „${n}".`);
  }

  async function login() {
    if (!email) return;
    try {
      await signInWithEmail(email);
      setStatus("Wysłałem link logowania na " + email + ". Otwórz go na tym urządzeniu.");
    } catch (e: any) {
      setStatus("Logowanie nieudane: " + e.message);
    }
  }

  async function doSync() {
    try {
      const r = await syncNow();
      if (!r) { setStatus("Zaloguj się, by synchronizować."); return; }
      await refreshSaved();
      setStatus(`Sync: wysłano ${r.pushed}, pobrano ${r.pulled}.`);
    } catch (e: any) {
      setStatus("Sync nieudany: " + e.message);
    }
  }

  return (
    <div className="layout">
      <header className="bar">
        <strong>MiroBike</strong>
        <span className={"state " + (route ? "ok" : "warn")}>{route ? `✓ ${name}` : "⚠ brak trasy"}</span>
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

      <div className="toolbar">
        <label className="btn">
          Wczytaj trasę (.gpx)
          <input hidden type="file" accept=".gpx" onChange={(e) => e.target.files?.[0] && onGpx(e.target.files[0])} />
        </label>
        <button className="go" disabled={!route || fetching} onClick={doFetch}>
          {fetching ? "Pobieram…" : "Pobierz miejsca"}
        </button>
        <button disabled={!route} onClick={saveCurrent}>Zapisz offline</button>
        <select value="" onChange={(e) => e.target.value && loadSaved(e.target.value)}>
          <option value="">Zapisane offline…</option>
          {saved.map((s) => (
            <option key={s.name} value={s.name}>{s.name} — {s.bundle.pois.length} miejsc{s.dirty ? " *" : ""}</option>
          ))}
        </select>
        {name && saved.some((s) => s.name === name) && (
          <button onClick={() => removeSaved(name)}>🗑 Usuń</button>
        )}
      </div>

      <div className="status">{status}</div>

      <div className="main">
        <div ref={mapDiv} className="map" />
        <aside className="panel">
          {!pois.length ? (
            <p className="empty">Brak miejsc. Wczytaj trasę i kliknij „Pobierz miejsca".</p>
          ) : (
            <ul className="list">
              {pois.map((p, i) => (
                <li key={i}>
                  <span className="dot" style={{ background: CAT_COLOR[p.cats[0]] }} />
                  <span className="nm">{p.name}</span>
                  <span className="km">
                    km {p.km.toFixed(1)}
                    {ds && time.length ? ` · ⏱ ${fmtDur(timeAtKm(ds, time, p.km))}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
