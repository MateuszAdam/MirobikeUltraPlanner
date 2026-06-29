// Ambientowe koło ze szprychami (laced) — tło ekranu logowania.
// Wzór i parametry z pliku referencyjnego files/mirobike-auth-panel.html.
// Animacja obrotu w CSS (auth.css) — respektuje prefers-reduced-motion.

const N = 28, HUB_R = 11, RIM_R = 92, CROSS = 5;

const spokes = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2;
  const dir = i % 2 ? CROSS : -CROSS;
  const a2 = a + (dir / N) * Math.PI * 2;
  return {
    x1: Math.cos(a) * HUB_R, y1: Math.sin(a) * HUB_R,
    x2: Math.cos(a2) * RIM_R, y2: Math.sin(a2) * RIM_R,
    bright: i % 7 === 0,
  };
});

export function SpokeWheel() {
  return (
    <div className="scene" aria-hidden="true">
      <svg className="wheel" viewBox="-100 -100 200 200">
        <circle className="rim" r="96" strokeWidth="1.1" />
        <circle className="rim" r="92" strokeWidth="2.4" strokeOpacity=".3" />
        <g>
          {spokes.map((s, i) => (
            <line key={i} className={"spoke" + (s.bright ? " bright" : "")}
              x1={s.x1.toFixed(2)} y1={s.y1.toFixed(2)} x2={s.x2.toFixed(2)} y2={s.y2.toFixed(2)} />
          ))}
        </g>
        <circle className="hub" r="12" strokeWidth="1.4" />
        <circle className="hub" r="6" strokeWidth="1" />
        <circle className="hubdot" r="2.4" />
      </svg>
      <svg className="arc" viewBox="-100 -100 200 200"><circle r="74" /></svg>
      <div className="horizon" />
    </div>
  );
}
