import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { buildStyle } from "./lib/mapStyle";
import { parseGPX } from "./lib/gpx";
import { downsample, project, pid, aheadDelta } from "./lib/geo";
import { fetchPois, type FetchSession } from "./lib/overpass";
import { buildTimeProfile, timeAtKm, etaAheadDelta, fmtDur } from "./lib/eta";
import { CATS, ORDER } from "./lib/categories";
import { aheadList, nextShop, nextOfCat, gapBeforeStretch, crossedThreshold, kmMarkerFeatures } from "./lib/planner";
import { MODES, planTrip, candidates, fmtClock } from "./lib/trip";
import type { TripState, TripConfig, ModeKey } from "./lib/types";
import { buildBundle, computeGaps, routeFromBundle, poisFromBundle, downsampledFromBundle } from "./lib/bundle";
import { db, listBundles, putBundle, deleteBundle, ensurePersistence, type StoredBundle } from "./lib/db";
import { isSupabaseConfigured } from "./lib/supabase";
import { getUser, signInWithEmail, signOut, syncNow, pushDirty, onAuthChange } from "./lib/sync";
import type { CatKey, DownRoute, FoodGap, Poi, Route } from "./lib/types";

const SUPPORT_URL = "https://buycoffee.to/mateusz_adam";

const CAT_COLOR: Record<CatKey, string> = {
  food: "#3ec98a", sleep: "#7c8cff", fuel: "#f5a623", eat: "#ff6b6b",
  water: "#38bdf8", bike: "#9aa3b2", pharmacy: "#ff5a8a", spot: "#c77dff",
};
const FILTER_CATS: CatKey[] = ["food", "sleep", "fuel", "eat", "water", "bike", "pharmacy"];
const FETCH_CATS: CatKey[] = ["food", "sleep", "fuel", "eat", "water", "bike", "pharmacy"];

function circlePolygon(lat: number, lon: number, radiusM: number): GeoJSON.Feature {
  const pts: number[][] = [];
  const R = 6378137;
  const d = radiusM / R;
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180;
  for (let i = 0; i <= 64; i++) {
    const b = (i / 64) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(b));
    const lon2 = lonR + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(latR), Math.cos(d) - Math.sin(latR) * Math.sin(lat2));
    pts.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function defaultCfg(): TripConfig {
  const m = MODES[1];
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0);
  return { mode: m.key, speedKmh: m.speedKmh, dailyKm: m.dailyKm, sleepHours: m.sleepHours, lunchHour: 13, startISO: toLocalInput(d) };
}

function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch { /* ignore */ }
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

  const [active, setActive] = useState<Set<CatKey>>(new Set(FILTER_CATS));
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [range, setRange] = useState(100);
  const [fetchRadius, setFetchRadius] = useState(500);

  const [hereKm, setHereKm] = useState<number | null>(null);
  const [hereOff, setHereOff] = useState(0);
  const [gpsOn, setGpsOn] = useState(false);
  const watchId = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release?: () => Promise<void> } | null>(null);
  const alertedRef = useRef<Map<string, Set<number>>>(new Map());
  const hereLLRef = useRef<{ lat: number; lon: number } | null>(null);

  const [detail, setDetail] = useState<Poi | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [trip, setTrip] = useState<TripState | null>(null);
  const [editingCfg, setEditingCfg] = useState(false);
  const [cfgDraft, setCfgDraft] = useState<TripConfig>(defaultCfg);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mapView, setMapView] = useState<"list" | "map">("list");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saved, setSaved] = useState<StoredBundle[]>([]);
  const [status, setStatus] = useState("Wczytaj trasę (.gpx), aby zacząć.");
  const [fetching, setFetching] = useState(false);
  const [missing, setMissing] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const fetchSessionRef = useRef<FetchSession | null>(null);
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const totalKm = route ? route.totalM / 1000 : 0;
  const refreshSaved = useCallback(async () => setSaved(await listBundles()), []);
  const visible = useCallback(
    (p: Poi) => p.cats.some((c) => active.has(c)) && (!favOnly || favorites.has(pid(p))),
    [active, favOnly, favorites],
  );

  const pidIndexRef = useRef(new Map<string, Poi>());
  useEffect(() => {
    const idx = new Map<string, Poi>();
    for (const p of pois) idx.set(pid(p), p);
    pidIndexRef.current = idx;
  }, [pois]);

  // ---- init mapy ----
  useEffect(() => {
    if (!mapDiv.current || map.current) return;
    const m = new maplibregl.Map({
      container: mapDiv.current, style: buildStyle(), center: [19.0, 52.0], zoom: 5,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#19e0d6", "line-width": 4 } });
      m.addSource("acc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "acc", type: "fill", source: "acc", paint: { "fill-color": "#ffd23f", "fill-opacity": 0.08 } });
      m.addSource("km", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "km", type: "symbol", source: "km",
        layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#19e0d6", "text-halo-color": "#0c0d10", "text-halo-width": 1.5 },
      });
      m.addSource("here", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "here", type: "circle", source: "here", paint: { "circle-radius": 8, "circle-color": "#ffd23f", "circle-stroke-color": "#3a2e00", "circle-stroke-width": 2 } });
      m.addSource("pois", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "pois", type: "circle", source: "pois",
        paint: {
          "circle-radius": ["case", ["get", "fav"], 7, 5], "circle-stroke-width": 1, "circle-stroke-color": "#0c0d10",
          "circle-color": ["match", ["get", "cat"], "food", CAT_COLOR.food, "sleep", CAT_COLOR.sleep, "fuel", CAT_COLOR.fuel, "eat", CAT_COLOR.eat, "water", CAT_COLOR.water, "bike", CAT_COLOR.bike, "pharmacy", CAT_COLOR.pharmacy, "spot", CAT_COLOR.spot, "#999"],
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
        if (!m.queryRenderedFeatures(e.point, { layers: ["pois", "km"] }).length) setHere(e.lngLat.lat, e.lngLat.lng);
      });
      setReady(true);
    });
    map.current = m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ensurePersistence();
    refreshSaved();
    if (!isSupabaseConfigured()) return;
    getUser().then((u) => setUserEmail(u?.email ?? null));
    // Po zalogowaniu (też powrót z magic-linka) auto-pobierz trasy z chmury do offline.
    const off = onAuthChange(async (mail) => {
      setUserEmail(mail);
      if (!mail) return;
      try {
        const r = await syncNow();
        await refreshSaved();
        if (r && r.pulled) setStatus(`Zalogowano. Pobrano ${r.pulled} tras do pamięci offline.`);
        else setStatus("Zalogowano. Trasy zsynchronizowane.");
      } catch { /* offline — zsynchronizuje się później */ }
    });
    return off;
  }, [refreshSaved]);

  // przy przełączeniu na mapę: dopasuj rozmiar i dośrodkuj na mojej pozycji
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || mapView !== "map") return;
    setTimeout(() => {
      m.resize();
      const ll = hereLLRef.current;
      if (ll) m.flyTo({ center: [ll.lon, ll.lat], zoom: Math.max(m.getZoom(), 14), duration: 500 });
    }, 60);
  }, [mapView, ready]);

  // ---- warstwy: trasa + km ----
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

  // ---- warstwa: POI (filtrowana) ----
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
  function applyRoute(r: Route, nm: string, ps: Poi[], favs: Set<string>, tripArg?: TripState | null) {
    const d = downsample(r, 150);
    setRoute(r); setDs(d); setTime(buildTimeProfile(d).time);
    setPois(ps); setGaps(computeGaps(ps)); setName(nm); setFavorites(favs); setHereKm(null);
    setTrip(tripArg ?? null);
    alertedRef.current.clear();
    fetchSessionRef.current = null; setMissing(0);
  }
  function loadRoute(r: Route, nm: string) {
    const tp = buildTimeProfile(downsample(r, 150));
    applyRoute(r, nm, [], new Set());
    setStatus(`Trasa: ${nm} · ${(r.totalM / 1000).toFixed(1)} km · ↑ ${Math.round(tp.ascent)} m · ≈ ${fmtDur(tp.time[tp.time.length - 1])}. Teraz „Pobierz miejsca".`);
  }
  async function onGpx(file: File) {
    try { loadRoute(parseGPX(await file.text()), file.name.replace(/\.gpx$/i, "")); }
    catch (e: any) { setStatus("Błąd GPX: " + e.message); }
  }
  async function doFetch(resume = false) {
    if (!route) return;
    setFetching(true);
    try {
      const res = await fetchPois(
        route,
        { cats: new Set<CatKey>(FETCH_CATS), radiusOther: fetchRadius, onProgress: (done, total, found) => setProgress({ done, total, found }) },
        resume ? fetchSessionRef.current ?? undefined : undefined,
      );
      fetchSessionRef.current = res.session;
      setPois(res.pois); setGaps(computeGaps(res.pois)); setMissing(res.failed);
      await persistLocal(res.pois, favorites);
      setStatus(res.failed > 0
        ? `${res.pois.length} miejsc — zapisane offline. ${res.failed} paczek nie pobrano: „Dobierz brakujące".`
        : `${res.pois.length} miejsc — zapisane offline. Włącz GPS lub dotknij mapy.`);
    } catch (e: any) { setStatus("Błąd pobierania: " + e.message); }
    finally { setFetching(false); setProgress(null); }
  }
  // Po lokalnym zapisie — jeśli zalogowany, wyślij zmiany do chmury (z opóźnieniem).
  function pushSoon() {
    if (!isSupabaseConfigured()) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      const u = await getUser();
      if (!u) return;
      try { await pushDirty(u.id); await refreshSaved(); } catch { /* offline — pójdzie później */ }
    }, 2000);
  }
  // Auto-zapis offline (IndexedDB) — bez przycisku, dane trzymają się same.
  async function persistLocal(poiList: Poi[], favSet: Set<string>, tripArg: TripState | null = trip) {
    if (!route || !name) return;
    const bundle = buildBundle(name, route, poiList, computeGaps(poiList), tripArg ?? undefined);
    const now = new Date().toISOString();
    bundle.updated_at = now;
    await putBundle({ name, bundle, favorites: [...favSet], updated_at: now, dirty: true });
    await refreshSaved();
    pushSoon();
  }
  async function loadSaved(n: string) {
    const sb = await db.bundles.get(n);
    if (!sb) return;
    applyRoute(routeFromBundle(sb.bundle), n, poisFromBundle(sb.bundle), new Set(sb.favorites), sb.bundle.trip ?? null);
    setDs(downsampledFromBundle(sb.bundle));
    setStatus(`Wczytano offline: ${n} (${sb.bundle.pois.length} miejsc).`);
  }
  async function removeSaved(n: string) {
    await deleteBundle(n);
    await refreshSaved();
    if (n === name) { setRoute(null); setDs(null); setTime([]); setPois([]); setName(""); setHereKm(null); }
    setStatus(`Usunięto „${n}".`);
  }
  async function renameSaved(old: string) {
    const nn = window.prompt("Nowa nazwa zapisanej mapy:", old);
    if (!nn || nn.trim() === old) return;
    const target = nn.trim();
    const sb = await db.bundles.get(old);
    if (!sb) return;
    if (await db.bundles.get(target)) { setStatus(`Nazwa „${target}" już istnieje.`); return; }
    await putBundle({ ...sb, name: target, bundle: { ...sb.bundle, name: target }, updated_at: new Date().toISOString(), dirty: true });
    await deleteBundle(old);
    if (name === old) setName(target);
    await refreshSaved();
    setStatus(`Zmieniono nazwę na „${target}".`);
  }

  function checkFavAlerts(km: number) {
    if (!route) return;
    for (const p of pois) {
      const id = pid(p);
      if (!favorites.has(id)) continue;
      const delta = ((d) => (d < -0.05 && route.isLoop ? d + totalKm : d))(p.km - km);
      if (delta <= 0) continue;
      let set = alertedRef.current.get(id);
      if (!set) { set = new Set(); alertedRef.current.set(id, set); }
      const th = crossedThreshold(delta, set);
      if (th != null) {
        set.add(th);
        notify(`★ ${p.name}`, `za ${delta.toFixed(1)} km (${CATS[p.cats[0]].label.toLowerCase()})`);
        setStatus(`🔔 ★ ${p.name} — za ${delta.toFixed(1)} km`);
      }
    }
  }
  function setHere(lat: number, lon: number, fromGPS = false, accuracy = 0) {
    if (!ds) { setStatus("Najpierw wczytaj trasę."); return; }
    const pr = project(ds, lat, lon);
    setHereKm(pr.km); setHereOff(pr.detourM);
    hereLLRef.current = { lat, lon };
    const m = map.current;
    (m?.getSource("here") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } });
    (m?.getSource("acc") as maplibregl.GeoJSONSource | undefined)?.setData(
      accuracy > 0 ? circlePolygon(lat, lon, accuracy) : { type: "FeatureCollection", features: [] },
    );
    // kamera: pierwszy fix / zoom-out → przybliż na mnie; potem płynnie podążaj
    if (m) {
      if (m.getZoom() < 13) m.flyTo({ center: [lon, lat], zoom: 14, duration: 600 });
      else m.panTo([lon, lat], { duration: 500 });
    }
    if (fromGPS) checkFavAlerts(pr.km);
  }
  async function toggleGps() {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null; setGpsOn(false);
      try { await wakeLockRef.current?.release?.(); } catch { /* ignore */ }
      wakeLockRef.current = null;
      setStatus("GPS zatrzymany.");
      return;
    }
    if (!("geolocation" in navigator)) { setStatus("Ta przeglądarka nie udostępnia GPS."); return; }
    if (!route) { setStatus("Najpierw wczytaj trasę (krok 1), potem włącz GPS."); return; }
    setGpsOn(true);
    setStatus("Szukam pozycji GPS… zezwól na dostęp do lokalizacji.");
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch { /* ignore */ }
    try { wakeLockRef.current = await (navigator as any).wakeLock?.request("screen"); } catch { /* brak wsparcia */ }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => setHere(p.coords.latitude, p.coords.longitude, true, p.coords.accuracy || 0),
      (e) => { setGpsOn(false); setStatus("GPS niedostępny: " + e.message + " (wymaga HTTPS i zgody na lokalizację)."); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }
  function toggleFav(id: string) {
    const n = new Set(favorites);
    n.has(id) ? n.delete(id) : n.add(id);
    setFavorites(n);
    persistLocal(pois, n);
  }
  function toggleCat(c: CatKey) {
    setActive((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
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
      await refreshSaved(); setStatus(`Sync: wysłano ${r.pushed}, pobrano ${r.pulled}.`);
    } catch (e: any) { setStatus("Sync nieudany: " + e.message); }
  }
  async function doShare() {
    const data = {
      title: "MiroBike Ultra Planner",
      text: "Planer noclegów, sklepów i postojów na trasie ultra — działa offline. Polecam!",
      url: "https://www.mirobike.grapevest.pl/",
    };
    try {
      if (navigator.share) { await navigator.share(data); return; }       // iOS/Android: natywny arkusz
      await navigator.clipboard?.writeText(data.url);
      setStatus("Link skopiowany: " + data.url);
    } catch { /* użytkownik anulował */ }
  }
  // --- Planner ---
  function openPlanner() {
    if (trip) { setCfgDraft(trip.cfg); setEditingCfg(false); } else { setCfgDraft(defaultCfg()); setEditingCfg(true); }
    setShowPlan(true);
  }
  function applyMode(mk: ModeKey) {
    const m = MODES.find((x) => x.key === mk)!;
    setCfgDraft((c) => ({ ...c, mode: mk, speedKmh: m.speedKmh, dailyKm: m.dailyKm, sleepHours: m.sleepHours }));
  }
  function generatePlan() {
    const next: TripState = { cfg: cfgDraft, overrides: trip?.overrides ?? {} };
    setTrip(next); persistLocal(pois, favorites, next); setEditingCfg(false);
  }
  function setOverride(dayIdx: number, kind: "sleep" | "lunch", pidVal: string) {
    if (!trip) return;
    const overrides = { ...trip.overrides, [dayIdx]: { ...trip.overrides[dayIdx], [kind]: pidVal || undefined } };
    const next: TripState = { ...trip, overrides };
    setTrip(next); persistLocal(pois, favorites, next);
  }

  // Eksport całej paczki (trasa + miejsca + ulubione) do pliku .json — backup/przenoszenie.
  function exportFile() {
    if (!route || !name) return;
    const bundle = buildBundle(name, route, pois, computeGaps(pois));
    const payload = { ...bundle, favorites: [...favorites] };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: "application/json" }));
    a.download = `${name || "trasa"}.mirobike.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(`Wyeksportowano „${name}" do pliku.`);
  }
  // Wczytanie wcześniej wyeksportowanego pliku .json — bez ponownego pobierania.
  async function importFile(file: File) {
    try {
      const obj = JSON.parse(await file.text());
      if (!obj?.route || !obj?.pois) { setStatus("To nie jest plik MiroBike (.json)."); return; }
      const favs: string[] = Array.isArray(obj.favorites) ? obj.favorites : [];
      const { favorites: _omit, ...bundle } = obj;
      const nm = bundle.name || file.name.replace(/\.json$/i, "");
      const now = new Date().toISOString();
      await putBundle({ name: nm, bundle, favorites: favs, updated_at: bundle.updated_at || now, dirty: true });
      await refreshSaved();
      applyRoute(routeFromBundle(bundle), nm, poisFromBundle(bundle), new Set(favs), bundle.trip ?? null);
      pushSoon();
      setStatus(`Wczytano z pliku: ${nm} (${bundle.pois.length} miejsc) — zapisano offline.`);
    } catch (e: any) { setStatus("Błąd wczytania pliku: " + e.message); }
  }

  // ---- pochodne listy ----
  const ahead = useMemo(
    () => (hereKm != null && route ? aheadList(pois.filter(visible), hereKm, route.isLoop, totalKm, range) : []),
    [pois, visible, hereKm, route, totalKm, range],
  );
  const shopWarn = useMemo(
    () => (hereKm != null && route && active.has("food") ? nextShop(pois, hereKm, route.isLoop, totalKm) : null),
    [pois, hereKm, route, totalKm, active],
  );
  const gapWarn = useMemo(
    () => (hereKm != null ? gapBeforeStretch(gaps, hereKm, range) : null),
    [gaps, hereKm, range],
  );
  const favPois = useMemo(() => pois.filter((p) => favorites.has(pid(p))), [pois, favorites]);
  const planDays = useMemo(
    () => (trip && ds && pois.length ? planTrip(ds, pois, totalKm, trip.cfg, favorites, trip.overrides) : []),
    [trip, ds, pois, totalKm, favorites],
  );

  const favAhead = useMemo(() => {
    if (hereKm == null || !route) return null;
    return favPois
      .map((p) => ({ p, delta: aheadDelta(p.km, hereKm, route.isLoop, totalKm) }))
      .filter((x) => x.delta > 0.02)
      .sort((a, b) => a.delta - b.delta)[0] ?? null;
  }, [favPois, hereKm, route, totalKm]);
  const nextByCat = useMemo(() => {
    if (hereKm == null || !route) return [];
    return ORDER.filter((c) => active.has(c)).map((c) => ({ c, n: nextOfCat(pois, c, hereKm, route.isLoop, totalKm) }));
  }, [pois, active, hereKm, route, totalKm]);
  const offRoute = hereOff > 250;

  const guideStep = !route ? 1 : !pois.length ? 2 : 3;
  const savedEntry = saved.find((s) => s.name === name);

  return (
    <div className="layout">
      <header className="bar">
        <button className="iconbtn" aria-label="Menu" onClick={() => setMenuOpen(true)}>☰</button>
        <strong onClick={() => { setDetail(null); setShowPlan(false); }}>MiroBike</strong>
        {!fetching && (
          <span className={"state " + (route ? "ok" : "warn")}>
            {route ? `✓ ${name}${pois.length ? ` · ${pois.length}` : ""}` : "⚠ brak trasy"}
          </span>
        )}
        {fetching && <span className="fetching-lbl"><span className="fetchdot" /> Pobiera{progress ? `… ${progress.done}/${progress.total} · ${progress.found}` : "…"}</span>}
        <span className="spacer" />
        <button className={"chip fav " + (favOnly ? "on" : "")} aria-label="Ulubione" title="Pokaż tylko ulubione" onClick={() => setFavOnly((v) => !v)}>★</button>
        <button className="chip plan" onClick={openPlanner}>📑 Plan</button>
      </header>

      <div className="quick">
        {missing > 0 && <button className="chip refetch" disabled={fetching} onClick={() => doFetch(true)}>⬇ Dobierz brakujące ({missing})</button>}
        <button className={"chip gps " + (gpsOn ? "on" : "")} onClick={toggleGps}>{gpsOn ? "● GPS" : "📍 Śledź GPS"}</button>
        {FILTER_CATS.map((c) => (
          <button key={c} className={"chip cat " + (active.has(c) ? "" : "off")} onClick={() => toggleCat(c)}>
            <span className="dot" style={{ background: CAT_COLOR[c] }} />{CATS[c].label}
          </button>
        ))}
        <label className="rng">do
          <select value={range} onChange={(e) => setRange(+e.target.value)}>
            <option value={50}>50 km</option><option value={100}>100 km</option><option value={200}>200 km</option>
          </select>
        </label>
      </div>

      <div className="status">{status}</div>

      <div className={"main " + mapView}>
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
                  {offRoute
                    ? <span className="offroute"> · {hereOff} m od trasy (poza trasą?)</span>
                    : ` · ${hereOff} m od trasy`}
                </div>
              </div>
              {nextByCat.length > 0 && (
                <div className="nextrow">
                  {nextByCat.map(({ c, n }) => (
                    <div className="cell" key={c}>
                      <div className="cl" style={{ color: CAT_COLOR[c] }}>{CATS[c].label}</div>
                      <div className="cv">{n ? "+" + n.delta.toFixed(1) : "—"}</div>
                      <div className="cn">{n ? n.p.name : "brak"}</div>
                    </div>
                  ))}
                </div>
              )}
              {shopWarn && shopWarn.delta > 20 && <div className="warn">⚠️ Następny sklep za <b>{shopWarn.delta.toFixed(1)} km</b> ({shopWarn.p.name}). Zatankuj zapasy.</div>}
              {gapWarn && <div className="warn">⚠️ Za <b>{gapWarn.kmTo.toFixed(1)} km</b> ostatni sklep przed odcinkiem <b>{gapWarn.gapKm.toFixed(0)} km bez zaopatrzenia</b>.</div>}
              {favAhead && <div className="warn fav">★ Do ulubionego: <b>{favAhead.p.name}</b> za <b>{favAhead.delta.toFixed(1)} km</b>{(() => { const e = etaAheadDelta(ds!, time, favAhead.delta, hereKm!, totalKm); return e != null ? ` (⏱ ${fmtDur(e)})` : ""; })()}.</div>}
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
          ) : (
            <div className="guide">
              <div className={"gstep " + (route ? "done" : "active")}>
                <span className="gn">{route ? "✓" : "1"}</span>
                <div>
                  <b>Trasa</b><br /><small>{route ? `${name} · ${totalKm.toFixed(0)} km` : "Wczytaj ślad GPX wyścigu."}</small>
                  <label className="gbtn"><input hidden type="file" accept=".gpx" onChange={(e) => e.target.files?.[0] && onGpx(e.target.files[0])} />{route ? "Zmień trasę (.gpx)" : "Wczytaj trasę (.gpx)"}</label>
                </div>
              </div>
              <div className={"gstep " + (!route ? "" : pois.length ? "done" : "active")}>
                <span className="gn">{pois.length ? "✓" : "2"}</span>
                <div>
                  <b>Miejsca</b><br /><small>{pois.length ? `${pois.length} miejsc` : "Pobierz noclegi, sklepy, jedzenie, paliwo."}</small>
                  {route && <button className="gbtn" disabled={fetching} onClick={() => doFetch()}>{fetching ? "Pobieram…" : pois.length ? "Pobierz ponownie" : "Pobierz miejsca"}</button>}
                </div>
              </div>
              <div className={"gstep " + (guideStep === 3 ? "active" : "")}>
                <span className="gn">3</span>
                <div>
                  <b>Pozycja</b><br /><small>Włącz GPS albo dotknij mapy, by zobaczyć co masz przed sobą.</small>
                  {route && pois.length > 0 && <button className="gbtn" onClick={toggleGps}>{gpsOn ? "● GPS włączony" : "📍 Śledź GPS"}</button>}
                </div>
              </div>
              {pois.length > 0 && (
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
            </div>
          )}
        </aside>
      </div>

      <div className="viewbar">
        <button className={mapView === "list" ? "active" : ""} onClick={() => setMapView("list")}>📋 Lista</button>
        <button className={mapView === "map" ? "active" : ""} onClick={() => setMapView("map")}>🗺 Mapa</button>
      </div>

      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <div className={"menu " + (menuOpen ? "open" : "")}>
        <div className="mhead"><b>Menu</b><button className="iconbtn" onClick={() => setMenuOpen(false)}>✕</button></div>

        <div className="msec">Trasa</div>
        <label className="mbtn"><input hidden type="file" accept=".gpx" onChange={(e) => { if (e.target.files?.[0]) { onGpx(e.target.files[0]); setMenuOpen(false); } }} />📂 Wczytaj trasę (.gpx)</label>

        <div className="msec">Miejsca</div>
        <label className="mrow">Promień szukania (sklepy/jedzenie/paliwo)
          <select value={fetchRadius} onChange={(e) => setFetchRadius(+e.target.value)}>
            <option value={100}>100 m</option><option value={300}>300 m</option><option value={500}>500 m</option>
            <option value={1000}>1 km</option><option value={2000}>2 km</option>
          </select>
        </label>
        <div className="mhelp">Noclegi szukane zawsze do 5 km. Po zmianie kliknij „Pobierz miejsca".</div>
        <button className="mbtn go" disabled={!route || fetching} onClick={() => { doFetch(); setMenuOpen(false); }}>{fetching ? "Pobieram…" : "⬇ Pobierz miejsca"}</button>
        {savedEntry && <div className="mnote">💾 Zapisane offline ({savedEntry.bundle.pois.length} miejsc){savedEntry.dirty ? " · do wysłania" : userEmail ? " · w chmurze" : ""}</div>}

        <div className="msec">Zapisane offline</div>
        <select className="mbtn" value="" onChange={(e) => { if (e.target.value) { loadSaved(e.target.value); setMenuOpen(false); } }}>
          <option value="">Wczytaj zapisaną…</option>
          {saved.map((s) => <option key={s.name} value={s.name}>{s.name} — {s.bundle.pois.length} miejsc{s.dirty ? " *" : ""}</option>)}
        </select>
        {name && savedEntry && <>
          <button className="mbtn" onClick={() => renameSaved(name)}>✏ Zmień nazwę</button>
          <button className="mbtn" onClick={() => removeSaved(name)}>🗑 Usuń bieżącą</button>
        </>}
        <button className="mbtn" disabled={!route} onClick={() => { exportFile(); setMenuOpen(false); }}>⤓ Eksportuj do pliku (.json)</button>
        <label className="mbtn"><input hidden type="file" accept=".json" onChange={(e) => { if (e.target.files?.[0]) { importFile(e.target.files[0]); setMenuOpen(false); } }} />📥 Wczytaj z pliku (.json)</label>

        {isSupabaseConfigured() && <>
          <div className="msec">Konto (opcjonalne)</div>
          {userEmail ? <>
            <div className="mnote">{userEmail}</div>
            <div className="mhelp">Trasy są w chmurze. Na innym urządzeniu zaloguj się tym samym mailem — pobiorą się automatycznie do pamięci offline.</div>
            <button className="mbtn" onClick={doSync}>⟳ Synchronizuj teraz</button>
            <button className="mbtn" onClick={() => signOut().then(() => setUserEmail(null))}>Wyloguj</button>
          </> : <>
            <div className="mhelp">Bez konta apka działa offline na tym urządzeniu. Zaloguj się mailem (bez hasła — dostajesz link), by przygotować trasy na komputerze i mieć je offline na telefonie.</div>
            <input className="mbtn" placeholder="twój e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="mbtn go" onClick={login}>✉ Wyślij link logowania</button>
          </>}
        </>}

        <div className="msec">Pomoc i kontakt</div>
        <button className="mbtn" onClick={() => { setShowHelp(true); setMenuOpen(false); }}>❔ Jak korzystać</button>
        <button className="mbtn" onClick={doShare}>📤 Poleć aplikację</button>
        <a className="mbtn" href={SUPPORT_URL} target="_blank" rel="noopener">☕ Postaw mi kawę</a>
        <a className="mbtn" href="mailto:contact@grapevest.pl?subject=MiroBike">✉ Kontakt: contact@grapevest.pl</a>
      </div>

      {detail && (
        <div className="sheet" onClick={() => setDetail(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <div className="dh"><b>{detail.name}</b><button onClick={() => setDetail(null)}>✕</button></div>
            <div className="dc" style={{ color: CAT_COLOR[detail.cats[0]] }}>{detail.cats.map((c) => CATS[c].label).join(" · ")}</div>
            <div className="dr">km {detail.km.toFixed(1)} · {detail.detourM} m od trasy {detail.side}{detail.tags._custom ? " · 📌 własne" : ""}</div>
            {hereKm != null && route && (() => {
              const d = ((x) => (x < -0.05 && route.isLoop ? x + totalKm : x))(detail.km - hereKm);
              const eta = etaAheadDelta(ds!, time, d, hereKm, totalKm);
              return d > 0 && eta != null ? <div className="dr">⏱ ≈ {fmtDur(eta)} stąd</div> : null;
            })()}
            {detail.tags.stars && <div className="dr">⭐ {detail.tags.stars}</div>}
            {detail.tags.opening_hours && <div className="dr">🕒 {detail.tags.opening_hours}</div>}
            {detail.tags.cuisine && <div className="dr">🍽 {detail.tags.cuisine.replace(/;/g, ", ")}</div>}
            {detail.tags.description && <div className="dr">📝 {detail.tags.description}</div>}
            {detail.tags["addr:city"] && <div className="dr">📍 {detail.tags["addr:street"] || ""} {detail.tags["addr:city"]}</div>}
            {(detail.tags.email || detail.tags["contact:email"]) && <div className="dr">✉ {detail.tags.email || detail.tags["contact:email"]}</div>}
            <div className="acts">
              <a className="act" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${detail.lat}%2C${detail.lon}`}>🧭 Nawiguj</a>
              <a className="act" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${detail.lat}%2C${detail.lon}`}>🗺 Mapy Google</a>
              {detail.cats.includes("sleep") && <a className="act" target="_blank" rel="noopener" href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(detail.name)}`}>🛏 Booking</a>}
              {(detail.tags.phone || detail.tags["contact:phone"]) && <a className="act" href={`tel:${detail.tags.phone || detail.tags["contact:phone"]}`}>☎ Zadzwoń</a>}
              {(detail.tags.website || detail.tags["contact:website"]) && <a className="act" target="_blank" rel="noopener" href={detail.tags.website || detail.tags["contact:website"]}>🌐 Strona</a>}
            </div>
            <button className={"favbig " + (favorites.has(pid(detail)) ? "is" : "")} onClick={() => toggleFav(pid(detail))}>
              {favorites.has(pid(detail)) ? "★ w ulubionych" : "☆ dodaj do ulubionych"}
            </button>
          </div>
        </div>
      )}

      {showPlan && (
        <div className="sheet" onClick={() => setShowPlan(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <div className="dh"><b>📑 Planner wyprawy</b><button onClick={() => setShowPlan(false)}>✕</button></div>

            {!route || !pois.length ? (
              <p className="empty">Wczytaj trasę (.gpx) i „Pobierz miejsca", potem ułóż wielodniowy plan.</p>
            ) : (!trip || editingCfg) ? (
              <>
                <div className="msec">Tryb jazdy</div>
                <div className="modes">
                  {MODES.map((m) => (
                    <button key={m.key} className={"modebtn " + (cfgDraft.mode === m.key ? "on" : "")} onClick={() => applyMode(m.key)}>
                      <b>{m.label}</b><small>{m.dailyKm} km/dzień · {m.speedKmh} km/h · sen {m.sleepHours} h</small>
                    </button>
                  ))}
                </div>
                <div className="cfg">
                  <label>Śr. prędkość (km/h)<input type="number" min={8} max={45} value={cfgDraft.speedKmh} onChange={(e) => setCfgDraft((c) => ({ ...c, speedKmh: +e.target.value }))} /></label>
                  <label>Dystans / dzień (km)<input type="number" min={40} max={600} step={10} value={cfgDraft.dailyKm} onChange={(e) => setCfgDraft((c) => ({ ...c, dailyKm: +e.target.value }))} /></label>
                  <label>Sen (h)<input type="number" min={0} max={12} value={cfgDraft.sleepHours} onChange={(e) => setCfgDraft((c) => ({ ...c, sleepHours: +e.target.value }))} /></label>
                  <label>Godz. obiadu<input type="number" min={10} max={20} value={cfgDraft.lunchHour} onChange={(e) => setCfgDraft((c) => ({ ...c, lunchHour: +e.target.value }))} /></label>
                  <label className="wide">Start (data i godzina)<input type="datetime-local" value={cfgDraft.startISO} onChange={(e) => setCfgDraft((c) => ({ ...c, startISO: e.target.value }))} /></label>
                </div>
                <button className="favbig" onClick={generatePlan}>🗺 Ułóż plan</button>
              </>
            ) : (
              <>
                <div className="psum">
                  {planDays.length} {planDays.length === 1 ? "dzień" : "dni"} · {totalKm.toFixed(0)} km · {MODES.find((m) => m.key === trip.cfg.mode)?.label} · {trip.cfg.speedKmh} km/h
                  <button className="linkbtn" onClick={() => { setCfgDraft(trip.cfg); setEditingCfg(true); }}>⚙ Zmień</button>
                </div>
                {planDays.map((d) => {
                  const nominalEnd = Math.min((d.index + 1) * trip.cfg.dailyKm, totalKm);
                  const sleepCands = candidates(pois, ["sleep"], nominalEnd, 25);
                  const lunchCands = candidates(pois, ["eat", "food"], d.lunch?.km ?? (d.fromKm + nominalEnd) / 2, 15);
                  return (
                    <details className="day" key={d.index} open={d.index === 0}>
                      <summary>
                        <b>Dzień {d.index + 1}</b>
                        <span className="dkm">km {d.fromKm.toFixed(0)}–{d.toKm.toFixed(0)} · {d.distanceKm.toFixed(0)} km</span>
                        <span className="clock">{d.isLast ? "🏁 " : "🛏 "}{fmtClock(d.endMs)}</span>
                      </summary>
                      <div className="daybody">
                        <div className="stop">
                          <div className="stoplab">🍽 Obiad {d.lunch ? "· " + fmtClock(d.lunch.ms) + (d.lunch.poi ? ` · km ${d.lunch.km.toFixed(0)}` : "") : ""}</div>
                          <select value={trip.overrides[d.index]?.lunch ?? (d.lunch ? pid(d.lunch.poi) : "")} onChange={(e) => setOverride(d.index, "lunch", e.target.value)}>
                            <option value="">— auto / brak —</option>
                            {lunchCands.map((p) => <option key={pid(p)} value={pid(p)}>{p.name} (km {p.km.toFixed(0)})</option>)}
                          </select>
                          {d.lunch && <button className="linkbtn" onClick={() => { setShowPlan(false); setDetail(d.lunch!.poi); }}>szczegóły</button>}
                        </div>
                        {!d.isLast && (
                          <div className="stop">
                            <div className="stoplab">🛏 Nocleg {d.sleep ? `· ${fmtClock(d.sleep.ms)} · km ${d.sleep.km.toFixed(0)} · ${d.sleep.poi.detourM} m` : "· brak w pobliżu"}</div>
                            <select value={trip.overrides[d.index]?.sleep ?? (d.sleep ? pid(d.sleep.poi) : "")} onChange={(e) => setOverride(d.index, "sleep", e.target.value)}>
                              <option value="">— auto / brak —</option>
                              {sleepCands.map((p) => <option key={pid(p)} value={pid(p)}>{p.name} (km {p.km.toFixed(0)}, {p.detourM} m)</option>)}
                            </select>
                            {d.sleep && <>
                              <button className="linkbtn" onClick={() => { setShowPlan(false); setDetail(d.sleep!.poi); }}>szczegóły</button>
                              <a className="linkbtn" target="_blank" rel="noopener" href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(d.sleep.poi.name)}`}>Booking</a>
                            </>}
                          </div>
                        )}
                        {d.isLast && <div className="stop"><div className="stoplab">🏁 Meta · {fmtClock(d.endMs)} · km {totalKm.toFixed(0)}</div></div>}
                      </div>
                    </details>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {showHelp && (
        <div className="sheet" onClick={() => setShowHelp(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <div className="dh"><b>Jak korzystać</b><button onClick={() => setShowHelp(false)}>✕</button></div>
            <ol className="help">
              <li><b>Trasa.</b> ☰ → „Wczytaj trasę (.gpx)" — ślad Twojego wyścigu.</li>
              <li><b>Pobierz miejsca.</b> ☰ → „Pobierz miejsca" — noclegi, sklepy, jedzenie i paliwo wzdłuż trasy. Zapisują się <b>automatycznie offline</b>.</li>
              <li><b>Filtry.</b> U góry włączasz/wyłączasz kategorie oraz ★ ulubione.</li>
              <li><b>Pozycja.</b> „📍 Śledź GPS" na rowerze albo dotknij mapy. Lista „przede mną" pokaże, co masz dalej i za ile (⏱ czas dojazdu).</li>
              <li><b>Plan.</b> Oznacz miejsca gwiazdką (★) → „📑 Plan" ułoży postoje wzdłuż trasy.</li>
              <li><b>Konto (opcja).</b> Zaloguj się mailem na komputerze i telefonie — przygotujesz trasy na PC i pobierzesz je offline na telefon.</li>
              <li><b>Offline.</b> Wszystko działa bez sieci w terenie. Dodaj apkę do ekranu początkowego (Udostępnij → „Do ekranu początkowego").</li>
            </ol>
            <button className="favbig" onClick={() => setShowHelp(false)}>Rozumiem</button>
          </div>
        </div>
      )}
    </div>
  );
}
