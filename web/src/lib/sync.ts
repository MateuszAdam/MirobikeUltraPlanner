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

/** Nasłuch zmian sesji (np. powrót z magic-linka). Zwraca funkcję odpinającą. */
export function onAuthChange(cb: (email: string | null) => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const { data } = getSupabase().auth.onAuthStateChange((_e, session) => cb(session?.user?.email ?? null));
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string): Promise<void> {
  await getSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
}

export async function signInWithGoogle(): Promise<void> {
  await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

/** Wypycha lokalne zmienione paczki do chmury. */
export async function pushDirty(userId: string): Promise<number> {
  const dirty = (await listBundles()).filter((b) => b.dirty);
  if (!dirty.length) return 0;
  const rows = dirty.map((b) => ({
    user_id: userId,
    name: b.name,
    bundle: b.bundle as unknown,
    favorites: b.favorites,
    updated_at: b.updated_at,
  }));
  const { error } = await getSupabase().from("routes").upsert(rows, { onConflict: "user_id,name" });
  if (error) throw error;
  for (const b of dirty) await putBundle({ ...b, dirty: false });
  return dirty.length;
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
