# MiroBike — brief: landing + logowanie + pełny flow konta (do Claude Code)

Cel: zastąpić obecne, schowane w opcjach i niepełne logowanie (magic-link w `App.tsx`) dedykowanym
ekranem landing/logowania z kompletnym flow: **logowanie, rejestracja, reset hasła, ustawienie nowego
hasła**, oraz **wejście bez konta** (tryb lokalny). Wzorzec UX i tokeny designu: plik
`mirobike-auth-panel.html` (otwórz — to jest wizualna specyfikacja). Wzoruj się na podejściu z GrapeVest
(AuthGate), ale MiroBike jest prostsze: brak E2E, dane lokalne w IndexedDB, konto = tylko synchronizacja.

## Kontekst kodu (web/)
React + Vite + TS, MapLibre + PMTiles, **Dexie/IndexedDB (local-first)**, **Supabase do synchronizacji**.
Dziś: `web/src/lib/supabase.ts` ma `signInWithEmail` (magic link), logowanie wplątane w `App.tsx`;
`sync.ts` push/pull paczek; `db.ts` lokalny store. **Aplikacja działa bez sieci — konto dodaje wyłącznie
sync między urządzeniami + kopię w chmurze.**

## WP0 — Zasady
Wsteczna kompatybilność; PL (aplikacja jest polska); czyste funkcje + testy; na końcu `typecheck`+`test`+
build zielone. Nie psuć trybu offline ani istniejących paczek lokalnych.

## WP1 — Auth jako e-mail + hasło (Supabase Auth)
Rozszerz `supabase.ts` o:
- `signUp(email, password)` → `supabase.auth.signUp({ email, password, options:{ emailRedirectTo: <APP_URL>/auth/confirm } })`
- `signIn(email, password)` → `supabase.auth.signInWithPassword({ email, password })`
- `requestReset(email)` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: <APP_URL>/auth/recovery })`
- `setNewPassword(password)` → `supabase.auth.updateUser({ password })`
- `signOut()`; `getSession()` / subskrypcja `onAuthStateChange`.
Magic-link (`signInWithEmail`) możesz zostawić jako opcję, ale domyślny flow to hasło.
**Supabase config:** dodaj `redirectTo` URL-e (confirm, recovery) do whitelisty w panelu Supabase; włącz
potwierdzanie e-mail dla signup.

## WP2 — Brama wejścia (AuthGate) + tryb bez konta
Top-level komponent decyduje, co pokazać:
1. jest sesja → aplikacja;
2. `localStorage['mirobike.localMode'] === '1'` → aplikacja (tryb lokalny, bez sieci);
3. inaczej → **AuthPanel** (nowy landing).
- „Korzystaj bez konta" ustawia `mirobike.localMode='1'` i wchodzi do aplikacji. W trybie lokalnym **sync
  wyłączony**, dane tylko w IndexedDB; pokaż dyskretny, stały przycisk w aplikacji „Zaloguj, by
  synchronizować" (czyści `localMode` i wraca do AuthPanel).
- Po zalogowaniu/rejestracji `localMode` jest czyszczony.

## WP3 — Ekran recovery (ustawienie nowego hasła)
- Link resetujący z maila wraca do aplikacji z eventem `PASSWORD_RECOVERY` (`onAuthStateChange`) lub `type=recovery` w URL.
- Wykryj to i pokaż widok **„Ustaw nowe hasło"** → `setNewPassword(p)` → po sukcesie przejście do aplikacji.

## WP4 — Synchronizacja po zalogowaniu (bezpieczny merge)
- Sync gated na sesji (jak dziś).
- **Pierwsze logowanie z istniejącymi paczkami lokalnymi:** wypchnij lokalne paczki do chmury (push),
  potem pull — **bez nadpisywania** nowszych zdalnych (porównaj `updated_at`, jak w obecnym sync). Nie gub
  lokalnej pracy użytkownika, który wcześniej jeździł bez konta.

## WP5 — Implementacja UI z `mirobike-auth-panel.html`
Przenieś design do React (zachowaj tokeny: noc→świt gradient, bursztynowy akcent `--dawn #e7a14b`,
chłodne szprychy `--spoke`, fonty Sora/Inter/JetBrains Mono):
- `SpokeWheel.tsx` — SVG koło ze szprychami laced (generuj linie jak w pliku), powolny obrót, **respektuj
  `prefers-reduced-motion`** (bez animacji).
- `AuthPanel.tsx` — hero (brand + teza + blok „Po co konto?") + karta ze stanami:
  `login | register | reset | newpass`, zakładki login/rejestracja, „Korzystaj bez konta", divider.
- Walidacja inline (e-mail, hasło ≥ 8 znaków, zgodność haseł), stany błędu i potwierdzenia (jak w pliku:
  „Sprawdź skrzynkę…", „Hasło zmienione…").
- Kopia po polsku, w głosie aplikacji: błędy mówią co poprawić, nie przepraszają; przyciski mówią co
  robią („Zaloguj się", „Załóż konto", „Wyślij link resetujący", „Ustaw hasło").
- Dostępność: widoczny focus, klawiatura, responsywność do mobile (karta na pełną szerokość, koło jako
  ambient tło) — wszystko jest w pliku referencyjnym.

## WP6 — Wyczyszczenie starego logowania
Usuń wplątane w `App.tsx` stany `email`/`login()`/magic-link UI; wejście do logowania jest teraz wyłącznie
przez AuthGate/AuthPanel. Wylogowanie dostępne z ustawień aplikacji.

## Kryteria akceptacji
- Z zimnego startu bez sesji widać AuthPanel (nie schowane w opcjach).
- Działają wszystkie ścieżki: rejestracja → mail potwierdzający; logowanie hasłem; reset → mail → ustawienie
  nowego hasła; wejście bez konta → aplikacja offline.
- Tryb lokalny nie wykonuje żądań sieciowych; po zalogowaniu lokalne paczki trafiają do chmury bez gubienia
  nowszych zdalnych.
- `prefers-reduced-motion` zatrzymuje obrót koła; focus widoczny; mobile OK.

## Testy
- Router stanów AuthPanel (login↔register↔reset↔newpass).
- Walidacja (e-mail, długość hasła, zgodność).
- AuthGate: sesja / localMode / brak → właściwy ekran.
- Wykrycie recovery → widok newpass.
- Merge przy pierwszym logowaniu nie nadpisuje nowszych zdalnych paczek.

## Poza zakresem
OAuth (Google/Apple) — później; E2E (MiroBike nie potrzebuje, dane nie są wrażliwe); zmiana modelu sync.
