import { useMemo, useState } from "react";
import { toLocalInput } from "../lib/ui";

const WD = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const WD_LONG = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];

function parse(v: string): Date {
  const d = v ? new Date(v) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
const pad = (n: number) => String(n).padStart(2, "0");

const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18" /><path d="M8 2.5v4" /><path d="M16 2.5v4" />
  </svg>
);
const IconClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" />
  </svg>
);

/** Picker daty i godziny w stylu aplikacji (zastępuje brzydki natywny datetime-local). */
export function DateTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const sel = parse(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date(sel.getFullYear(), sel.getMonth(), 1));

  const today = useMemo(() => new Date(), []);
  const label = `${WD_LONG[sel.getDay()]} ${sel.getDate()} ${MONTHS[sel.getMonth()].slice(0, 3)} ${sel.getFullYear()} · ${pad(sel.getHours())}:${pad(sel.getMinutes())}`;

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // poniedziałek = 0
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(new Date(view.getFullYear(), view.getMonth(), d));
    return out;
  }, [view]);

  function pick(day: Date) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sel.getHours(), sel.getMinutes());
    onChange(toLocalInput(next));
  }
  function setTime(h: number, m: number) {
    const next = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), h, m);
    onChange(toLocalInput(next));
  }
  const shift = (dm: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + dm, 1));

  return (
    <div className="dtp">
      <button type="button" className="dtp-trigger" onClick={() => { setView(new Date(sel.getFullYear(), sel.getMonth(), 1)); setOpen(true); }}>
        <span className="dtp-ico"><IconCalendar /></span>
        <span className="dtp-val">{label}</span>
      </button>

      {open && (
        <div className="dtp-scrim" onClick={() => setOpen(false)}>
          <div className="dtp-pop" onClick={(e) => e.stopPropagation()}>
            <div className="dtp-nav">
              <button type="button" onClick={() => shift(-1)} aria-label="Poprzedni miesiąc">‹</button>
              <b>{MONTHS[view.getMonth()]} {view.getFullYear()}</b>
              <button type="button" onClick={() => shift(1)} aria-label="Następny miesiąc">›</button>
            </div>
            <div className="dtp-wd">{WD.map((w) => <span key={w}>{w}</span>)}</div>
            <div className="dtp-grid">
              {cells.map((d, i) => d
                ? <button type="button" key={i}
                    className={"dtp-day " + (sameDay(d, sel) ? "sel " : "") + (sameDay(d, today) ? "today" : "")}
                    onClick={() => pick(d)}>{d.getDate()}</button>
                : <span key={i} />)}
            </div>
            <div className="dtp-time">
              <span className="dtp-clock"><IconClock /></span>
              <select value={sel.getHours()} onChange={(e) => setTime(+e.target.value, sel.getMinutes())}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}</option>)}
              </select>
              <span className="dtp-sep">:</span>
              <select value={sel.getMinutes() - (sel.getMinutes() % 5)} onChange={(e) => setTime(sel.getHours(), +e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => <option key={m} value={m}>{pad(m)}</option>)}
              </select>
              <button type="button" className="dtp-ok" onClick={() => setOpen(false)}>Gotowe</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
