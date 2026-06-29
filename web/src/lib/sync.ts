import { getSupabase, isSupabaseConfigured } from "./supabase";
import { db, listBundles, putBundle, setMeta, getMeta } from "./db";
import type { Bundle } from "./types";

/**
 * Sync offline-first: lokalna baza (Dexie) jest źródłem prawdy na urządzeniu.
 * Chmura (Supabase tabela `routes`) trzyma paczki jako jsonb. Rozstrzyganie
 * konfliktów: last-write-wins po `updated_at`. Bez E2E (dane POI są publiczne).
 *
 * Wymaga tabeli (patrz supabase/schema.sql):
 *   routes(user_id uuid, name text, bundle jsonb, favorites jsonb, updated_at timestamptz)
 *   primary key (user_id, name), RLS: user widzi/zmienia tylko swoje.
 */

export async function getUser() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getUser();
  return data.user ?? null;
}

/** Aktualny e-mail z sesji (albo null). */
export async function getSessionEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user?.email ?? null;
}

export type AuthEvent =
  | { type: "session"; email: string | null }
  | { type: "recovery" };

/**
 * Nasłuch zmian sesji. Oddziela event PASSWORD_RECOVERY (powrót z linku resetu)
 * od zwykłej zmiany sesji — App pokazuje wtedy ekran „Ustaw nowe hasło".
 */
export function onAuthChange(cb: (e: AuthEvent) => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") cb({ type: "recovery" });
    else cb({ type: "session", email: session?.user?.email ?? null });
  });
  return () => data.subscription.unsubscribe();
}

/** Logowanie e-mailem i hasłem — bez przekierowań, działa w PWA na iOS. */
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/**
 * Rejestracja kontem e-mail + hasło. Z włączonym „Confirm email" w Supabase
 * `session` jest null → trzeba potwierdzić adres linkiem z maila (needsConfirm).
 * Z wyłączonym potwierdzaniem od razu wraca sesja (needsConfirm=false).
 */
export async function signUp(email: string, password: string): Promise<{ needsConfirm: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(), password,
    options: { emailRedirectTo: `${window.location.origin}/?type=signup` },
  });
  if (error) throw error;
  return { needsConfirm: !data.session };
}

/** Wysyła e-mail z linkiem do ustawienia nowego hasła (wraca z ?type=recovery). */
export async function requestReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/?type=recovery`,
  });
  if (error) throw error;
}

/** Ustawia nowe hasło zalogowanej (w trakcie recovery) sesji. */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  // scope: "local" — czyści sesję na urządzeniu bez wymaganego round-tripu do
  // serwera. Globalny signOut potrafi się odrzucić (offline / wygasła sesja),
  // przez co UI by się nie zaktualizowało. Lokalny zawsze wylogowuje tu i teraz.
  try {
    await getSupabase().auth.signOut({ scope: "local" });
  } catch {
    /* nawet jeśli SDK rzuci — sesja lokalna i tak jest czyszczona */
  }
}

/**
 * Wypycha lokalne zmienione paczki do chmury — ale NIE nadpisuje nowszej wersji
 * zdalnej o tej samej nazwie (ważne przy pierwszym logowaniu po jeździe „bez konta",
 * gdy na innym urządzeniu jest już nowsza paczka). Starsze lokalne zostają „dirty”,
 * a pullAll ściągnie nowszą wersję zdalną.
 */
export async function pushDirty(userId: string): Promise<number> {
  const dirty = (await listBundles()).filter((b) => b.dirty);
  if (!dirty.length) return 0;
  // sprawdź zdalne updated_at dla tych nazw
  const names = dirty.map((b) => b.name);
  const { data: remote, error: rErr } = await getSupabase()
    .from("routes").select("name, updated_at").in("name", names);
  if (rErr) throw rErr;
  const remoteAt = new Map<string, string>((remote ?? []).map((r) => [r.name as string, r.updated_at as string]));
  const toPush = dirty.filter((b) => { const r = remoteAt.get(b.name); return !r || b.updated_at >= r; });
  if (!toPush.length) return 0;
  const rows = toPush.map((b) => ({
    user_id: userId,
    name: b.name,
    bundle: b.bundle as unknown,
    favorites: b.favorites,
    updated_at: b.updated_at,
  }));
  const { error } = await getSupabase().from("routes").upsert(rows, { onConflict: "user_id,name" });
  if (error) throw error;
  for (const b of toPush) await putBundle({ ...b, dirty: false });
  return toPush.length;
}

/** Pobiera paczki z chmury i scala (nadpisuje lokalne, jeśli nowsze).
 *  Delta: po pierwszym pełnym pobraniu ściąga tylko wiersze nowsze niż ostatni sync. */
export async function pullAll(): Promise<number> {
  const since = await getMeta("lastSyncedAt");
  let q = getSupabase().from("routes").select("name, bundle, favorites, updated_at");
  if (since) q = q.gt("updated_at", since);
  const { data, error } = await q;
  if (error) throw error;
  let applied = 0;
  for (const row of data ?? []) {
    const local = await db.bundles.get(row.name as string);
    const remoteAt = row.updated_at as string;
    if (!local || remoteAt > local.updated_at) {
      await putBundle({
        name: row.name as string,
        bundle: row.bundle as Bundle,
        favorites: (row.favorites as string[]) ?? [],
        updated_at: remoteAt,
        dirty: false,
      });
      applied++;
    }
  }
  return applied;
}

/** Pełny cykl: najpierw push lokalnych zmian, potem pull z chmury. */
export async function syncNow(): Promise<{ pushed: number; pulled: number } | null> {
  const user = await getUser();
  if (!user) return null;
  const pushed = await pushDirty(user.id);
  const pulled = await pullAll();
  await setMeta("lastSyncedAt", new Date().toISOString());
  return { pushed, pulled };
}
