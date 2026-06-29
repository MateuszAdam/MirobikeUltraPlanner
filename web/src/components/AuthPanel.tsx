import { useEffect, useState } from "react";
import { SpokeWheel } from "./SpokeWheel";
import { useI18n, LANGS } from "../i18n";
import { signIn, signUp, requestReset, setNewPassword } from "../lib/sync";

type View = "login" | "register" | "reset" | "newpass";

const emailOk = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

interface Props {
  recovery: boolean;          // wejście z linku resetu hasła
  onGuest: () => void;        // „Korzystaj bez konta"
  onRecoveryDone: () => void; // po ustawieniu nowego hasła → do aplikacji
  bioEnabled: boolean;        // czy na urządzeniu włączono biometrię
  onBioUnlock: () => Promise<void>;
}

export function AuthPanel({ recovery, onGuest, onRecoveryDone, bioEnabled, onBioUnlock }: Props) {
  const { lang, setLang, t } = useI18n();
  const [view, setView] = useState<View>(recovery ? "newpass" : "login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false); // newpass zakończone

  useEffect(() => { if (recovery) setView("newpass"); }, [recovery]);

  function go(v: View) { setView(v); setErr(""); setNote(""); }

  function mapErr(e: any): string {
    const m = String(e?.message || "");
    if (/already registered|already exists/i.test(m)) return t("err.exists");
    if (/invalid login|invalid credentials/i.test(m)) return t("err.invalidLogin");
    if (/network|fetch|load failed/i.test(m)) return t("err.offline");
    return m || t("err.generic");
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOk(email)) return setErr(t("err.email"));
    if (pass.length < 8) return setErr(t("err.pass8"));
    setBusy(true); setErr("");
    try { await signIn(email, pass); /* sesja → Root przełączy na aplikację */ }
    catch (ex) { setErr(mapErr(ex)); } finally { setBusy(false); }
  }
  async function doRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOk(email)) return setErr(t("err.email"));
    if (pass.length < 8) return setErr(t("err.pass8"));
    setBusy(true); setErr(""); setNote("");
    try {
      const { needsConfirm } = await signUp(email, pass);
      if (needsConfirm) setNote(t("note.registerSent", { email }));
      /* gdy potwierdzanie wyłączone → sesja → Root przełączy */
    } catch (ex) { setErr(mapErr(ex)); } finally { setBusy(false); }
  }
  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOk(email)) return setErr(t("err.email"));
    setBusy(true); setErr(""); setNote("");
    try { await requestReset(email); setNote(t("note.resetSent", { email })); }
    catch (ex) { setErr(mapErr(ex)); } finally { setBusy(false); }
  }
  async function doNewPass(e: React.FormEvent) {
    e.preventDefault();
    if (pass.length < 8) return setErr(t("err.pass8"));
    if (pass !== pass2) return setErr(t("err.mismatch"));
    setBusy(true); setErr(""); setNote("");
    try { await setNewPassword(pass); setNote(t("note.passChanged")); setDone(true); }
    catch (ex) { setErr(mapErr(ex)); } finally { setBusy(false); }
  }
  async function doBio() {
    setBusy(true); setErr("");
    try { await onBioUnlock(); } catch (ex) { setErr(mapErr(ex)); } finally { setBusy(false); }
  }

  const showTabs = view === "login" || view === "register";

  return (
    <div className="auth">
      <SpokeWheel />

      <div className="langsel" role="group" aria-label="Język / Language">
        {LANGS.map((l) => (
          <button key={l.code} className={"lang" + (lang === l.code ? " on" : "")}
            onClick={() => setLang(l.code)} aria-pressed={lang === l.code}>{l.label}</button>
        ))}
      </div>

      <main className="auth-wrap">
        <section className="auth-hero">
          <div className="eyebrow">{t("eyebrow")} · 444 km</div>
          <h1 className="brand">Miro<b>Bike</b></h1>
          <p className="thesis"><b>{t("thesis.lead")}</b>{t("thesis.rest")}</p>
          <div className="acct">
            <h3>{t("acct.title")}</h3>
            <p className="free">{t("acct.free")}</p>
            <p>{t("acct.sync")}</p>
          </div>
        </section>

        <section className="auth-card" aria-label={t("login.title")}>
          {showTabs && (
            <div className="auth-tabs" role="tablist">
              <button className="auth-tab" role="tab" aria-selected={view === "login"} onClick={() => go("login")}>{t("tab.login")}</button>
              <button className="auth-tab" role="tab" aria-selected={view === "register"} onClick={() => go("register")}>{t("tab.register")}</button>
            </div>
          )}

          {view === "login" && (
            <>
              <h2 className="ctitle">{t("login.title")}</h2>
              <p className="csub">{t("login.sub")}</p>
              {bioEnabled && (
                <>
                  <button className="auth-ghost bio" disabled={busy} onClick={doBio}>🔒 {t("btn.bio")}</button>
                  <div className="auth-divider sm"><span>{t("bio.or")}</span></div>
                </>
              )}
              <form onSubmit={doLogin} noValidate>
                <Field label={t("field.email")} id="li-email" type="email" autoComplete="email"
                  value={email} onChange={setEmail} placeholder="ty@example.com" />
                <Field label={t("field.password")} id="li-pass" type="password" autoComplete="current-password"
                  value={pass} onChange={setPass} placeholder="••••••••" />
                <Hint err={err} />
                <button className="auth-btn primary" type="submit" disabled={busy}>{busy ? t("btn.loading") : t("btn.login")}</button>
                <div className="auth-row">
                  <button type="button" className="auth-link" onClick={() => go("reset")}>{t("link.forgot")}</button>
                  <span className="muted">{t("row.new")} <button type="button" className="auth-link" onClick={() => go("register")}>{t("link.register")}</button></span>
                </div>
              </form>
            </>
          )}

          {view === "register" && (
            <>
              <h2 className="ctitle">{t("register.title")}</h2>
              <p className="csub">{t("register.sub")}</p>
              <form onSubmit={doRegister} noValidate>
                <Field label={t("field.email")} id="re-email" type="email" autoComplete="email"
                  value={email} onChange={setEmail} placeholder="ty@example.com" />
                <Field label={t("field.password")} id="re-pass" type="password" autoComplete="new-password"
                  value={pass} onChange={setPass} placeholder={t("ph.password.min")} />
                <Hint err={err} info={t("hint.pass8")} />
                <button className="auth-btn primary" type="submit" disabled={busy}>{busy ? t("btn.loading") : t("btn.register")}</button>
                <div className="auth-row">
                  <span className="muted">{t("row.have")} <button type="button" className="auth-link" onClick={() => go("login")}>{t("link.login")}</button></span>
                </div>
              </form>
              {note && <div className="auth-note show">{note}</div>}
            </>
          )}

          {view === "reset" && (
            <>
              <h2 className="ctitle">{t("reset.title")}</h2>
              <p className="csub">{t("reset.sub")}</p>
              <form onSubmit={doReset} noValidate>
                <Field label={t("field.email")} id="rs-email" type="email" autoComplete="email"
                  value={email} onChange={setEmail} placeholder="ty@example.com" />
                <Hint err={err} />
                <button className="auth-btn primary" type="submit" disabled={busy}>{busy ? t("btn.loading") : t("btn.reset")}</button>
                <div className="auth-row">
                  <button type="button" className="auth-link" onClick={() => go("login")}>{t("link.back")}</button>
                </div>
              </form>
              {note && <div className="auth-note show">{note}</div>}
            </>
          )}

          {view === "newpass" && (
            <>
              <h2 className="ctitle">{t("newpass.title")}</h2>
              <p className="csub">{t("newpass.sub")}</p>
              {done ? (
                <>
                  <div className="auth-note show">{note}</div>
                  <button className="auth-btn primary" style={{ marginTop: 18 }} onClick={onRecoveryDone}>{t("btn.login")} →</button>
                </>
              ) : (
                <form onSubmit={doNewPass} noValidate>
                  <Field label={t("field.newpass")} id="np-pass" type="password" autoComplete="new-password"
                    value={pass} onChange={setPass} placeholder={t("ph.password.min")} />
                  <Field label={t("field.repeat")} id="np-pass2" type="password" autoComplete="new-password"
                    value={pass2} onChange={setPass2} placeholder="••••••••" />
                  <Hint err={err} />
                  <button className="auth-btn primary" type="submit" disabled={busy}>{busy ? t("btn.loading") : t("btn.setpass")}</button>
                </form>
              )}
            </>
          )}

          {!recovery && (
            <>
              <div className="auth-divider"><span>{t("divider.or")}</span></div>
              <button className="auth-ghost" onClick={onGuest}>{t("btn.guest")} <span className="arrow">→</span></button>
              <p className="auth-foot">{t("foot")}</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Field(props: { label: string; id: string; type: string; autoComplete: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="auth-field">
      <label htmlFor={props.id}>{props.label}</label>
      <input id={props.id} type={props.type} autoComplete={props.autoComplete} placeholder={props.placeholder}
        value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

function Hint({ err, info }: { err?: string; info?: string }) {
  if (err) return <div className="auth-hint err">{err}</div>;
  if (info) return <div className="auth-hint">{info}</div>;
  return <div className="auth-hint" />;
}
