/**
 * Minimalna nawigacja SPA bez biblioteki routera.
 * Zmienia adres przez history.pushState i emituje `popstate`, żeby Root
 * przeliczył ścieżkę. Dzięki temu strona „/pomoc" ma własny URL (działa offline
 * przez navigateFallback SW), a wejście/wyjście nie przeładowuje aplikacji.
 */
export function navigate(to: string): void {
  if (window.location.pathname === to) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
