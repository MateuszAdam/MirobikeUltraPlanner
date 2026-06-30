import { useEffect, useState, type ReactNode } from "react";
import App from "./App";
import { AuthPanel } from "./components/AuthPanel";
import { HelpPage } from "./components/HelpPage";
import { navigate } from "./lib/nav";
import { isSupabaseConfigured } from "./lib/supabase";
import { getSessionEmail, onAuthChange } from "./lib/sync";
import { biometricSupported, biometricInfo, biometricUnlock } from "./lib/biometric";

const LOCAL_KEY = "mirobike.localMode";
const getLocal = () => { try { return localStorage.getItem(LOCAL_KEY) === "1"; } catch { return false; } };
const setLocal = (v: boolean) => { try { v ? localStorage.setItem(LOCAL_KEY, "1") : localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ } };

/**
 * Brama wejścia (AuthGate):
 *   1. sesja → aplikacja
 *   2. tryb lokalny (localMode) → aplikacja, sync wyłączony
 *   3. inaczej → AuthPanel (landing/logowanie)
 * Recovery (powrót z linku resetu) wymusza ekran „Ustaw nowe hasło" mimo sesji.
 * Gdy Supabase nie jest skonfigurowane — zawsze aplikacja (logowanie niemożliwe).
 */
export default function Root() {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(!configured);
  const [email, setEmail] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(getLocal());
  const [recovery, setRecovery] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [path, setPath] = useState(() => window.location.pathname);

  // Reaguj na zmianę adresu (przyciski wstecz/dalej + nasza navigate()).
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!configured) return;
    // Recovery / signup z URL (?type=recovery) — zanim Supabase przetworzy hash.
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "recovery") setRecovery(true);

    getSessionEmail().then((e) => { setEmail(e); setReady(true); });

    (async () => {
      if (await biometricSupported()) setBioEnabled((await biometricInfo()).enabled);
    })();

    const off = onAuthChange((ev) => {
      if (ev.type === "recovery") { setRecovery(true); return; }
      setEmail(ev.email);
      if (ev.email) { setLocal(false); setLocalMode(false); }
    });
    return off;
  }, [configured]);

  function enterGuest() { setLocal(true); setLocalMode(true); }
  function wantLogin() { setLocal(false); setLocalMode(false); }
  function recoveryDone() {
    setRecovery(false);
    // wyczyść ?type=recovery z adresu
    try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
  }
  async function onBioUnlock() {
    await biometricUnlock(); // sukces → onAuthChange ustawi email i przełączy na aplikację
  }

  if (!ready) return <div className="boot" />;

  let screen: ReactNode;
  if (configured && recovery) {
    // recovery zawsze pokazuje ekran ustawiania hasła
    screen = <AuthPanel recovery onGuest={enterGuest} onRecoveryDone={recoveryDone} bioEnabled={bioEnabled} onBioUnlock={onBioUnlock} />;
  } else if (!configured || email || localMode) {
    // zalogowany lub tryb lokalny lub brak Supabase → aplikacja
    screen = <App localMode={!email} onWantLogin={configured ? wantLogin : undefined} />;
  } else {
    // brak sesji, brak trybu lokalnego → landing
    screen = <AuthPanel recovery={false} onGuest={enterGuest} onRecoveryDone={recoveryDone} bioEnabled={bioEnabled} onBioUnlock={onBioUnlock} />;
  }

  // „/pomoc" — pełna instrukcja jako nakładka nad bieżącym ekranem (stan aplikacji zachowany)
  const showHelp = path === "/pomoc" || path === "/pomoc/";
  return <>{screen}{showHelp && <HelpPage onClose={() => navigate("/")} />}</>;
}
