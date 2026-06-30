import { useEffect } from "react";
import "../styles/help.css";

/**
 * Pełna instrukcja obsługi pod adresem „/pomoc".
 * Renderowana jako nakładka (position:fixed) nad bieżącym ekranem — Root decyduje
 * o pokazaniu na podstawie ścieżki. Kolory biorą się ze zmiennych motywu (app.css),
 * więc strona podąża za trybem jasnym/ciemnym. Treść odzwierciedla uproszczony flow:
 * wczytanie GPX automatycznie pobiera miejsca.
 */
export function HelpPage({ onClose }: { onClose: () => void }) {
  // blokada przewijania tła + wyjście klawiszem Esc
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const dot = (v: string) => ({ background: `var(--${v})` });

  return (
    <div className="hp" role="dialog" aria-label="Instrukcja obsługi MiroBike">
      <div className="hp-top">
        <button className="hp-back" onClick={onClose}>← Wróć do aplikacji</button>
        <span className="sp" />
        <b>Instrukcja</b>
      </div>

      <div className="hp-wrap">

        {/* HERO */}
        <header className="hp-hero">
          <div className="eyebrow">Planer ultra · offline · 100% za darmo</div>
          <div className="hp-brand">Miro<b>Bike</b></div>
          <p className="lead hp-read"><b>Wiedz, gdzie kupisz wodę i jedzenie — zanim wjedziesz w ciemność.</b> Cała trasa, sklepy, noclegi i postoje w jednej paczce, która działa bez zasięgu.</p>
          <div className="hp-badges">
            <span className="hp-badge accent">✓ Działa offline</span>
            <span className="hp-badge">🚲 Dla ultra-kolarzy</span>
            <span className="hp-badge">📱 Telefon i komputer</span>
            <span className="hp-badge">🗺️ Otwarte mapy (OSM)</span>
          </div>
        </header>

        {/* CZYM JEST */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">O co chodzi</div>
            <h2>Co to jest i dla kogo</h2>
          </div>
          <div className="hp-read">
            <p className="lead">MiroBike to <b>darmowy planer dla ultra-kolarzy</b> — długodystansowych wypraw, gdzie liczy się to, czy zdążysz uzupełnić wodę i jedzenie, zanim zamkną się sklepy albo zapadnie noc.</p>
            <p>Wczytujesz <b>ślad swojej trasy (plik GPX)</b>, a aplikacja pokazuje wzdłuż niej wszystko, co przyda się w drodze: <b>noclegi, sklepy spożywcze, wodę, jedzenie, paliwo, serwisy rowerowe i apteki</b> — z odległością „przede mną", szacowanym czasem dojazdu i ostrzeżeniami o długich odcinkach bez zaopatrzenia. Wszystko <b>działa bez internetu</b> w terenie, bo dane zapisują się w telefonie.</p>
            <p className="dim">Powstała jako pomoc dla taty autora — zapalonego ultramaratończyka. Korzysta z otwartych map i danych (OpenStreetMap, Overture Maps), więc część miejsc traktuj orientacyjnie i w razie wątpliwości sprawdzaj na miejscu.</p>
          </div>
        </section>

        {/* PIERWSZE KROKI */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">Zaczynamy</div>
            <h2>Pierwsze kroki — to naprawdę dwa ruchy</h2>
            <p className="lead dim">Wczytujesz trasę, a miejsca pobiorą się same. Potem pokazujesz swoją pozycję. Aplikacja prowadzi Cię przez to sama.</p>
          </div>
          <div className="hp-steps">
            <div className="hp-step">
              <div className="n">1</div>
              <h3>Wczytaj trasę</h3>
              <p>Menu <span className="hp-keycap">☰</span> → <b>„Wczytaj trasę (.gpx)"</b> — ślad Twojego wyścigu z dowolnej aplikacji (Komoot, Strava, RideWithGPS…). Zaraz po wczytaniu MiroBike <b>sam pobiera miejsca</b> wzdłuż trasy (zobaczysz „Przygotowuję trasę…"; możesz to <b>„Pomiń"</b>). Wszystko zapisuje się <b>offline</b>.</p>
            </div>
            <div className="hp-step">
              <div className="n">2</div>
              <h3>Pokaż pozycję</h3>
              <p>Włącz <b>„📍 Śledź GPS"</b> na rowerze albo po prostu dotknij mapy. Lista „przede mną" od razu pokaże, co masz dalej i za ile kilometrów oraz minut.</p>
            </div>
          </div>
          <div className="hp-note">
            <b>Bez internetu w chwili wczytywania?</b> Trasa i tak jest gotowa. Miejsca dobierzesz później w menu <span className="hp-keycap">☰</span> → <b>Trasa i miejsca → Pobierz miejsca</b>, gdy będzie sieć.
          </div>
        </section>

        {/* EKRAN GŁÓWNY */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">Anatomia</div>
            <h2>Ekran główny — co jest czym</h2>
            <p className="lead dim">Tak wygląda widok podczas jazdy, gdy masz już trasę, pobrane miejsca i włączoną pozycję. Numery odpowiadają opisom obok.</p>
          </div>
          <div className="hp-split">
            <div className="hpm-phone" aria-label="Makieta ekranu głównego">
              <div className="hpm-screen">
                <div className="hpm-bar">
                  <span className="hpm-av">M<span className="d" /></span>
                  <span className="hpm-state">Bałtyk–Bieszczady · 318</span>
                  <span className="hpm-sp" />
                  <span className="hpm-ic">☰</span>
                </div>
                <div className="hpm-row">
                  <span className="hpm-chip gps">● GPS</span>
                  <span className="hpm-chip">🚴 Jazda</span>
                  <span className="hpm-chip">📑 Planer</span>
                </div>
                <div className="hpm-row">
                  <span className="hpm-chip">★</span>
                  <span className="hpm-chip">🌙 24h</span>
                  <span className="hpm-chip"><span className="cd" style={dot("food")} />Spożywcze</span>
                  <span className="hpm-chip off"><span className="cd" style={dot("sleep")} />Nocleg</span>
                  <span className="hpm-fade" />
                </div>
                <div className="hpm-status">✓ 318 miejsc — zapisane offline. Włącz GPS lub dotknij mapy.</div>
                <div className="hpm-panel">
                  <div className="hpm-lab">jesteś na</div>
                  <div className="hpm-km">126,4<small> / 444 km</small></div>
                  <div className="hpm-meta">317,6 km do końca · ⏱ ≈ 16 h 10 min · 35 m od trasy</div>
                  <div className="hpm-next">
                    <div className="hpm-cell"><div className="cl" style={{ color: "var(--food)" }}>Spożywcze</div><div className="cv">+2,3</div><div className="cn">Żabka</div></div>
                    <div className="hpm-cell"><div className="cl" style={{ color: "var(--water)" }}>Woda</div><div className="cv">+8,1</div><div className="cn">Źródło</div></div>
                    <div className="hpm-cell"><div className="cl" style={{ color: "var(--fuel)" }}>Paliwo</div><div className="cv">+5,0</div><div className="cn">Orlen</div></div>
                    <div className="hpm-cell"><div className="cl" style={{ color: "var(--eat)" }}>Jedzenie</div><div className="cv">+1,2</div><div className="cn">Bar Heńka</div></div>
                  </div>
                  <div className="hpm-elev" aria-hidden="true">
                    <svg viewBox="0 0 300 40" preserveAspectRatio="none" width="100%" height="100%">
                      <defs><linearGradient id="hpg" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="#e7a14b" stopOpacity=".5" /><stop offset="1" stopColor="#e7a14b" stopOpacity="0" />
                      </linearGradient></defs>
                      <path d="M0,32 L25,28 L55,31 L85,21 L120,24 L150,11 L185,19 L220,8 L255,17 L300,13 L300,40 L0,40 Z" fill="url(#hpg)" />
                      <path d="M0,32 L25,28 L55,31 L85,21 L120,24 L150,11 L185,19 L220,8 L255,17 L300,13" fill="none" stroke="#e7a14b" strokeWidth="1.5" />
                      <circle cx="115" cy="24.5" r="3" fill="#ffd23f" stroke="#3a2e00" strokeWidth="1" />
                    </svg>
                  </div>
                  <div className="hpm-warn">⚠️ Następny sklep za <b>24,0 km</b> (Lewiatan). Zatankuj zapasy.</div>
                  <div className="hpm-warn water">💧 Następna woda dopiero za <b>27,0 km</b>. Uzupełnij wcześniej.</div>
                  <div className="hpm-warn fav">★ Do ulubionego: <b>Schronisko Chatka</b> za <b>12,0 km</b> (⏱ 40 min).</div>
                  <div className="hpm-li">
                    <span className="ld" style={dot("food")} />
                    <span className="ln">Żabka Z7421<br /><small>⏱ 9 min · 60 m prawa · 🌙 24h</small></span>
                    <span className="lkm">+2,3</span><span className="lstar">★</span>
                  </div>
                  <div className="hpm-li">
                    <span className="ld" style={dot("eat")} />
                    <span className="ln">📋 Bar u Heńka<br /><small>⏱ 5 min · 20 m lewa</small></span>
                    <span className="lkm">+1,2</span><span className="lstar off">☆</span>
                  </div>
                </div>
                <div className="hpm-view"><span className="on">📋 Lista</span><span>🗺 Mapa</span></div>
              </div>
            </div>

            <div className="hp-desc">
              <ol className="hp-anno">
                <li><div><b>Wskaźnik konta</b><small>Litera w kółku = zalogowany (zielona kropka). 👤 z szarą kropką = tryb offline bez konta. Sam wskaźnik — logujesz się w menu.</small></div></li>
                <li><div><b>Nazwa trasy i licznik miejsc</b><small>Aktywna trasa i ile punktów wzdłuż niej pobrano. Na czerwono: „⚠ brak trasy".</small></div></li>
                <li><div><b>Menu <span className="hp-keycap">☰</span></b><small>Wczytywanie tras, dobieranie miejsc, konto, ustawienia, pomoc — wszystko jest tutaj.</small></div></li>
                <li><div><b>Szybkie przyciski</b><small>Śledź GPS · Tryb jazdy · Planer. Gdy część paczek się nie pobrała, pojawi się też „⬇ Dobierz brakujące".</small></div></li>
                <li><div><b>Filtry</b><small>★ tylko ulubione · 🌙 tylko całodobowe · oraz kategorie (kliknięcie wyłącza/włącza dany typ na mapie i liście). Pasek przewija się w bok.</small></div></li>
                <li><div><b>Pasek statusu</b><small>Krótka informacja, co się właśnie stało (pobrano miejsca, błąd, wznowiono trasę, alert o ulubionym).</small></div></li>
                <li><div><b>„Jesteś na…"</b><small>Twój kilometr na trasie, ile zostało do końca i szacowany czas. „35 m od trasy" = jak daleko zboczyłeś.</small></div></li>
                <li><div><b>Najbliższe wg kategorii</b><small>Cztery kafelki: ile km do najbliższego sklepu, wody, paliwa, jedzenia — i jego nazwa.</small></div></li>
                <li><div><b>Profil wysokości</b><small>Przekrój przewyższeń trasy; złota kropka to Twoja aktualna pozycja.</small></div></li>
                <li><div><b>Ostrzeżenia</b><small>Czerwone — długo do sklepu / luka bez zaopatrzenia. Niebieskie — woda. Złote — zbliżasz się do ulubionego (★) lub punktu z planu (📋).</small></div></li>
                <li><div><b>Lista „przede mną"</b><small>Wszystko w zasięgu, od najbliższego. Każdy wiersz: kolor kategorii, nazwa, czas dojazdu, ile metrów od trasy i z której strony, +km oraz gwiazdka do ulubionych.</small></div></li>
                <li><div><b>Lista / Mapa</b><small>Przełącznik widoku: czytelna lista albo mapa z trasą, punktami i Twoją pozycją.</small></div></li>
              </ol>
            </div>
          </div>
        </section>

        {/* WSZYSTKIE FUNKCJE */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">Pełna lista</div>
            <h2>Wszystkie funkcje i opcje</h2>
            <p className="lead dim">Komplet tego, co aplikacja potrafi — pogrupowane tematycznie.</p>
          </div>
          <div className="hp-grid">
            <Feat ic="🧭" t="Trasa z pliku GPX">Wczytaj ślad wyścigu. Apka liczy długość, przewyższenie (↑ m) i szacowany czas. Wykrywa też pętlę (START/META w jednym miejscu).</Feat>
            <Feat ic="📍" t="Punkty wzdłuż trasy">Po wczytaniu trasy automatycznie pobiera z OpenStreetMap 7 kategorii miejsc w jej korytarzu. Promień szukania ustawisz w menu (100 m – 2 km; noclegi zawsze do 5 km).</Feat>
            <Feat ic="🛰️" t="Śledzenie GPS">Pokazuje Twój kilometr na trasie i podąża za Tobą na mapie. Wygładza skoki sygnału i ostrzega przy słabym fiksie.</Feat>
            <Feat ic="👆" t="Symulacja dotykiem">Bez GPS? Dotknij dowolnego miejsca na mapie albo znacznika kilometra — apka policzy „co masz przed sobą" od tego punktu.</Feat>
            <Feat ic="📊" t="Lista „przede mną” + ETA">Wszystko w zasięgu 50/100/200 km, od najbliższego, z czasem dojazdu uwzględniającym podjazdy i (w planie) zmęczenie kolejnych dni.</Feat>
            <Feat ic="⚠️" t="Ostrzeżenia o lukach">„Następny sklep za 24 km", „ostatni sklep przed odcinkiem 30 km bez zaopatrzenia", osobno alerty o wodzie.</Feat>
            <Feat ic="★" t="Ulubione + alerty">Oznacz gwiazdką ważne punkty. Gdy się zbliżasz, dostajesz wibrację, dźwięk i powiadomienie — nawet z ekranem w kieszeni.</Feat>
            <Feat ic="🌙" t="Filtry">Włącz/wyłącz każdą kategorię, pokaż tylko ulubione (★) albo tylko miejsca czynne całodobowo (24h).</Feat>
            <Feat ic="🚴" t="Tryb jazdy">Ekran „na kierownicę": ogromny licznik km, ile do końca, czas i 4 najbliższe kategorie. Dotknij, by wyjść.</Feat>
            <Feat ic="📑" t="Planer wyprawy">Wielodniowy plan: tempo, km dziennie i sen → rozkład dni z obiadami, noclegami i własnymi przystankami.</Feat>
            <Feat ic="🛏️" t="Szczegóły miejsca">Godziny otwarcia, kuchnia, adres, telefon, strona. Przyciski: Nawiguj, Mapy Google, Booking (noclegi), Zadzwoń.</Feat>
            <Feat ic="💾" t="Zapis offline">Trasy i punkty zapisują się same w telefonie. Stan jazdy też — po restarcie wrócisz na swój kilometr.</Feat>
            <Feat ic="🗺️" t="Mapa offline trasy">Można pobrać kafelki mapy dla korytarza trasy, żeby sama mapa działała bez zasięgu (gdy funkcja jest włączona).</Feat>
            <Feat ic="⤓" t="Eksport / import pliku">Całą paczkę (trasa + miejsca + ulubione) zapiszesz do pliku .json i wczytasz gdzie indziej — bez ponownego pobierania.</Feat>
            <Feat ic="🔋" t="Oszczędzanie baterii">Rzadszy odczyt GPS — bateria starcza na całodniową trasę. Włączasz w ustawieniach.</Feat>
            <Feat ic="🌓" t="Motyw jasny / ciemny">Cała aplikacja w dwóch wariantach. Domyślnie ciemny „noc → świt"; jasny na słońce.</Feat>
            <Feat ic="🌐" t="Trzy języki">Ekran logowania i komunikaty po polsku, angielsku i niemiecku (PL / EN / DE).</Feat>
            <Feat ic="👤" t="Konto i synchronizacja">Opcjonalne konto e-mail (lub logowanie biometrią) synchronizuje trasy między komputerem a telefonem.</Feat>
          </div>
        </section>

        {/* TRYB JAZDY */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">W ruchu</div>
            <h2>Tryb jazdy</h2>
            <p className="lead dim">Jeden przycisk <b>„🚴 Jazda"</b> i ekran zamienia się w prosty kokpit, który odczytasz jednym spojrzeniem z roweru.</p>
          </div>
          <div className="hp-split">
            <div className="hpm-phone" aria-label="Makieta trybu jazdy">
              <div className="hpm-screen ride">
                <div className="hpm-rkm">126,4<span> km</span></div>
                <div className="hpm-rsub">318 km do końca · ⏱ ≈ 16 h 10 min</div>
                <div className="hpm-rcells">
                  <div className="hpm-rcell"><div className="hpm-rlab" style={{ color: "var(--food)" }}>Spożywcze</div><div className="hpm-rval">2,3 km</div><div className="hpm-rname">Żabka</div></div>
                  <div className="hpm-rcell"><div className="hpm-rlab" style={{ color: "var(--water)" }}>Woda</div><div className="hpm-rval">8,1 km</div><div className="hpm-rname">Źródło</div></div>
                  <div className="hpm-rcell"><div className="hpm-rlab" style={{ color: "var(--fuel)" }}>Paliwo</div><div className="hpm-rval">5,0 km</div><div className="hpm-rname">Orlen</div></div>
                  <div className="hpm-rcell"><div className="hpm-rlab" style={{ color: "var(--eat)" }}>Jedzenie</div><div className="hpm-rval">1,2 km</div><div className="hpm-rname">Bar u Heńka</div></div>
                </div>
                <div className="hpm-rhint">dotknij, by wyjść · 🔋 oszczędzanie</div>
              </div>
            </div>
            <div className="hp-desc">
              <p className="lead">Wielkie cyfry, wysoki kontrast, zero rozpraszaczy. Widzisz tylko to, co istotne na trasie:</p>
              <ul className="hp-check">
                <li><div><b>Twój kilometr</b> dużą czcionką<small>i ile zostało do końca z szacowanym czasem.</small></div></li>
                <li><div><b>Cztery najbliższe kategorie</b><small>spożywcze, woda, paliwo, jedzenie — odległość i nazwa najbliższego punktu.</small></div></li>
                <li><div><b>Działa z oszczędzaniem baterii</b><small>na całodniowej jeździe. Wyjście — dotknięcie ekranu.</small></div></li>
              </ul>
            </div>
          </div>
        </section>

        {/* PLANER */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">Przed startem</div>
            <h2>Planer wyprawy</h2>
            <p className="lead dim">Ułóż wielodniowy plan: wybierasz tempo i ile km dziennie, a apka rozkłada trasę na dni z obiadami, noclegami i godzinami postojów.</p>
          </div>
          <div className="hp-split">
            <div className="hpm-phone" aria-label="Makieta planera">
              <div className="hpm-screen sheet">
                <div className="hpm-sh"><span>📑 Planner wyprawy</span><span className="hpm-ic">✕</span></div>
                <div className="hpm-modes">
                  <div className="hpm-mode"><b>Maksymalny (top 10)</b><small>350 km/dzień · 25 km/h · sen 3 h</small></div>
                  <div className="hpm-mode on"><b>Mocny</b><small>250 km/dzień · 22 km/h · sen 6 h</small></div>
                  <div className="hpm-mode"><b>Rekreacyjny</b><small>140 km/dzień · 18 km/h · sen 8 h</small></div>
                </div>
                <div className="hpm-cfg">
                  <div className="hpm-fld">Śr. prędkość<b>22 km/h</b></div>
                  <div className="hpm-fld">Dystans/dzień<b>250 km</b></div>
                  <div className="hpm-fld">Sen<b>6 h</b></div>
                  <div className="hpm-fld">Godz. obiadu<b>13:00</b></div>
                </div>
                <div className="hpm-active">✓ Plan aktywny — obiad, nocleg i Twoje przystanki będą podświetlone i powiadomią Cię, gdy się zbliżysz.</div>
                <div className="hpm-day">
                  <div className="ds"><b>Dzień 1</b><span>km 0–250 · 🛏 22:40</span></div>
                  <div className="dst">🍽 Obiad · 13:10 · km 118 — Karczma Pod Lasem</div>
                  <div className="dst">🛏 Nocleg · 22:40 · km 248 · 1,2 km — Pensjonat Brzeg</div>
                </div>
                <div className="hpm-day">
                  <div className="ds"><b>Dzień 2</b><span>km 250–444 · 🏁 19:05</span></div>
                  <div className="dst">🍽 Obiad · 13:30 · km 360 — Bar Mleczny</div>
                </div>
              </div>
            </div>
            <div className="hp-desc">
              <ul className="hp-check amber">
                <li><div><b>Trzy gotowe tryby</b><small>Maksymalny (top 10), Mocny, Rekreacyjny — albo ustaw własną prędkość, km/dzień, sen i godzinę obiadu ręcznie.</small></div></li>
                <li><div><b>Rozkład dni</b><small>Każdy dzień to zakres kilometrów, godzina noclegu lub mety, propozycja obiadu i noclegu (z linkiem do Booking).</small></div></li>
                <li><div><b>Realny czas</b><small>Uwzględnia podjazdy i narastające zmęczenie — każdy kolejny dzień nieco wolniej.</small></div></li>
                <li><div><b>Własne przystanki</b><small>Dorzuć dowolne miejsce z trasy (woda, postój) do danego dnia; ulubione są na górze listy.</small></div></li>
                <li><div><b>Aktywny plan na trasie</b><small>Punkty z planu są oznaczone 📋 na liście i alarmują, gdy się zbliżasz.</small></div></li>
              </ul>
            </div>
          </div>
        </section>

        {/* MENU */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">Pod przyciskiem ☰</div>
            <h2>Co jest w menu</h2>
            <p className="lead dim">Menu dzieli się na zwijane sekcje. Oto wszystko, co w nim znajdziesz.</p>
          </div>
          <h3 style={{ marginBottom: 12 }}>🧭 Trasa i miejsca</h3>
          <div className="hp-grid">
            <Mi e="📂" t="Wczytaj trasę (.gpx)">Nowy ślad wyścigu (miejsca pobiorą się same).</Mi>
            <Mi e="⬇" t="Pobierz miejsca">Dobierz lub odśwież punkty wzdłuż trasy.</Mi>
            <Mi e="🔎" t="Promień szukania">100 m – 2 km dla sklepów/jedzenia/paliwa. Noclegi zawsze do 5 km.</Mi>
            <Mi e="🗺" t="Pobierz mapę offline">Kafelki mapy dla korytarza trasy (gdy włączone).</Mi>
            <Mi e="📂" t="Wczytaj zapisaną offline">Otwórz jedną z wcześniej pobranych map.</Mi>
            <Mi e="✏ / 🗑" t="Zmień nazwę / Usuń">Zarządzaj bieżącą zapisaną trasą.</Mi>
            <Mi e="⤓" t="Eksportuj do pliku (.json)">Backup całej paczki na dysk.</Mi>
            <Mi e="📥" t="Wczytaj z pliku (.json)">Odtwórz paczkę bez ponownego pobierania.</Mi>
          </div>
          <h3 style={{ margin: "24px 0 12px" }}>👤 Konto</h3>
          <div className="hp-grid">
            <Mi e="👤" t="Zaloguj / załóż konto">Wejście na ekran logowania.</Mi>
            <Mi e="⟳" t="Synchronizuj teraz">Ręcznie wyślij i pobierz trasy z chmury.</Mi>
            <Mi e="🔒" t="Logowanie biometrią">Włącz/wyłącz Face ID / Touch ID / Windows Hello.</Mi>
            <Mi e="↪" t="Wyloguj">Trasy zostają offline na urządzeniu.</Mi>
          </div>
          <h3 style={{ margin: "24px 0 12px" }}>⚙️ Ustawienia · ❔ Pomoc</h3>
          <div className="hp-grid">
            <Mi e="🌓" t="Motyw">Ciemny / Jasny.</Mi>
            <Mi e="🔋" t="Oszczędzanie baterii">Rzadszy odczyt GPS.</Mi>
            <Mi e="📏" t="Zasięg listy „przede mną”">50 / 100 / 200 km.</Mi>
            <Mi e="❔" t="Jak korzystać / O MiroBike">Krótka pomoc i ta instrukcja.</Mi>
            <Mi e="📤" t="Poleć aplikację">Udostępnij link znajomym.</Mi>
            <Mi e="☕ / ✉" t="Postaw mi kawę / Kontakt">Wsparcie autora i e-mail kontaktowy.</Mi>
          </div>
        </section>

        {/* KONTO */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">Najważniejsze pytanie</div>
            <h2>Co daje założenie konta?</h2>
            <p className="lead">Krótko: <b>aplikacja działa w 100% bez konta.</b> Konto to wyłącznie wygoda — synchronizacja między urządzeniami i kopia w chmurze. Nic nie tracisz, zostając „bez konta".</p>
          </div>
          <div className="hp-acct">
            <div className="hp-acols">
              <div className="hp-acol free">
                <h3><span className="hp-tag">Bez konta</span> Wszystko działa</h3>
                <ul className="hp-check">
                  <li><div>Wczytywanie tras GPX i automatyczne pobieranie miejsc</div></li>
                  <li><div>Pełne działanie offline w terenie<small>trasy i punkty zapisane w tym telefonie</small></div></li>
                  <li><div>GPS, lista „przede mną", ostrzeżenia, ulubione</div></li>
                  <li><div>Tryb jazdy i planer wyprawy</div></li>
                  <li><div>Eksport/import paczki przez plik .json<small>ręczny sposób przenoszenia między urządzeniami</small></div></li>
                </ul>
              </div>
              <div className="hp-acol plus">
                <h3><span className="hp-tag">Z kontem</span> Dodatkowo</h3>
                <ul className="hp-check amber">
                  <li><div><b>Synchronizacja PC ↔ telefon</b><small>Przygotuj trasy wygodnie na komputerze, a w telefonie pobiorą się automatycznie do pamięci offline.</small></div></li>
                  <li><div><b>Kopia w chmurze</b><small>Zmieniasz lub gubisz telefon? Logujesz się na nowym i trasy wracają.</small></div></li>
                  <li><div><b>Te same trasy na każdym urządzeniu</b><small>Jedno konto, ten sam zestaw map wszędzie — bez przerzucania plików.</small></div></li>
                  <li><div><b>Wygodne logowanie biometrią</b><small>Face ID / Touch ID / Windows Hello zamiast wpisywania hasła.</small></div></li>
                </ul>
              </div>
            </div>
            <div className="hp-note">
              <b>Jak założyć:</b> menu <span className="hp-keycap">☰</span> → <b>Konto</b> → <b>„Zaloguj / załóż konto"</b>. Podajesz e-mail i hasło (min. 8 znaków). Konto jest darmowe. Po zalogowaniu trasy z tego urządzenia trafiają na konto i stają się dostępne na innych. Hasło zresetujesz linkiem na e-mail, a wylogowanie nie kasuje tras zapisanych offline na urządzeniu.
            </div>
          </div>
        </section>

        {/* OFFLINE */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">W terenie</div>
            <h2>Offline i instalacja na telefonie</h2>
          </div>
          <div className="hp-split">
            <div className="hpm-phone" aria-label="Makieta ekranu logowania">
              <div className="hpm-screen login">
                <div className="hpm-wheel" aria-hidden="true" />
                <div className="hpm-lbrand">Miro<b>Bike</b></div>
                <div className="hpm-lthesis"><b>Wiedz, gdzie kupisz wodę i jedzenie</b> — zanim wjedziesz w ciemność.</div>
                <div className="hpm-lacct">
                  <h4>Po co konto?</h4>
                  <p>Aplikacja działa w pełni bez konta — trasy są offline na tym urządzeniu.</p>
                  <p>Konto dodaje synchronizację PC ↔ telefon i kopię w chmurze.</p>
                </div>
                <div className="hpm-tabs"><div className="hpm-tab on">Logowanie</div><div className="hpm-tab">Rejestracja</div></div>
                <div className="hpm-lfld">E-mail — ty@example.com</div>
                <div className="hpm-lfld">Hasło — ••••••••</div>
                <div className="hpm-lbtn">Zaloguj się</div>
                <div className="hpm-lghost">Korzystaj bez konta →</div>
              </div>
            </div>
            <div className="hp-desc">
              <p className="lead">To, co najważniejsze dla ultra: <b>w terenie nie potrzebujesz zasięgu.</b> Raz pobrane trasy i miejsca są zapisane w telefonie i otwierają się natychmiast, nawet w lesie bez internetu. (Sama mapa potrzebuje sieci, chyba że pobierzesz ją offline dla trasy.)</p>
              <ul className="hp-check">
                <li><div><b>Dodaj do ekranu początkowego</b><small>iPhone (Safari): <b>Udostępnij</b> → <b>„Dodaj do ekranu początkowego"</b>. Apka odpali się na pełnym ekranie jak zwykła aplikacja.</small></div></li>
                <li><div><b>Pierwszy ekran = logowanie</b><small>Możesz się zalogować albo wybrać <b>„Korzystaj bez konta"</b> i od razu działać.</small></div></li>
                <li><div><b>Wznawianie po restarcie</b><small>Gdyby telefon ubił aplikację w trasie, wrócisz na swój kilometr — stan jazdy jest zapisywany.</small></div></li>
              </ul>
            </div>
          </div>
        </section>

        {/* LEGENDA */}
        <section className="hp-section">
          <div className="hp-sech hp-read">
            <div className="eyebrow">Ściąga</div>
            <h2>Kolory kategorii i ikony</h2>
          </div>
          <div className="hp-split two">
            <div>
              <h3 style={{ marginBottom: 10 }}>Kategorie miejsc</h3>
              <table className="hp-legend"><tbody>
                <Leg c="food" name="Spożywcze">Sklepy, markety, piekarnie, kioski</Leg>
                <Leg c="sleep" name="Nocleg">Hotele, pensjonaty, hostele, kempingi</Leg>
                <Leg c="water" name="Woda">Wodopoje, krany, źródła</Leg>
                <Leg c="fuel" name="Paliwo">Stacje paliw (często czynne 24h)</Leg>
                <Leg c="eat" name="Jedzenie">Restauracje, bary, kawiarnie, fast food</Leg>
                <Leg c="bike" name="Rower">Serwisy i stacje napraw</Leg>
                <Leg c="pharmacy" name="Apteka">Apteki</Leg>
                <Leg c="spot" name="Własne">Punkty zaimportowane przez Ciebie</Leg>
              </tbody></table>
            </div>
            <div>
              <h3 style={{ marginBottom: 10 }}>Ikony i znaczniki</h3>
              <table className="hp-legend"><tbody>
                <tr><td><span className="hp-keycap">★ / ☆</span></td><td className="dim">W ulubionych / dodaj do ulubionych</td></tr>
                <tr><td><span className="hp-keycap">📋</span></td><td className="dim">Punkt należy do aktywnego planu</td></tr>
                <tr><td><span className="hp-keycap">🌙 24h</span></td><td className="dim">Czynne całodobowo</td></tr>
                <tr><td><span className="hp-keycap">⏱</span></td><td className="dim">Szacowany czas dojazdu</td></tr>
                <tr><td><span className="hp-sw"><span className="s" style={{ background: "var(--here)" }} /></span></td><td className="dim">Twoja aktualna pozycja</td></tr>
                <tr><td><span className="hp-sw"><span className="s" style={{ background: "#23c552" }} />/<span className="s" style={{ background: "#ff4d4d" }} /></span></td><td className="dim">START / META trasy</td></tr>
                <tr><td><span className="hp-keycap">+12,0</span></td><td className="dim">Ile kilometrów przed Tobą jest dany punkt</td></tr>
                <tr><td><span className="hp-keycap">lewa / prawa</span></td><td className="dim">Z której strony trasy leży miejsce</td></tr>
              </tbody></table>
            </div>
          </div>
        </section>

        <div className="hp-foot">
          MiroBike Ultra Planner — instrukcja obsługi · darmowy planer dla ultra-kolarzy.<br />
          Dane: © OpenStreetMap contributors, Overture Maps Foundation · kontakt: contact@grapevest.pl · wersja {__BUILD__}
        </div>

      </div>
    </div>
  );
}

function Feat({ ic, t, children }: { ic: string; t: string; children: React.ReactNode }) {
  return (
    <div className="hp-feat">
      <div className="ic">{ic}</div>
      <h3>{t}</h3>
      <p>{children}</p>
    </div>
  );
}

function Mi({ e, t, children }: { e: string; t: string; children: React.ReactNode }) {
  return (
    <div className="hp-feat">
      <div className="ic">{e}</div>
      <h3>{t}</h3>
      <p>{children}</p>
    </div>
  );
}

function Leg({ c, name, children }: { c: string; name: string; children: React.ReactNode }) {
  return (
    <tr>
      <td><span className="hp-sw"><span className="s" style={{ background: `var(--${c})` }} />{name}</span></td>
      <td className="dim">{children}</td>
    </tr>
  );
}
