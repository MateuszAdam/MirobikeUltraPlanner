import Dexie, { type Table } from "dexie";
import type { Bundle } from "./types";

/**
 * Lokalna baza offline (IndexedDB przez Dexie). Telefon trzyma tu LEKKIE paczki
 * (przygotowane na desktopie). IndexedDB > localStorage: brak limitu ~5 MB.
 */
export interface StoredBundle {
  name: string; // klucz
  bundle: Bundle;
  favorites: string[]; // pid-y ulubionych
  updated_at: string; // ISO
  dirty: boolean; // czy wymaga wypchnięcia do chmury
}

export interface Meta {
  key: string;
  value: string;
}

class MiroDB extends Dexie {
  bundles!: Table<StoredBundle, string>;
  meta!: Table<Meta, string>;
  constructor() {
    super("mirobike");
    this.version(1).stores({
      bundles: "name, updated_at, dirty",
      meta: "key",
    });
  }
}

export const db = new MiroDB();

export async function listBundles(): Promise<StoredBundle[]> {
  return db.bundles.orderBy("name").toArray();
}
export async function getBundle(name: string): Promise<StoredBundle | undefined> {
  return db.bundles.get(name);
}
export async function putBundle(b: StoredBundle): Promise<void> {
  await db.bundles.put(b);
}
export async function deleteBundle(name: string): Promise<void> {
  await db.bundles.delete(name);
}
export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}
export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

/**
 * Prosi o trwałe przechowywanie — KLUCZOWE na iOS, gdzie dane bez „persisted"
 * są kasowane po 7 dniach braku interakcji. Zwraca aktualny stan + szacunek miejsca.
 */
export async function ensurePersistence(): Promise<{ persisted: boolean; estimateMb?: number }> {
  let persisted = false;
  try {
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
    if (!persisted && navigator.storage?.persist) persisted = await navigator.storage.persist();
  } catch {
    /* brak Storage API */
  }
  let estimateMb: number | undefined;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) estimateMb = Math.round((est.usage / 1024 / 1024) * 10) / 10;
  } catch {
    /* ignore */
  }
  return { persisted, estimateMb };
}
