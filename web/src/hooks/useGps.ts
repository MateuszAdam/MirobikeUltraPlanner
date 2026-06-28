import { useEffect, useRef, useState } from "react";

interface GpsOpts {
  onFix: (lat: number, lon: number, accuracy: number) => void;
  canTrack: () => boolean; // czy jest wczytana trasa
  setStatus: (s: string) => void;
}

/** Śledzenie GPS + Wake Lock (z odzyskiwaniem po wygaszeniu ekranu). */
export function useGps(opts: GpsOpts) {
  const [gpsOn, setGpsOn] = useState(false);
  const watchId = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release?: () => Promise<void> } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && watchId.current != null) {
        (navigator as any).wakeLock?.request("screen").then((s: any) => { wakeLockRef.current = s; }).catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  async function toggleGps() {
    const { canTrack, setStatus } = optsRef.current;
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setGpsOn(false);
      try { await wakeLockRef.current?.release?.(); } catch { /* ignore */ }
      wakeLockRef.current = null;
      setStatus("GPS zatrzymany.");
      return;
    }
    if (!("geolocation" in navigator)) { setStatus("Ta przeglądarka nie udostępnia GPS."); return; }
    if (!canTrack()) { setStatus("Najpierw wczytaj trasę (krok 1), potem włącz GPS."); return; }
    setGpsOn(true);
    setStatus("Szukam pozycji GPS… zezwól na dostęp do lokalizacji.");
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch { /* ignore */ }
    try { wakeLockRef.current = await (navigator as any).wakeLock?.request("screen"); } catch { /* brak wsparcia */ }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => optsRef.current.onFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy || 0),
      (e) => { setGpsOn(false); setStatus("GPS niedostępny: " + e.message + " (wymaga HTTPS i zgody na lokalizację)."); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }

  return { gpsOn, toggleGps };
}
