import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { buildStyle } from "./lib/mapStyle";
import { parseGPX } from "./lib/gpx";
import { downsample, project, pid, aheadDelta } from "./lib/geo";
import { fetchPois, type FetchSession } from "./lib/overpass";
import { buildTimeProfile, timeAtKm, etaAheadDelta, fmtDur } from "./lib/eta";
import { CATS, ORDER } from "./lib/categories";
import { aheadList, nextShop, nextOfCat, gapBeforeStretch, gapsByCat, crossedThreshold, kmMarkerFeatures } from "./lib/planner";
import { planTrip } from "./lib/trip";
import { buildBundle, computeGaps, routeFromBundle, poisFromBundle, downsampledFromBundle } from "./lib/bundle";
import { db, listBundles, putBundle, deleteBundle, ensurePersistence, getMeta, setMeta, type StoredBundle } from "./lib/db";
import { isSupabaseConfigured } from "./lib/supabase";
import { getUser, getSessionEmail, signOut, syncNow, pushDirty, onAuthChange } from "./lib/sync";
import { biometricSupported, biometricInfo, enableBiometric, disableBiometric, initBiometricTokenSync } from "./lib/biometric";
import type { CatKey, DownRoute, FoodGap, Poi, Route, TripState } from "./lib/types";
import { CAT_COLOR, is24h, fmtDist } from "./lib/ui";
import { ElevationProfile } from "./components/ElevationProfile";
import { DetailSheet, PlannerSheet, HelpSheet, AboutSheet } from "./components/Sheets";
import { useGps } from "./hooks/useGps";
import { prewarmCorridor } from "./lib/prewarm";
import { useTheme } from "./theme";
import { navigate } from "./lib/nav";

const SUPPORT_URL = "https://buycoffee.to/mateusz_adam";
const PMTILES_URL = import.meta.env.VITE_PMTILES_URL as string | undefined;

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

// Wymusza warstwy nakładki nad podkładem (wektorowy PMTiles potrafi je „zakopać").
function bumpOverlays(m: maplibregl.Map) {
  for (const id of ["mb_route_case", "mb_route", "mb_acc", "mb_km", "mb_pois", "mb_ends", "mb_ends_lbl", "mb_here"]) if (m.getLayer(id)) m.moveLayer(id);
}

let audioCtx: AudioContext | null = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(audioCtx.currentTime + 0.18);
  } catch { /* brak Web Audio */ }
}
/** Alert „glanceable" — wibracja + beep (działa na pierwszym planie), notyfikacja jako bonus. */
function rideAlert(title: string, body: string) {
  try { navigator.vibrate?.([180, 80, 180]); } catch { /* ignore */ }
  beep();
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch { /* ignore */ }
}

export default function App({ onWantLogin }: { localMode?: boolean; onWantLogin?: () => void } = {}) {
  const { theme, setTheme } = useTheme();
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
  const [open24Only, setOpen24Only] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [rideMode, setRideMode] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [range, setRange] = useState(100);
  const [fetchRadius, setFetchRadius] = useState(500);

  const [hereKm, setHereKm] = useState<number | null>(null);
  const [hereOff, setHereOff] = useState(0);
  const alertedRef = useRef<Map<string, Set<number>>>(new Map());
  const planPidsRef = useRef<Set<string>>(new Set());
  const hereLLRef = useRef<{ lat: number; lon: number } | null>(null);
  const smoothRef = useRef<{ lat: number; lon: number } | null>(null);

  const [detail, setDetail] = useState<Poi | null>(null);
  const [detailFromPlan, setDetailFromPlan] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [trip, setTrip] = useState<TripState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSec, setMenuSec] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [mapView, setMapView] = useState<"list" | "map">("list");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saved, setSaved] = useState<StoredBundle[]>([]);
  const [status, setStatus] = useState("Wczytaj trasę (.gpx), aby zacząć.");
  const [fetching, setFetching] = useState(false);
  const [missing, setMissing] = useState(0);
  const [prewarming, setPrewarming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const fetchSessionRef = useRef<FetchSession | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const wantFetchRef = useRef(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const { gpsOn, toggleGps } = useGps({
    onFix: (lat, lon, acc) => setHere(lat, lon, true, acc),
    canTrack: () => !!route,
    setStatus,
    lowPower: () => lowPower,
  });

  const totalKm = route ? route.totalM / 1000 : 0;
  const refreshSaved = useCallback(async () => setSaved(await listBundles()), []);
  const visible = useCallback(
    // filtr po kategorii głównej (zgodnie z kolorem kropki) — odznaczenie „nocleg" chowa wszystkie noclegi
    (p: Poi) => active.has(p.cats[0]) && (!favOnly || favorites.has(pid(p))) && (!open24Only || is24h(p.tags)),
    [active, favOnly, favorites, open24Only],
  );

  const pidIndexRef = useRef(new Map<string, Poi>());
  useEffect(() => {
    const idx = new Map<string, Poi>();
    for (const p of pois) idx.set(pid(p), p);
    pidIndexRef.current = idx;
  }, [pois]);

  // ---- init mapy ----
  useEffect(() => {
    if (!mapDiv.current) return;
    const m = new maplibregl.Map({
      container: mapDiv.current, style: buildStyle(), center: [19.0, 52.0], zoom: 5,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.on("load", () => {
      m.addSource("mb_route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "mb_route_case", type: "line", source: "mb_route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.85 } });
      m.addLayer({ id: "mb_route", type: "line", source: "mb_route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1f6fff", "line-width": 5 } });
      m.addSource("mb_acc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "mb_acc", type: "fill", source: "mb_acc", paint: { "fill-color": "#ffd23f", "fill-opacity": 0.08 } });
      m.addSource("mb_km", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "mb_km", type: "symbol", source: "mb_km",
        layout: { "text-field": ["get", "label"], "text-size": 14, "text-font": ["Noto Sans Regular"], "text-allow-overlap": false, "text-padding": 6 },
        paint: { "text-color": "#1f3a8a", "text-halo-color": "#ffffff", "text-halo-width": 2.4 },
      });
      m.addSource("mb_here", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "mb_here", type: "circle", source: "mb_here", paint: { "circle-radius": 8, "circle-color": "#ffd23f", "circle-stroke-color": "#3a2e00", "circle-stroke-width": 2 } });
      m.addSource("mb_pois", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "mb_pois", type: "circle", source: "mb_pois",
        paint: {
          "circle-radius": ["case", ["get", "fav"], 7, 5], "circle-stroke-width": 1, "circle-stroke-color": "#0c0d10",
          "circle-color": ["match", ["get", "cat"], "food", CAT_COLOR.food, "sleep", CAT_COLOR.sleep, "fuel", CAT_COLOR.fuel, "eat", CAT_COLOR.eat, "water", CAT_COLOR.water, "bike", CAT_COLOR.bike, "pharmacy", CAT_COLOR.pharmacy, "spot", CAT_COLOR.spot, "#999"],
        },
      });
      m.on("click", "mb_pois", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) setDetail(pidIndexRef.current.get(id) ?? null);
      });
      // Start / Meta — kropki + etykiety
      m.addSource("mb_ends", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "mb_ends", type: "circle", source: "mb_ends",
        paint: { "circle-radius": 7, "circle-stroke-width": 3, "circle-stroke-color": "#ffffff",
          "circle-color": ["match", ["get", "kind"], "start", "#23c552", "finish", "#ff4d4d", "#23c552"] },
      });
      m.addLayer({
        id: "mb_ends_lbl", type: "symbol", source: "mb_ends",
        layout: { "text-field": ["get", "label"], "text-size": 12, "text-offset": [0, -1.4], "text-anchor": "bottom",
          "text-font": ["Noto Sans Regular"], "text-allow-overlap": true },
        paint: { "text-color": "#ffffff", "text-halo-color": "#0c0d10", "text-halo-width": 2 },
      });
      m.on("click", "mb_km", (e) => {
        const c = (e.features?.[0]?.geometry as GeoJSON.Point)?.coordinates;
        if (c) setHere(c[1], c[0]);
      });
      m.on("click", (e) => {
        if (!m.queryRenderedFeatures(e.point, { layers: ["mb_pois", "mb_km"] }).length) setHere(e.lngLat.lat, e.lngLat.lng);
      });
      setReady(true);
    });
    return () => { m.remove(); map.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ensurePersistence();
    refreshSaved();
    // Wznów ostatnią trasę po reloadzie (iOS lubi ubić kartę na długiej jeździe).
    getMeta("lastRoute").then((last) => { if (last) loadSaved(last); });
    if (!isSupabaseConfigured()) return;
    getSessionEmail().then((mail) => setUserEmail(mail));
    refreshBio();
    const offBio = initBiometricTokenSync();
    // Po zalogowaniu auto-pobierz trasy z chmury do offline.
    const off = onAuthChange(async (ev) => {
      if (ev.type !== "session") return;
      setUserEmail(ev.email);
      if (!ev.email) return;
      try {
        const r = await syncNow();
        await refreshSaved();
        if (r && r.pulled) setStatus(`Zalogowano. Pobrano ${r.pulled} tras do pamięci offline.`);
        else setStatus("Zalogowano. Trasy zsynchronizowane.");
      } catch { /* offline — zsynchronizuje się później */ }
    });
    return () => { off(); offBio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSaved]);

  // Auto-pobieranie miejsc po wczytaniu GPX (flaga ustawiana w onGpx). Stan trasy
  // jest już scommitowany, więc fetch i zapis offline mają poprawną nazwę/trasę.
  useEffect(() => {
    if (wantFetchRef.current && route && pois.length === 0) {
      wantFetchRef.current = false;
      doFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Lekki zrzut stanu jazdy (km + progi alertów) do IndexedDB — przetrwa reload na trasie.
  useEffect(() => {
    if (hereKm == null || !name) return;
    const t = setTimeout(() => {
      const alerted: Record<string, number[]> = {};
      alertedRef.current.forEach((set, id) => { alerted[id] = [...set]; });
      setMeta(`ride:${name}`, JSON.stringify({ km: hereKm, alerted })).catch(() => {});
    }, 8000);
    return () => clearTimeout(t);
  }, [hereKm, name]);

  // przy przełączeniu na mapę: dopasuj rozmiar i dośrodkuj na mojej pozycji
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || mapView !== "map") return;
    setTimeout(() => {
      m.resize(); // mapa była display:none w widoku listy → dopasuj rozmiar i kadr
      const ll = hereLLRef.current;
      if (ll) {
        m.flyTo({ center: [ll.lon, ll.lat], zoom: Math.max(m.getZoom(), 14), duration: 500 });
      } else if (route) {
        const lons = route.pts.map((p) => p.lon), lats = route.pts.map((p) => p.lat);
        m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, duration: 0 });
      }
    }, 80);
  }, [mapView, ready, route]);

  // ---- warstwy: trasa + km ----
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const rsrc = m.getSource("mb_route") as maplibregl.GeoJSONSource | undefined;
    const ksrc = m.getSource("mb_km") as maplibregl.GeoJSONSource | undefined;
    const esrc = m.getSource("mb_ends") as maplibregl.GeoJSONSource | undefined;
    if (route && ds) {
      const coords = route.pts.map((p) => [p.lon, p.lat]);
      rsrc?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
      ksrc?.setData({ type: "FeatureCollection", features: kmMarkerFeatures(ds, totalKm) });
      const a = route.pts[0], b = route.pts[route.pts.length - 1];
      const loop = Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
      esrc?.setData({
        type: "FeatureCollection", features: loop
          ? [{ type: "Feature", properties: { kind: "start", label: "START / META" }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } }]
          : [
              { type: "Feature", properties: { kind: "start", label: "START" }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } },
              { type: "Feature", properties: { kind: "finish", label: "META" }, geometry: { type: "Point", coordinates: [b.lon, b.lat] } },
            ],
      });
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, duration: 0 });
    } else {
      rsrc?.setData({ type: "FeatureCollection", features: [] });
      ksrc?.setData({ type: "FeatureCollection", features: [] });
      esrc?.setData({ type: "FeatureCollection", features: [] });
    }
    bumpOverlays(m);
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
    (m.getSource("mb_pois") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
    bumpOverlays(m);
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
    try {
      const r = parseGPX(await file.text());
      wantFetchRef.current = true; // auto-pobieranie miejsc po wczytaniu (efekt niżej)
      loadRoute(r, file.name.replace(/\.gpx$/i, ""));
    } catch (e: any) { setStatus("Błąd GPX: " + e.message); }
  }
  async function doFetch(resume = false) {
    if (!route || fetching) return;
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    setFetching(true);
    try {
      const res = await fetchPois(
        route,
        { cats: new Set<CatKey>(FETCH_CATS), radiusOther: fetchRadius, signal: ctrl.signal, onProgress: (done, total, found) => setProgress({ done, total, found }) },
        resume ? fetchSessionRef.current ?? undefined : undefined,
      );
      if (ctrl.signal.aborted) { setStatus("Pominięto pobieranie miejsc — możesz je dobrać w menu (Trasa i miejsca → Pobierz miejsca)."); return; }
      fetchSessionRef.current = res.session;
      setPois(res.pois); setGaps(computeGaps(res.pois)); setMissing(res.failed);
      await persistLocal(res.pois, favorites);
      setStatus(res.failed > 0
        ? `${res.pois.length} miejsc — zapisane offline. ${res.failed} paczek nie pobrano: „Dobierz brakujące".`
        : `${res.pois.length} miejsc — zapisane offline. Włącz GPS lub dotknij mapy.`);
    } catch (e: any) {
      setStatus(navigator.onLine
        ? `Nie udało się pobrać miejsc (${e.message}). Trasa jest gotowa — spróbuj ponownie w menu.`
        : "Brak internetu — trasa jest gotowa. Miejsca pobierzesz w menu, gdy będzie sieć.");
    } finally { setFetching(false); setProgress(null); fetchAbortRef.current = null; }
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
    await setMeta("lastRoute", name);
    await refreshSaved();
    pushSoon();
  }
  async function loadSaved(n: string) {
    const sb = await db.bundles.get(n);
    if (!sb) return;
    applyRoute(routeFromBundle(sb.bundle), n, poisFromBundle(sb.bundle), new Set(sb.favorites), sb.bundle.trip ?? null);
    setDs(downsampledFromBundle(sb.bundle));
    await setMeta("lastRoute", n);
    // wznów stan jazdy (km + progi alertów), jeśli zapisany
    try {
      const rs = await getMeta(`ride:${n}`);
      if (rs) {
        const o = JSON.parse(rs);
        if (typeof o.km === "number") { setHereKm(o.km); setStatus(`Wznowiono: ${n} — jesteś na ${o.km.toFixed(1)} km.`); }
        if (o.alerted) alertedRef.current = new Map(Object.entries(o.alerted).map(([id, arr]) => [id, new Set(arr as number[])]));
      } else {
        setStatus(`Wczytano offline: ${n} (${sb.bundle.pois.length} miejsc).`);
      }
    } catch { setStatus(`Wczytano offline: ${n} (${sb.bundle.pois.length} miejsc).`); }
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
      const isFav = favorites.has(id);
      const isPlan = planPidsRef.current.has(id);
      if (!isFav && !isPlan) continue;
      const delta = ((d) => (d < -0.05 && route.isLoop ? d + totalKm : d))(p.km - km);
      if (delta <= 0) continue;
      let set = alertedRef.current.get(id);
      if (!set) { set = new Set(); alertedRef.current.set(id, set); }
      const th = crossedThreshold(delta, set);
      if (th != null) {
        set.add(th);
        const mark = isFav ? "★" : "📋";
        rideAlert(`${mark} ${p.name}`, `za ${delta.toFixed(1)} km (${CATS[p.cats[0]].label.toLowerCase()})`);
        setStatus(`🔔 ${mark} ${p.name} — za ${delta.toFixed(1)} km`);
      }
    }
  }
  function setHere(lat: number, lon: number, fromGPS = false, accuracy = 0) {
    if (!ds || !route) { setStatus("Najpierw wczytaj trasę."); return; }
    if (fromGPS) {
      if (accuracy > 80) { setStatus(`Słaby sygnał GPS (±${Math.round(accuracy)} m) — czekam na lepszy fix.`); return; }
      const s = smoothRef.current; // lekki low-pass na pozycji
      if (s) { lat = s.lat * 0.6 + lat * 0.4; lon = s.lon * 0.6 + lon * 0.4; }
      smoothRef.current = { lat, lon };
    } else {
      smoothRef.current = null; // tapnięcie w mapę = świadomy skok, bez wygładzania
    }
    // okno ±4 km wokół ostatniego km (anty-„teleport" na pętli); pierwszy fix = globalnie
    const win = fromGPS && hereKm != null ? { km: hereKm, winKm: 4 } : undefined;
    const pr = project(ds, lat, lon, win);
    let km = pr.km;
    if (fromGPS && hereKm != null && !route.isLoop) {
      const back = hereKm - km;
      if (back > 0 && back < 0.5) km = hereKm; // drobny jitter nie cofa licznika
    }
    setHereKm(km); setHereOff(pr.detourM);
    hereLLRef.current = { lat, lon };
    const m = map.current;
    (m?.getSource("mb_here") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } });
    (m?.getSource("mb_acc") as maplibregl.GeoJSONSource | undefined)?.setData(
      accuracy > 0 ? circlePolygon(lat, lon, accuracy) : { type: "FeatureCollection", features: [] },
    );
    // kamera: pierwszy fix / zoom-out → przybliż na mnie; potem płynnie podążaj
    if (m) {
      if (m.getZoom() < 13) m.flyTo({ center: [lon, lat], zoom: 14, duration: 600 });
      else m.panTo([lon, lat], { duration: 500 });
    }
    if (fromGPS) checkFavAlerts(km);
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
  async function refreshBio() {
    const sup = await biometricSupported();
    setBioSupported(sup);
    setBioEnabled(sup ? (await biometricInfo()).enabled : false);
  }
  async function doBioEnable() {
    setAuthBusy(true); setAuthErr(""); setAuthMsg("");
    try { await enableBiometric(); setBioEnabled(true); setAuthMsg("Biometria włączona — następnym razem zalogujesz się odciskiem/twarzą."); }
    catch (e: any) { setAuthErr(e?.message || "Nie udało się włączyć biometrii."); }
    finally { setAuthBusy(false); }
  }
  async function doBioDisable() {
    await disableBiometric(); setBioEnabled(false); setAuthMsg("Biometria wyłączona na tym urządzeniu.");
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
  // --- Planner --- (UI w PlannerSheet; tu tylko zapis stanu)
  function applyTrip(next: TripState) {
    setTrip(next); persistLocal(pois, favorites, next);
  }

  // Pre-fetch kafelków mapy dla korytarza trasy (offline w terenie).
  async function doPrewarm() {
    if (!ds || !PMTILES_URL || prewarming) return;
    setPrewarming(true);
    setMenuOpen(false);
    try {
      const r = await prewarmCorridor(PMTILES_URL, ds, (done, total) => setStatus(`Pobieram mapę offline… ${done}/${total} kafelków`));
      setStatus(`Mapa offline gotowa (${r.total} kafelków${r.capped ? ", próbka — zmniejsz zoom źródła dla pełnego pokrycia" : ""}).`);
    } catch (e: any) {
      setStatus("Pobieranie mapy nieudane: " + e.message);
    } finally {
      setPrewarming(false);
    }
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
  const nextWater = useMemo(
    () => (hereKm != null && route && active.has("water") ? nextOfCat(pois, "water", hereKm, route.isLoop, totalKm) : null),
    [pois, hereKm, route, totalKm, active],
  );
  const waterGapWarn = useMemo(
    () => (hereKm != null && active.has("water") ? gapBeforeStretch(gapsByCat(pois, "water", 25), hereKm, range) : null),
    [pois, hereKm, range, active],
  );
  const favPois = useMemo(() => pois.filter((p) => favorites.has(pid(p))), [pois, favorites]);

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

  // Przystanki z planu (obiad/nocleg/własne) — „aktywny plan": podświetlenie + alerty.
  const planPids = useMemo(() => {
    const s = new Set<string>();
    if (!trip || !ds || !pois.length) return s;
    for (const d of planTrip(ds, pois, totalKm, trip.cfg, favorites, trip.overrides, trip.extras)) {
      if (d.lunch) s.add(pid(d.lunch.poi));
      if (d.sleep) s.add(pid(d.sleep.poi));
      for (const st of d.stops) s.add(pid(st.poi));
    }
    return s;
  }, [trip, ds, pois, totalKm, favorites]);
  useEffect(() => { planPidsRef.current = planPids; }, [planPids]);
  const planAhead = useMemo(() => {
    if (hereKm == null || !route || !planPids.size) return null;
    return pois
      .filter((p) => planPids.has(pid(p)))
      .map((p) => ({ p, delta: aheadDelta(p.km, hereKm, route.isLoop, totalKm) }))
      .filter((x) => x.delta > 0.02)
      .sort((a, b) => a.delta - b.delta)[0] ?? null;
  }, [pois, planPids, hereKm, route, totalKm]);
  const offRoute = hereOff > 250;

  const savedEntry = saved.find((s) => s.name === name);

  return (
    <div className="layout">
      <header className="bar">
        {isSupabaseConfigured() && (userEmail ? (
          <span className="avatar" title={`Zalogowano: ${userEmail}`} aria-label={`Zalogowano: ${userEmail}`}>
            {(userEmail.trim()[0] || "?").toUpperCase()}
            <span className="avatar-dot" />
          </span>
        ) : (
          <span className="avatar off" title="Niezalogowany — tryb offline" aria-label="Niezalogowany — tryb offline">
            👤<span className="avatar-dot off" />
          </span>
        ))}
        {!fetching && (
          <span className={"state " + (route ? "ok" : "warn")}>
            {route ? `${name}${pois.length ? ` · ${pois.length}` : ""}` : "⚠ brak trasy"}
          </span>
        )}
        {fetching && <span className="fetching-lbl"><span className="fetchdot" /> Pobiera{progress ? `… ${progress.done}/${progress.total} · ${progress.found}` : "…"}</span>}
        <span className="spacer" />
        <button className="iconbtn" aria-label="Menu" onClick={() => setMenuOpen(true)}>☰</button>
      </header>

      <div className="quick">
        {missing > 0 && <button className="chip refetch" disabled={fetching} onClick={() => doFetch(true)}>⬇ Dobierz brakujące ({missing})</button>}
        <button className={"chip gps " + (gpsOn ? "on" : "")} onClick={toggleGps}>{gpsOn ? "● GPS" : "📍 Śledź GPS"}</button>
        <button className="chip ride-btn" title="Tryb jazdy — duży ekran" onClick={() => setRideMode(true)}>🚴 Jazda</button>
        <button className="chip plan" onClick={() => setShowPlan(true)}>📑 Planer</button>
      </div>

      <div className="filterbar">
        <div className="filters">
          <button className={"chip fav " + (favOnly ? "on" : "")} aria-label="Tylko ulubione" title="Pokaż tylko ulubione" onClick={() => { const nv = !favOnly; setFavOnly(nv); if (nv && favorites.size === 0) setStatus("Filtr ulubionych: nic jeszcze nie oznaczono — kliknij gwiazdkę przy miejscu na liście."); }}>★</button>
          <button className={"chip " + (open24Only ? "on" : "")} title="Tylko czynne całodobowo" onClick={() => setOpen24Only((v) => !v)}>🌙 24h</button>
          {FILTER_CATS.map((c) => (
            <button key={c} className={"chip cat " + (active.has(c) ? "" : "off")} onClick={() => toggleCat(c)}>
              <span className="dot" style={{ background: CAT_COLOR[c] }} />{CATS[c].label}
            </button>
          ))}
        </div>
        <div className="filters-fade" aria-hidden="true" />
      </div>

      {(() => {
        const err = /(błąd|nieudan|niedostępn|nie znalaz|nie jest plik|padł|odrzuc|wymaga)/i.test(status);
        return <div className={"status " + (err ? "err" : "ok")}>{err ? "⚠ " : "✓ "}{status}</div>;
      })()}

      <div className={"main " + mapView}>
        <div ref={mapDiv} className="map" />
        <aside className="panel">
          {hereKm != null && route ? (
            <>
              <div className="here">
                <div className="lab">{offRoute ? "najbliżej trasy" : "jesteś na"}</div>
                <div className="km">{hereKm.toFixed(1)}<small> / {totalKm.toFixed(0)} km</small></div>
                <div className="meta">
                  {(totalKm - hereKm).toFixed(1)} km do końca
                  {time.length ? ` · ⏱ ≈ ${fmtDur(timeAtKm(ds!, time, totalKm)! - timeAtKm(ds!, time, hereKm)!)}` : ""}
                  {!offRoute && ` · ${fmtDist(hereOff)} od trasy`}
                </div>
              </div>
              {offRoute && <div className="warn">⚠️ Jesteś <b>{fmtDist(hereOff)}</b> od trasy — wygląda, że jesteś poza nią. Pokazany km to najbliższy punkt trasy.</div>}
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
              {ds && <ElevationProfile ds={ds} totalKm={totalKm} cur={hereKm} />}
              {shopWarn && shopWarn.delta > 20 && <div className="warn">⚠️ Następny sklep za <b>{shopWarn.delta.toFixed(1)} km</b> ({shopWarn.p.name}). Zatankuj zapasy.</div>}
              {gapWarn && <div className="warn">⚠️ Za <b>{gapWarn.kmTo.toFixed(1)} km</b> ostatni sklep przed odcinkiem <b>{gapWarn.gapKm.toFixed(0)} km bez zaopatrzenia</b>.</div>}
              {nextWater && nextWater.delta > 25 && <div className="warn water">💧 Następna woda dopiero za <b>{nextWater.delta.toFixed(1)} km</b>. Uzupełnij wcześniej.</div>}
              {waterGapWarn && <div className="warn water">💧 Za <b>{waterGapWarn.kmTo.toFixed(1)} km</b> ostatnia woda przed odcinkiem <b>{waterGapWarn.gapKm.toFixed(0)} km bez wody</b>.</div>}
              {favAhead && <div className="warn fav">★ Do ulubionego: <b>{favAhead.p.name}</b> za <b>{favAhead.delta.toFixed(1)} km</b>{(() => { const e = etaAheadDelta(ds!, time, favAhead.delta, hereKm!, totalKm); return e != null ? ` (⏱ ${fmtDur(e)})` : ""; })()}.</div>}
              {planAhead && <div className="warn plan">📋 Następny w planie: <b>{planAhead.p.name}</b> za <b>{planAhead.delta.toFixed(1)} km</b>{(() => { const e = etaAheadDelta(ds!, time, planAhead.delta, hereKm!, totalKm); return e != null ? ` (⏱ ${fmtDur(e)})` : ""; })()}.</div>}
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
                        <span className="nm">{planPids.has(id) ? "📋 " : ""}{p.name}<br /><small>{eta != null ? `⏱ ${fmtDur(eta)} · ` : ""}{fmtDist(p.detourM)} {p.side}{is24h(p.tags) ? " · 🌙 24h" : ""}</small></span>
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
                  <b>Trasa</b><br /><small>{route ? `${name} · ${totalKm.toFixed(0)} km` : "Wybierz pobraną mapę albo wczytaj nowy ślad GPX."}</small>
                  {!route && saved.length > 0 && (
                    <div className="omaps">
                      <div className="omaps-h">🗺️ Pobrane mapy offline<small>dotknij, by otworzyć</small></div>
                      {saved.map((s) => (
                        <button key={s.name} className="omap" onClick={() => loadSaved(s.name)}>
                          <span className="omap-nm">{s.name}</span>
                          <span className="omap-meta">{s.bundle.total_km.toFixed(0)} km · {s.bundle.pois.length} miejsc</span>
                          <span className="omap-go">›</span>
                        </button>
                      ))}
                      <div className="omaps-or">— albo wczytaj nową trasę —</div>
                    </div>
                  )}
                  <label className="gbtn"><input hidden type="file" accept=".gpx" onChange={(e) => e.target.files?.[0] && onGpx(e.target.files[0])} />{route ? "Zmień trasę (.gpx)" : "Wczytaj trasę (.gpx)"}</label>
                </div>
              </div>
              <div className={"gstep " + (route && pois.length ? "active" : "")}>
                <span className="gn">2</span>
                <div>
                  {route && !pois.length && !fetching ? (
                    <>
                      <b>Miejsca</b><br /><small>Nie pobrano miejsc wzdłuż trasy. Pobierz je, by zobaczyć noclegi, sklepy, wodę i jedzenie.</small>
                      <button className="gbtn" onClick={() => doFetch()}>⬇ Pobierz miejsca</button>
                    </>
                  ) : (
                    <>
                      <b>Pozycja</b><br /><small>{pois.length ? `${pois.length} miejsc wzdłuż trasy. Włącz GPS albo dotknij mapy, by zobaczyć co masz przed sobą.` : "Włącz GPS albo dotknij mapy, by zobaczyć co masz przed sobą."}</small>
                      {route && pois.length > 0 && <button className="gbtn" onClick={toggleGps}>{gpsOn ? "● GPS włączony" : "📍 Śledź GPS"}</button>}
                    </>
                  )}
                </div>
              </div>
              {route && ds && <ElevationProfile ds={ds} totalKm={totalKm} cur={null} />}
              {pois.length > 0 && (
                <ul className="list">
                  {pois.filter(visible).map((p) => {
                    const id = pid(p);
                    return (
                      <li key={id} onClick={() => setDetail(p)}>
                        <span className="dot" style={{ background: CAT_COLOR[p.cats[0]] }} />
                        <span className="nm">{p.name}<br /><small>km {p.km.toFixed(1)} · {fmtDist(p.detourM)} {p.side}{is24h(p.tags) ? " · 🌙 24h" : ""}</small></span>
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

        <button className="msecbtn" onClick={() => setMenuSec(menuSec === "route" ? null : "route")}>
          <span>🧭 Trasa i miejsca</span><span className="chev">{menuSec === "route" ? "▾" : "▸"}</span>
        </button>
        {menuSec === "route" && <div className="msecbody">
          <label className="mbtn"><input hidden type="file" accept=".gpx" onChange={(e) => { if (e.target.files?.[0]) { onGpx(e.target.files[0]); setMenuOpen(false); } }} />📂 Wczytaj trasę (.gpx)</label>
          <label className="mrow">Promień szukania (sklepy/jedzenie/paliwo)
            <select value={fetchRadius} onChange={(e) => setFetchRadius(+e.target.value)}>
              <option value={100}>100 m</option><option value={300}>300 m</option><option value={500}>500 m</option>
              <option value={1000}>1 km</option><option value={2000}>2 km</option>
            </select>
          </label>
          <div className="mhelp">Noclegi szukane zawsze do 5 km. Po zmianie kliknij „Pobierz miejsca".</div>
          <button className="mbtn go" disabled={!route || fetching} onClick={() => { doFetch(); setMenuOpen(false); }}>{fetching ? "Pobieram…" : "⬇ Pobierz miejsca"}</button>
          {savedEntry && <div className="mnote">💾 Zapisane offline ({savedEntry.bundle.pois.length} miejsc){savedEntry.dirty ? " · do wysłania" : userEmail ? " · w chmurze" : ""}</div>}
          {PMTILES_URL && <button className="mbtn" disabled={!route || prewarming} onClick={doPrewarm}>{prewarming ? "Pobieram mapę…" : "🗺 Pobierz mapę offline (dla trasy)"}</button>}
          <select className="mbtn" value="" onChange={(e) => { if (e.target.value) { loadSaved(e.target.value); setMenuOpen(false); } }}>
            <option value="">📂 Wczytaj zapisaną offline…</option>
            {saved.map((s) => <option key={s.name} value={s.name}>{s.name} — {s.bundle.pois.length} miejsc{s.dirty ? " *" : ""}</option>)}
          </select>
          {name && savedEntry && <>
            <button className="mbtn" onClick={() => renameSaved(name)}>✏ Zmień nazwę</button>
            <button className="mbtn" onClick={() => removeSaved(name)}>🗑 Usuń bieżącą</button>
          </>}
          <button className="mbtn" disabled={!route} onClick={() => { exportFile(); setMenuOpen(false); }}>⤓ Eksportuj do pliku (.json)</button>
          <label className="mbtn"><input hidden type="file" accept=".json" onChange={(e) => { if (e.target.files?.[0]) { importFile(e.target.files[0]); setMenuOpen(false); } }} />📥 Wczytaj z pliku (.json)</label>
        </div>}

        {isSupabaseConfigured() && <>
          <button className="msecbtn" onClick={() => setMenuSec(menuSec === "account" ? null : "account")}>
            <span>👤 Konto {userEmail ? "· zalogowany" : "· offline"}</span><span className="chev">{menuSec === "account" ? "▾" : "▸"}</span>
          </button>
          {menuSec === "account" && <div className="msecbody">
            {userEmail ? <>
              <div className="mnote">{userEmail}</div>
              <div className="mhelp">Trasy są w chmurze. Na innym urządzeniu zaloguj się tym samym kontem — pobiorą się automatycznie do pamięci offline.</div>
              <button className="mbtn" onClick={doSync}>⟳ Synchronizuj teraz</button>
              {bioSupported && (bioEnabled
                ? <button className="mbtn" onClick={doBioDisable}>🔒 Wyłącz logowanie biometrią</button>
                : <button className="mbtn" onClick={doBioEnable} disabled={authBusy}>🔒 Włącz logowanie biometrią</button>)}
              {authMsg && <div className="lok">{authMsg}</div>}
              {authErr && <div className="lerr">⚠ {authErr}</div>}
              <button className="mbtn" onClick={() => { setMenuOpen(false); setUserEmail(null); setStatus("Wylogowano. Trasy zostają offline na tym urządzeniu."); void signOut(); }}>Wyloguj</button>
            </> : <>
              <div className="mhelp">Jesteś w trybie offline — apka działa w pełni bez konta na tym urządzeniu. Zaloguj się, by mieć te same trasy na komputerze i w telefonie.</div>
              {onWantLogin && <button className="mbtn go" onClick={() => { setMenuOpen(false); onWantLogin(); }}>👤 Zaloguj / załóż konto</button>}
            </>}
          </div>}
        </>}

        <button className="msecbtn" onClick={() => setMenuSec(menuSec === "settings" ? null : "settings")}>
          <span>⚙️ Ustawienia</span><span className="chev">{menuSec === "settings" ? "▾" : "▸"}</span>
        </button>
        {menuSec === "settings" && <div className="msecbody">
          <div className="mrowlab">Motyw</div>
          <div className="seg">
            <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>🌙 Ciemny</button>
            <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>☀️ Jasny</button>
          </div>
          <button className={"mbtn " + (lowPower ? "go" : "")} onClick={() => setLowPower((v) => !v)}>🔋 Oszczędzanie baterii: {lowPower ? "włączone" : "wyłączone"}</button>
          <div className="mhelp">Rzadszy odczyt GPS i niższa dokładność — bateria starcza znacznie dłużej na całodniowej trasie. Włącz, gdy nie potrzebujesz pozycji co sekundę.</div>
          <label className="mrow">Zasięg listy „przede mną"
            <select value={range} onChange={(e) => setRange(+e.target.value)}>
              <option value={50}>50 km</option><option value={100}>100 km</option><option value={200}>200 km</option>
            </select>
          </label>
        </div>}

        <div className="msec">Pomoc</div>
        <button className="mbtn tint-sky" onClick={() => { setMenuOpen(false); navigate("/pomoc"); }}>📖 Instrukcja obsługi</button>
        <button className="mbtn tint-sky" onClick={() => { setShowHelp(true); setMenuOpen(false); }}>❔ Jak korzystać (skrót)</button>
        <button className="mbtn tint-indigo" onClick={() => { setShowAbout(true); setMenuOpen(false); }}>ℹ️ O MiroBike</button>
        <button className="mbtn tint-violet" onClick={doShare}>📤 Poleć aplikację</button>
        <a className="mbtn solid-amber" href={SUPPORT_URL} target="_blank" rel="noopener">☕ Postaw mi kawę</a>
        <a className="mbtn tint-emerald" href="mailto:contact@grapevest.pl?subject=MiroBike">✉ Kontakt</a>
      </div>

      {detail && (
        <DetailSheet poi={detail} onClose={() => { setDetail(null); if (detailFromPlan) { setDetailFromPlan(false); setShowPlan(true); } }} hereKm={hereKm} isLoop={route?.isLoop ?? false}
          ds={ds} time={time} totalKm={totalKm} favorites={favorites} onToggleFav={toggleFav} />
      )}
      {showPlan && (
        <PlannerSheet route={!!route} pois={pois} ds={ds} totalKm={totalKm} favorites={favorites} trip={trip}
          onClose={() => setShowPlan(false)} onApply={applyTrip} onOpenDetail={(p) => { setShowPlan(false); setDetailFromPlan(true); setDetail(p); }} />
      )}
      {showHelp && <HelpSheet onClose={() => setShowHelp(false)} />}
      {showAbout && <AboutSheet onClose={() => setShowAbout(false)} />}

      {fetching && (
        <div className="fetch-overlay">
          <div className="fetch-card">
            <div className="fetch-spin" />
            <div className="fetch-title">Przygotowuję trasę…</div>
            <div className="fetch-sub">
              Pobieram miejsca wzdłuż trasy{progress ? <> — <b>{progress.found}</b> znalezionych · {progress.done}/{progress.total} fragmentów</> : "…"}
            </div>
            <button className="fetch-skip" onClick={() => fetchAbortRef.current?.abort()}>Pomiń</button>
          </div>
        </div>
      )}

      {rideMode && (
        <div className="ride" onClick={() => setRideMode(false)}>
          {hereKm != null && route ? (
            <>
              <div className="rkm">{hereKm.toFixed(1)}<span> km</span></div>
              <div className="rsub">{(totalKm - hereKm).toFixed(0)} km do końca{time.length ? ` · ⏱ ≈ ${fmtDur(timeAtKm(ds!, time, totalKm)! - timeAtKm(ds!, time, hereKm)!)}` : ""}</div>
              <div className="rcells">
                {nextByCat.slice(0, 4).map(({ c, n }) => (
                  <div className="rcell" key={c}>
                    <div className="rlab" style={{ color: CAT_COLOR[c] }}>{CATS[c].label}</div>
                    <div className="rval">{n ? `${n.delta.toFixed(1)} km` : "—"}</div>
                    <div className="rname">{n ? n.p.name : "brak"}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rsub">Włącz GPS albo dotknij mapy, by zobaczyć pozycję.</div>
          )}
          <div className="rhint">dotknij, by wyjść{lowPower ? " · 🔋 oszczędzanie" : ""}</div>
        </div>
      )}
    </div>
  );
}
