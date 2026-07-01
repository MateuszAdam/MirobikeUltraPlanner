import { useSyncExternalStore } from "react";

export type Lang = "pl" | "en" | "de";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "pl", label: "PL" },
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
];

const KEY = "mirobike.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY) as Lang | null;
    if (saved && ["pl", "en", "de"].includes(saved)) return saved;
  } catch { /* brak localStorage */ }
  return "pl"; // domyślnie polski
}

let current: Lang = initialLang();
const subs = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function setLang(l: Lang): void {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.lang = l;
  subs.forEach((f) => f());
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

type Vars = Record<string, string | number>;
function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const s = (DICT[lang] as Record<string, string>)[key] ?? (DICT.pl as Record<string, string>)[key] ?? key;
  return interpolate(s, vars);
}

/** Bezkontekstowy tłumacz (poza Reactem). */
export function t(key: string, vars?: Vars): string {
  return translate(current, key, vars);
}

/** Hook: re-renderuje przy zmianie języka. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, () => current, () => current);
  return { lang, setLang, t: (key: string, vars?: Vars) => translate(lang, key, vars) };
}

// ——— Słowniki ———
const DICT: Record<Lang, Record<string, string>> = {
  pl: {
    "eyebrow": "Planer ultra · offline",
    "thesis.lead": "Wiedz, gdzie kupisz wodę i jedzenie",
    "thesis.rest": " — zanim wjedziesz w ciemność. Trasa, sklepy i luki w jednej paczce offline.",
    "acct.title": "Po co konto?",
    "acct.free": "Aplikacja działa w pełni bez konta — trasy i paczki są offline na tym urządzeniu.",
    "acct.sync": "Konto dodaje synchronizację między komputerem a telefonem i kopię w chmurze, gdy zmienisz sprzęt.",
    "tab.login": "Logowanie",
    "tab.register": "Rejestracja",
    "login.title": "Zaloguj się",
    "login.sub": "Wróć do swoich tras na każdym urządzeniu.",
    "register.title": "Załóż konto",
    "register.sub": "Żeby synchronizować trasy z komputera na telefon.",
    "reset.title": "Zresetuj hasło",
    "reset.sub": "Wyślemy link do ustawienia nowego hasła.",
    "newpass.title": "Ustaw nowe hasło",
    "newpass.sub": "Wpisz nowe hasło do swojego konta.",
    "field.email": "E-mail",
    "field.password": "Hasło",
    "field.newpass": "Nowe hasło",
    "field.repeat": "Powtórz hasło",
    "ph.password.min": "min. 8 znaków",
    "btn.login": "Zaloguj się",
    "btn.register": "Załóż konto",
    "btn.reset": "Wyślij link resetujący",
    "btn.setpass": "Ustaw hasło",
    "btn.loading": "Chwila…",
    "btn.bio": "Zaloguj biometrią",
    "bio.or": "lub e-mailem",
    "link.forgot": "Nie pamiętasz hasła?",
    "link.back": "← Wróć do logowania",
    "row.new": "Nowy tutaj?",
    "row.have": "Masz już konto?",
    "link.register": "Załóż konto",
    "link.login": "Zaloguj się",
    "hint.pass8": "Hasło musi mieć co najmniej 8 znaków.",
    "err.email": "Podaj poprawny adres e-mail.",
    "err.pass8": "Hasło ma co najmniej 8 znaków.",
    "err.mismatch": "Hasła nie są takie same.",
    "err.invalidLogin": "Błędny e-mail lub hasło.",
    "err.exists": "Konto z tym e-mailem już istnieje — zaloguj się.",
    "err.generic": "Coś poszło nie tak. Spróbuj ponownie.",
    "err.offline": "Brak połączenia. Sprawdź internet i spróbuj ponownie.",
    "note.registerSent": "Sprawdź skrzynkę — wysłaliśmy link potwierdzający na {email}.",
    "note.resetSent": "Jeśli istnieje konto dla {email}, wysłaliśmy na nie link do zresetowania hasła.",
    "note.passChanged": "Hasło zmienione — jesteś zalogowany tutaj. Jeśli używasz aplikacji z ekranu początkowego, otwórz ją i zaloguj się nowym hasłem (potem możesz włączyć Face ID/Touch ID).",
    "divider.or": "albo",
    "btn.guest": "Korzystaj bez konta",
    "btn.guest.loading": "Wchodzę bez konta…",
    "foot": "Logując się, akceptujesz, że trasy z tego urządzenia trafią do Twojego konta i będą dostępne na innych urządzeniach.",
    "local.sync": "Zaloguj, by synchronizować",
    "local.signin": "Zaloguj",
    "link.guide": "📖 Jak to działa? Zobacz instrukcję",
  },
  en: {
    "eyebrow": "Ultra planner · offline",
    "thesis.lead": "Know where to get water and food",
    "thesis.rest": " — before you ride into the dark. Route, shops and gaps in one offline pack.",
    "acct.title": "Why an account?",
    "acct.free": "The app works fully without an account — routes and packs stay offline on this device.",
    "acct.sync": "An account adds sync between computer and phone, and a cloud backup when you change devices.",
    "tab.login": "Sign in",
    "tab.register": "Sign up",
    "login.title": "Sign in",
    "login.sub": "Get back to your routes on every device.",
    "register.title": "Create account",
    "register.sub": "To sync routes from computer to phone.",
    "reset.title": "Reset password",
    "reset.sub": "We'll send a link to set a new password.",
    "newpass.title": "Set a new password",
    "newpass.sub": "Enter a new password for your account.",
    "field.email": "Email",
    "field.password": "Password",
    "field.newpass": "New password",
    "field.repeat": "Repeat password",
    "ph.password.min": "min. 8 characters",
    "btn.login": "Sign in",
    "btn.register": "Create account",
    "btn.reset": "Send reset link",
    "btn.setpass": "Set password",
    "btn.loading": "One moment…",
    "btn.bio": "Sign in with biometrics",
    "bio.or": "or with email",
    "link.forgot": "Forgot password?",
    "link.back": "← Back to sign in",
    "row.new": "New here?",
    "row.have": "Already have an account?",
    "link.register": "Create account",
    "link.login": "Sign in",
    "hint.pass8": "Password must be at least 8 characters.",
    "err.email": "Enter a valid email address.",
    "err.pass8": "Password is at least 8 characters.",
    "err.mismatch": "Passwords don't match.",
    "err.invalidLogin": "Wrong email or password.",
    "err.exists": "An account with this email already exists — sign in.",
    "err.generic": "Something went wrong. Please try again.",
    "err.offline": "No connection. Check your internet and try again.",
    "note.registerSent": "Check your inbox — we sent a confirmation link to {email}.",
    "note.resetSent": "If an account exists for {email}, we've sent a password reset link.",
    "note.passChanged": "Password changed — you're signed in here. If you use the app from your home screen, open it and sign in with the new password (then you can enable Face ID/Touch ID).",
    "divider.or": "or",
    "btn.guest": "Use without an account",
    "btn.guest.loading": "Entering without an account…",
    "foot": "By signing in, you agree that routes from this device will be added to your account and available on other devices.",
    "local.sync": "Sign in to sync",
    "local.signin": "Sign in",
    "link.guide": "📖 How does it work? Read the guide",
  },
  de: {
    "eyebrow": "Ultra-Planer · offline",
    "thesis.lead": "Wisse, wo es Wasser und Essen gibt",
    "thesis.rest": " — bevor du in die Dunkelheit fährst. Route, Läden und Lücken in einem Offline-Paket.",
    "acct.title": "Wozu ein Konto?",
    "acct.free": "Die App funktioniert komplett ohne Konto — Routen und Pakete bleiben offline auf diesem Gerät.",
    "acct.sync": "Ein Konto bringt Sync zwischen Computer und Handy und ein Cloud-Backup beim Gerätewechsel.",
    "tab.login": "Anmelden",
    "tab.register": "Registrieren",
    "login.title": "Anmelden",
    "login.sub": "Zurück zu deinen Routen auf jedem Gerät.",
    "register.title": "Konto erstellen",
    "register.sub": "Um Routen vom Computer aufs Handy zu synchronisieren.",
    "reset.title": "Passwort zurücksetzen",
    "reset.sub": "Wir senden einen Link zum Setzen eines neuen Passworts.",
    "newpass.title": "Neues Passwort setzen",
    "newpass.sub": "Gib ein neues Passwort für dein Konto ein.",
    "field.email": "E-Mail",
    "field.password": "Passwort",
    "field.newpass": "Neues Passwort",
    "field.repeat": "Passwort wiederholen",
    "ph.password.min": "mind. 8 Zeichen",
    "btn.login": "Anmelden",
    "btn.register": "Konto erstellen",
    "btn.reset": "Reset-Link senden",
    "btn.setpass": "Passwort setzen",
    "btn.loading": "Einen Moment…",
    "btn.bio": "Mit Biometrie anmelden",
    "bio.or": "oder mit E-Mail",
    "link.forgot": "Passwort vergessen?",
    "link.back": "← Zurück zur Anmeldung",
    "row.new": "Neu hier?",
    "row.have": "Schon ein Konto?",
    "link.register": "Konto erstellen",
    "link.login": "Anmelden",
    "hint.pass8": "Das Passwort muss mindestens 8 Zeichen haben.",
    "err.email": "Gib eine gültige E-Mail-Adresse ein.",
    "err.pass8": "Das Passwort hat mindestens 8 Zeichen.",
    "err.mismatch": "Passwörter stimmen nicht überein.",
    "err.invalidLogin": "Falsche E-Mail oder Passwort.",
    "err.exists": "Ein Konto mit dieser E-Mail existiert bereits — melde dich an.",
    "err.generic": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    "err.offline": "Keine Verbindung. Prüfe dein Internet und versuche es erneut.",
    "note.registerSent": "Prüfe dein Postfach — wir haben einen Bestätigungslink an {email} gesendet.",
    "note.resetSent": "Falls ein Konto für {email} existiert, haben wir einen Link zum Zurücksetzen gesendet.",
    "note.passChanged": "Passwort geändert — du bist hier angemeldet. Wenn du die App vom Startbildschirm nutzt, öffne sie und melde dich mit dem neuen Passwort an (danach kannst du Face ID/Touch ID aktivieren).",
    "divider.or": "oder",
    "btn.guest": "Ohne Konto nutzen",
    "btn.guest.loading": "Ohne Konto eintreten…",
    "foot": "Mit der Anmeldung stimmst du zu, dass Routen von diesem Gerät zu deinem Konto hinzugefügt und auf anderen Geräten verfügbar werden.",
    "local.sync": "Anmelden zum Synchronisieren",
    "local.signin": "Anmelden",
    "link.guide": "📖 Wie funktioniert's? Zur Anleitung",
  },
};
