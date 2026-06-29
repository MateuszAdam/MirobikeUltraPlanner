import { getSupabase, isSupabaseConfigured } from "./supabase";
import { getMeta, setMeta, delMeta } from "./db";

/**
 * „Logowanie biometrią" (Face ID / Touch ID / Windows Hello) bez zmian w backendzie.
 *
 * Idea: po pierwszym zalogowaniu hasłem zapisujemy lokalnie (IndexedDB) token
 * odświeżania sesji Supabase, zabezpieczony bramką WebAuthn z platformowym
 * uwierzytelniaczem (czyli biometrią urządzenia). Przy kolejnym wejściu
 * `biometricUnlock()` prosi o biometrię — po sukcesie wymienia zapisany token na
 * nową sesję (`refreshSession`) i loguje w kontekście PWA, bez przekierowań.
 *
 * Uwaga bezpieczeństwa: token leży w IndexedDB, a WebAuthn jest tu bramką UX na
 * urządzeniu (nie szyfruje tokenu kryptograficznie). To świadomy kompromis —
 * apka nie trzyma danych wrażliwych (POI są publiczne, brak E2E). Token jest
 * rotowany przy każdym odświeżeniu sesji (patrz initBiometricTokenSync).
 */

const KEY = "biometric:v1";

interface BioStore {
  credId: string; // base64url rawId poświadczenia WebAuthn
  email: string;
  refreshToken: string;
}

function b64urlFromBuf(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bufFromB64url(s: string): ArrayBuffer {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function read(): Promise<BioStore | null> {
  const raw = await getMeta(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as BioStore; } catch { return null; }
}

/** Czy urządzenie ma platformowy uwierzytelniacz (biometrię) i WebAuthn. */
export async function biometricSupported(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Stan: czy włączono biometrię na tym urządzeniu (+ dla jakiego maila). */
export async function biometricInfo(): Promise<{ enabled: boolean; email?: string }> {
  const s = await read();
  return s ? { enabled: true, email: s.email } : { enabled: false };
}

/** Włącza biometrię dla aktualnie zalogowanego użytkownika (wymaga aktywnej sesji). */
export async function enableBiometric(): Promise<void> {
  const { data } = await getSupabase().auth.getSession();
  const session = data.session;
  if (!session?.refresh_token || !session.user?.email) throw new Error("Najpierw zaloguj się hasłem.");
  const email = session.user.email;

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: "MiroBike", id: location.hostname },
      user: { id: rand(16), name: email, displayName: email },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Nie udało się utworzyć poświadczenia biometrycznego.");

  const store: BioStore = { credId: b64urlFromBuf(cred.rawId), email, refreshToken: session.refresh_token };
  await setMeta(KEY, JSON.stringify(store));
}

/** Wyłącza biometrię (usuwa zapisany token z urządzenia). */
export async function disableBiometric(): Promise<void> {
  await delMeta(KEY);
}

/**
 * Prosi o biometrię i loguje, wymieniając zapisany refresh token na nową sesję.
 * Zwraca e-mail po sukcesie. Rzuca przy odmowie biometrii lub wygaśnięciu tokenu.
 */
export async function biometricUnlock(): Promise<string> {
  const s = await read();
  if (!s) throw new Error("Biometria nie jest włączona na tym urządzeniu.");

  // Bramka biometryczna — sukces get() oznacza pomyślną weryfikację na urządzeniu.
  await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      allowCredentials: [{ id: bufFromB64url(s.credId), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });

  const { data, error } = await getSupabase().auth.refreshSession({ refresh_token: s.refreshToken });
  if (error || !data.session) {
    // token wygasł/odwołany — wyczyść, każ zalogować się hasłem
    await disableBiometric();
    throw new Error("Sesja wygasła — zaloguj się hasłem i włącz biometrię ponownie.");
  }
  // zapisz nowy (zrotowany) token
  await setMeta(KEY, JSON.stringify({ ...s, refreshToken: data.session.refresh_token }));
  return data.session.user?.email ?? s.email;
}

/**
 * Utrzymuje zapisany refresh token w zgodzie z rotacją Supabase. Po każdym
 * odświeżeniu/zalogowaniu aktualizuje token w IndexedDB, by biometria działała
 * przy następnym wejściu. Wołane raz na starcie. Zwraca funkcję odpinającą.
 */
export function initBiometricTokenSync(): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const { data } = getSupabase().auth.onAuthStateChange(async (event, session) => {
    if (!session?.refresh_token) return;
    if (event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
    const s = await read();
    if (s && s.email === session.user?.email) {
      await setMeta(KEY, JSON.stringify({ ...s, refreshToken: session.refresh_token }));
    }
  });
  return () => data.subscription.unsubscribe();
}
