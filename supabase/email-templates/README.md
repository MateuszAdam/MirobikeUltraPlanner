# Szablony maili MiroBike (Supabase Auth)

Ładne, markowe maile w stylu „świt" (bursztyn `#e7a14b`, jak w aplikacji).
Wklejasz HTML do **Supabase → Authentication → Email Templates** (osobno dla każdego typu),
ustawiasz temat i — żeby maile szły **od Ciebie** — włączasz **Custom SMTP** (niżej).

## 1. Szablony → typ w Supabase + temat

| Plik | Email Template w Supabase | Temat (Subject) | Aktywny? |
|------|---------------------------|-----------------|----------|
| `reset-password.html` | **Reset Password** | `Zmiana hasła w MiroBike` | ✅ tak — jedyny mail, jaki wysyła apka |
| `confirm-signup.html` | **Confirm signup** | `Potwierdź konto MiroBike` | ⏸ tylko gdy włączysz „Confirm email" |
| `magic-link.html` | **Magic Link** | `Logowanie do MiroBike` | ⏸ nieużywane (apka loguje hasłem) |
| `change-email.html` | **Change Email Address** | `Zmiana adresu e-mail w MiroBike` | ⏸ gdy ktoś zmienia adres konta |

> Logowanie odbywa się **e-mailem + hasłem** (+ biometria), a „Confirm email" jest **wyłączone**
> (patrz `web/SETUP.md`), więc w praktyce wysyłany jest tylko **reset hasła**. Pozostałe szablony
> są gotowe na wypadek włączenia tych funkcji — wszystkie mają spójny wygląd.

Każdy plik używa zmiennej `{{ .ConfirmationURL }}` (link akcji). Nic więcej nie trzeba podstawiać.

## 2. Maile „od Ciebie" — Custom SMTP (dostarczalność)

Bez tego maile idą z `…@supabase.io` (gorsza dostarczalność, limity, nie wyglądają jak Twoje).

1. Załóż konto u dostawcy z darmowym progiem: **Resend** (~3000 maili/mc) lub **Brevo**.
2. Zweryfikuj domenę `grapevest.pl` — dodaj w DNS (OVH) rekordy **SPF + DKIM** podane przez dostawcę
   (a docelowo też **DMARC**: `v=DMARC1; p=none; rua=mailto:contact@grapevest.pl`).
3. Supabase → **Project Settings → Authentication → SMTP Settings → Enable Custom SMTP**:
   - **Host / Port / User / Pass** — z panelu dostawcy (Resend: host `smtp.resend.com`, port `465`).
   - **Sender name:** `MiroBike`
   - **Sender email:** `noreply@grapevest.pl` (albo `konto@grapevest.pl`)
4. Wyślij testowy reset hasła do siebie i sprawdź, czy trafia do skrzynki (nie do spamu).

## 3. URL akcji
Authentication → **URL Configuration**: **Site URL** = `https://www.mirobike.grapevest.pl`
oraz **Redirect URLs** musi zawierać ten adres (+ `http://localhost:5173` na dev) —
inaczej link z maila resetu nie zadziała.
