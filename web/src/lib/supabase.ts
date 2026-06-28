import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Klient Supabase tworzony leniwie i tylko gdy są zmienne środowiskowe — dzięki
// temu aplikacja bez konfiguracji działa w trybie lokalnym (offline, bez kont).
// Wzorzec przeniesiony z projektu GrapeVest (bez warstwy szyfrowania E2E).
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!URL || !ANON) throw new Error("Supabase nie jest skonfigurowane (.env.local).");
  if (!client) {
    client = createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
