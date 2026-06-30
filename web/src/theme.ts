import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const KEY = "mirobike.theme";
const META = { dark: "#0a0f1e", light: "#eef1f7" };

function initial(): Theme {
  try {
    const s = localStorage.getItem(KEY);
    if (s === "light" || s === "dark") return s;
  } catch { /* brak localStorage */ }
  return "dark"; // domyślnie ciemny (motyw przewodni)
}

let current: Theme = initial();
const subs = new Set<() => void>();

function apply(t: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", META[t]);
}
apply(current); // ustaw zanim wyrenderuje się React

export function setTheme(t: Theme): void {
  current = t;
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  apply(t);
  subs.forEach((f) => f());
}
export function toggleTheme(): void { setTheme(current === "light" ? "dark" : "light"); }

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => current);
  return { theme, setTheme, toggle: toggleTheme };
}
