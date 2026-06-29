import { useMemo, useState } from "react";
import { pid } from "../lib/geo";
import { etaAheadDelta, fmtDur } from "../lib/eta";
import { CATS } from "../lib/categories";
import { CAT_COLOR, is24h, defaultCfg, fmtDist, bookingUrl } from "../lib/ui";
import { MODES, planTrip, candidates, fmtClock } from "../lib/trip";
import { DateTimePicker } from "./DateTimePicker";
import type { DownRoute, Poi, TripState } from "../lib/types";

// ——— Szczegóły miejsca ———
export function DetailSheet(props: {
  poi: Poi; onClose: () => void; hereKm: number | null; isLoop: boolean;
  ds: DownRoute | null; time: number[]; totalKm: number;
  favorites: Set<string>; onToggleFav: (id: string) => void;
}) {
  const { poi, onClose, hereKm, isLoop, ds, time, totalKm, favorites, onToggleFav } = props;
  const t = poi.tags;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="dh"><b>{poi.name}</b><button onClick={onClose}>✕</button></div>
        <div className="dc" style={{ color: CAT_COLOR[poi.cats[0]] }}>{poi.cats.map((c) => CATS[c].label).join(" · ")}</div>
        <div className="dr">km {poi.km.toFixed(1)} · {fmtDist(poi.detourM)} od trasy {poi.side}{t._custom ? " · 📌 własne" : ""}</div>
        {hereKm != null && ds && time.length ? (() => {
          const d = ((x: number) => (x < -0.05 && isLoop ? x + totalKm : x))(poi.km - hereKm);
          const eta = etaAheadDelta(ds, time, d, hereKm, totalKm);
          return d > 0 && eta != null ? <div className="dr">⏱ ≈ {fmtDur(eta)} stąd</div> : null;
        })() : null}
        {t.stars && <div className="dr">⭐ {t.stars}</div>}
        {t.opening_hours && <div className="dr">🕒 {t.opening_hours}{is24h(t) ? " 🌙" : ""}</div>}
        {t.cuisine && <div className="dr">🍽 {t.cuisine.replace(/;/g, ", ")}</div>}
        {t.description && <div className="dr">📝 {t.description}</div>}
        {t["addr:city"] && <div className="dr">📍 {t["addr:street"] || ""} {t["addr:city"]}</div>}
        {(t.email || t["contact:email"]) && <div className="dr">✉ {t.email || t["contact:email"]}</div>}
        <div className="acts">
          <a className="act" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat}%2C${poi.lon}`}>🧭 Nawiguj</a>
          <a className="act" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${poi.lat}%2C${poi.lon}`}>🗺 Mapy Google</a>
          {poi.cats.includes("sleep") && <a className="act" target="_blank" rel="noopener" href={bookingUrl(poi)}>🛏 Booking</a>}
          {(t.phone || t["contact:phone"]) && <a className="act" href={`tel:${t.phone || t["contact:phone"]}`}>☎ Zadzwoń</a>}
          {(t.website || t["contact:website"]) && <a className="act" target="_blank" rel="noopener" href={t.website || t["contact:website"]}>🌐 Strona</a>}
        </div>
        <button className={"favbig " + (favorites.has(pid(poi)) ? "is" : "")} onClick={() => onToggleFav(pid(poi))}>
          {favorites.has(pid(poi)) ? "★ w ulubionych" : "☆ dodaj do ulubionych"}
        </button>
      </div>
    </div>
  );
}

// ——— Planner wyprawy ———
export function PlannerSheet(props: {
  route: boolean; pois: Poi[]; ds: DownRoute | null; totalKm: number;
  favorites: Set<string>; trip: TripState | null;
  onClose: () => void; onApply: (t: TripState) => void; onOpenDetail: (p: Poi) => void;
}) {
  const { route, pois, ds, totalKm, favorites, trip, onClose, onApply, onOpenDetail } = props;
  const [editingCfg, setEditingCfg] = useState(!trip);
  const [cfgDraft, setCfgDraft] = useState(trip?.cfg ?? defaultCfg());

  const planDays = useMemo(
    () => (trip && ds && pois.length ? planTrip(ds, pois, totalKm, trip.cfg, favorites, trip.overrides) : []),
    [trip, ds, pois, totalKm, favorites],
  );

  function applyMode(mk: TripState["cfg"]["mode"]) {
    const m = MODES.find((x) => x.key === mk)!;
    setCfgDraft((c) => ({ ...c, mode: mk, speedKmh: m.speedKmh, dailyKm: m.dailyKm, sleepHours: m.sleepHours }));
  }
  function generate() {
    onApply({ cfg: cfgDraft, overrides: trip?.overrides ?? {} });
    setEditingCfg(false);
  }
  function setOverride(dayIdx: number, kind: "sleep" | "lunch", val: string) {
    if (!trip) return;
    onApply({ ...trip, overrides: { ...trip.overrides, [dayIdx]: { ...trip.overrides[dayIdx], [kind]: val || undefined } } });
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="dh"><b>📑 Planner wyprawy</b><button onClick={onClose}>✕</button></div>

        {!route || !pois.length ? (
          <p className="empty">Wczytaj trasę (.gpx) i „Pobierz miejsca", potem ułóż wielodniowy plan.</p>
        ) : (!trip || editingCfg) ? (
          <>
            <div className="msec">Tryb jazdy</div>
            <div className="modes">
              {MODES.map((m) => (
                <button key={m.key} className={"modebtn " + (cfgDraft.mode === m.key ? "on" : "")} onClick={() => applyMode(m.key)}>
                  <b>{m.label}</b><small>{m.dailyKm} km/dzień · {m.speedKmh} km/h · sen {m.sleepHours} h</small>
                </button>
              ))}
            </div>
            <div className="cfg">
              <label>Śr. prędkość (km/h)<input type="number" min={8} max={45} value={cfgDraft.speedKmh} onChange={(e) => setCfgDraft((c) => ({ ...c, speedKmh: +e.target.value }))} /></label>
              <label>Dystans / dzień (km)<input type="number" min={40} max={600} step={10} value={cfgDraft.dailyKm} onChange={(e) => setCfgDraft((c) => ({ ...c, dailyKm: +e.target.value }))} /></label>
              <label>Sen (h)<input type="number" min={0} max={12} value={cfgDraft.sleepHours} onChange={(e) => setCfgDraft((c) => ({ ...c, sleepHours: +e.target.value }))} /></label>
              <label>Godz. obiadu<input type="number" min={10} max={20} value={cfgDraft.lunchHour} onChange={(e) => setCfgDraft((c) => ({ ...c, lunchHour: +e.target.value }))} /></label>
              <label className="wide">Start (data i godzina)<DateTimePicker value={cfgDraft.startISO} onChange={(v) => setCfgDraft((c) => ({ ...c, startISO: v }))} /></label>
            </div>
            <button className="favbig" onClick={generate}>🗺 Ułóż plan</button>
          </>
        ) : (
          <>
            <div className="psum">
              {planDays.length} {planDays.length === 1 ? "dzień" : "dni"} · {totalKm.toFixed(0)} km · {MODES.find((m) => m.key === trip.cfg.mode)?.label} · {trip.cfg.speedKmh} km/h
              <button className="linkbtn" onClick={() => { setCfgDraft(trip.cfg); setEditingCfg(true); }}>⚙ Zmień</button>
            </div>
            {planDays.map((d) => {
              const nominalEnd = Math.min((d.index + 1) * trip.cfg.dailyKm, totalKm);
              const sleepCands = candidates(pois, ["sleep"], nominalEnd, 25);
              const lunchCands = candidates(pois, ["eat", "food"], d.lunch?.km ?? (d.fromKm + nominalEnd) / 2, 15);
              return (
                <details className="day" key={d.index} open={d.index === 0}>
                  <summary>
                    <b>Dzień {d.index + 1}</b>
                    <span className="dkm">km {d.fromKm.toFixed(0)}–{d.toKm.toFixed(0)} · {d.distanceKm.toFixed(0)} km</span>
                    <span className="clock">{d.isLast ? "🏁 " : "🛏 "}{fmtClock(d.endMs)}</span>
                  </summary>
                  <div className="daybody">
                    <div className="stop">
                      <div className="stoplab">🍽 Obiad {d.lunch ? `· ${fmtClock(d.lunch.ms)} · km ${d.lunch.km.toFixed(0)}` : ""}</div>
                      <select value={trip.overrides[d.index]?.lunch ?? (d.lunch ? pid(d.lunch.poi) : "")} onChange={(e) => setOverride(d.index, "lunch", e.target.value)}>
                        <option value="">— auto / brak —</option>
                        {lunchCands.map((p) => <option key={pid(p)} value={pid(p)}>{p.name} (km {p.km.toFixed(0)})</option>)}
                      </select>
                      {d.lunch && <button className="linkbtn" onClick={() => onOpenDetail(d.lunch!.poi)}>szczegóły</button>}
                    </div>
                    {!d.isLast && (
                      <div className="stop">
                        <div className="stoplab">🛏 Nocleg {d.sleep ? `· ${fmtClock(d.sleep.ms)} · km ${d.sleep.km.toFixed(0)} · ${fmtDist(d.sleep.poi.detourM)}` : "· brak w pobliżu"}</div>
                        <select value={trip.overrides[d.index]?.sleep ?? (d.sleep ? pid(d.sleep.poi) : "")} onChange={(e) => setOverride(d.index, "sleep", e.target.value)}>
                          <option value="">— auto / brak —</option>
                          {sleepCands.map((p) => <option key={pid(p)} value={pid(p)}>{p.name} (km {p.km.toFixed(0)}, {fmtDist(p.detourM)})</option>)}
                        </select>
                        {d.sleep && <>
                          <button className="linkbtn" onClick={() => onOpenDetail(d.sleep!.poi)}>szczegóły</button>
                          <a className="linkbtn" target="_blank" rel="noopener" href={bookingUrl(d.sleep.poi)}>Booking</a>
                        </>}
                      </div>
                    )}
                    {d.isLast && <div className="stop"><div className="stoplab">🏁 Meta · {fmtClock(d.endMs)} · km {totalKm.toFixed(0)}</div></div>}
                  </div>
                </details>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ——— Pomoc ———
export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="dh"><b>Jak korzystać</b><button onClick={onClose}>✕</button></div>
        <ol className="help">
          <li><b>Trasa.</b> ☰ → „Wczytaj trasę (.gpx)" — ślad Twojego wyścigu.</li>
          <li><b>Pobierz miejsca.</b> ☰ → „Pobierz miejsca" — noclegi, sklepy, woda, jedzenie i paliwo wzdłuż trasy. Zapisują się <b>automatycznie offline</b>.</li>
          <li><b>Filtry.</b> U góry włączasz/wyłączasz kategorie, „🌙 24h" oraz ★ ulubione.</li>
          <li><b>Pozycja.</b> „📍 Śledź GPS" na rowerze albo dotknij mapy. Lista „przede mną" pokaże, co masz dalej i za ile (⏱ czas dojazdu).</li>
          <li><b>Plan.</b> „📑 Plan" — ułóż wielodniowy plan z noclegami i posiłkami wg tempa i km dziennie.</li>
          <li><b>Konto (opcja).</b> Zaloguj się mailem na komputerze i telefonie — przygotujesz trasy na PC i pobierzesz je offline na telefon.</li>
          <li><b>Offline.</b> Wszystko działa bez sieci w terenie. Dodaj apkę do ekranu początkowego (Udostępnij → „Do ekranu początkowego").</li>
        </ol>
        <button className="favbig" onClick={onClose}>Rozumiem</button>
      </div>
    </div>
  );
}

// ——— O aplikacji + wsparcie ———
export function AboutSheet({ onClose, supportUrl }: { onClose: () => void; supportUrl: string }) {
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card about" onClick={(e) => e.stopPropagation()}>
        <div className="dh"><b>O MiroBike</b><button onClick={onClose}>✕</button></div>
        <p className="ap">
          <b>MiroBike Ultra Planner</b> to darmowy planer dla ultra-kolarzy. Wczytujesz ślad GPX
          wyścigu, a aplikacja pokazuje <b>noclegi, sklepy, wodę, jedzenie i paliwo</b> wzdłuż trasy —
          z odległością, szacowanym czasem dojazdu i <b>działaniem offline</b> w terenie. Ułożysz też
          wielodniowy plan z postojami i noclegami.
        </p>
        <p className="ap">
          Powstała jako pomoc dla mojego <b>taty — zapalonego ultramaratończyka</b>, którego możesz
          spotkać na trasie.
        </p>
        <p className="ap">Jeśli pomogła Ci w ultra i chcesz podziękować — możesz postawić mi kawę. Będzie mi bardzo miło 🙏</p>
        <a className="support-cta" href={supportUrl} target="_blank" rel="noopener">☕ Postaw mi kawę</a>
        <p className="ap dim">Dane: © OpenStreetMap contributors, Overture Maps Foundation. Kontakt: contact@grapevest.pl<br />wersja {__BUILD__}</p>
      </div>
    </div>
  );
}
