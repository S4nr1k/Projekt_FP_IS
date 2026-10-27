// ---- SELECT ----
function selectSat(sat) {
  _currentLaunchSite = null;  // wybór satelity zamyka widok kosmodromu
  if (selected !== sat) {
    // Wyczyść trail starego sat (gdyby został w pamięci)
    if (selected) selected._trail = null;
    if (sat) sat._trail = [];
  }
  selected = sat;
  orbitOn  = true;
  autoRot  = false;
  renderPanel(sat);
  renderList();
  setTimeout(scrollListToSelected, 0);
}

// Description lookup - keyed by partial name match or NORAD ID
var SAT_DESC = {
  // Stacje kosmiczne
  "ISS":        "Miedzynarodowa Stacja Kosmiczna (ISS) - zalogowany laboratorium naukowe na orbicie okolo 420 km. Wspolny projekt NASA, Roskosmos, ESA, JAXA i CSA. Na pokladzie stale przebywa 6–7 astronautow.",
  "ZARYA":      "Miedzynarodowa Stacja Kosmiczna (ISS) - zalogowany laboratorium naukowe na orbicie okolo 420 km. Wspolny projekt NASA, Roskosmos, ESA, JAXA i CSA.",
  "TIANGONG":   "Chinska Stacja Kosmiczna (CSS/Tiangong) - zalogowana stacja orbitalna ChRL na orbicie okolo 390 km. Rozbudowywana od 2021 r.; moduly Tianhe, Wentian i Mengtian.",
  // Starlink
  "STARLINK":   "Satelita konstelacji Starlink firmy SpaceX. Jedna z ponad 7000 jednostek tworzacych globalna siec szerokopasmowego internetu satelitarnego LEO (~550 km).",
  // Nawigacja GPS
  "NAVSTAR":    "Satelita systemu GPS (Global Positioning System) US Space Force. Orbita MEO ~20 200 km; zapewnia dokladnosc pozycjonowania ponizej 1 m dla odbiorcow cywilnych.",
  "GPS":        "Satelita systemu GPS (Global Positioning System). Orbita MEO ~20 200 km, inklinacja ~55 deg. Konstelacja 24+ satelitow zapewnia globalny zasieg.",
  "GLONASS":    "Satelita rosyjskiego systemu nawigacji GLONASS (Globalniaja Nawigacjonnaja Sputnikowaja Sistema). Orbita MEO ~19 140 km, inklinacja 64.8 deg. Odpowiednik GPS.",
  "GALILEO":    "Satelita europejskiego systemu nawigacji Galileo (ESA/UE). Orbita MEO ~23 222 km. Oferuje dokladnosc ponizej 1 m i uslugi ratunkowe SAR.",
  "BEIDOU":     "Satelita chinskiego systemu nawigacji BeiDou (BDS). Konstelacja mieszana LEO/MEO/GEO, globalna od 2020 r. Chinski odpowiednik GPS.",
  // Pogodowe
  "NOAA":       "Satelita pogodowy NOAA (National Oceanic and Atmospheric Administration, USA). Orbita polarna SSO ~830 km; skanuje cala Ziemie co 12 h zbierajac dane atmosferyczne.",
  "METOP":      "Satelita meteorologiczny METOP (EUMETSAT/ESA). Orbita polarna SSO ~817 km; gromadzi dane do prognoz pogody dla Europy i swiata.",
  "GOES":       "Satelita geostacjonarny GOES (NOAA). Orbita GEO ~35 786 km nad rownikiem; stale obserwuje polkule zachodnia i dostarcza obrazy chmur w czasie rzeczywistym.",
  "METEOSAT":   "Europejski satelita geostacjonarny METEOSAT (EUMETSAT). Orbita GEO ~35 786 km; monitoruje pogode nad Europa, Afryka i Oceanem Indyjskim.",
  "HIMAWARI":   "Japonski satelita geostacjonarny Himawari (JMA). Orbita GEO nad Pacyfikiem; obserwuje pogode Azji Wschodniej i Australii co 10 minut.",
  "FENGYUN":    "Chinski satelita meteorologiczny Fengyun (CMA). Seria polarnych i geostacjonarnych satelitow pogodowych; 'fengyun' oznacza 'wiatr i chmury'.",
  // Naukowe
  "HUBBLE":     "Kosmiczny Teleskop Hubble'a (NASA/ESA). Orbita LEO ~540 km, inklinacja 28.5 deg. Od 1990 r. wykonuje obserwacje optyczne i UV, zmienial nasz obraz Wszechswiata.",
  "HST":        "Kosmiczny Teleskop Hubble'a (NASA/ESA). Orbita LEO ~540 km. Jeden z najwazniejszych instrumentow astronomicznych w historii.",
  "TERRA":      "Satelita Earth Observing System TERRA (NASA). Orbita SSO ~705 km. Misja EOS AM-1; 5 instrumentow mierzacych zmiany klimatu, roslinnosc i atmosfere.",
  "AQUA":       "Satelita Earth Observing System AQUA (NASA). Orbita SSO ~705 km. Bada cykl hydrologiczny Ziemi: opady, wilgotnosc, pokrywe sniezna i lodowa.",
  "AURA":       "Satelita AURA (NASA). Orbita SSO ~705 km. Bada chemic atmosfery - warstwe ozonowa, jakosc powietrza i zwiazki z klimatem.",
  "SENTINEL-1": "Satelita radarowy Sentinel-1 (ESA/Copernicus). Orbita SSO ~693 km, radar SAR C-band. Monitoruje ladolody, wycieki ropy, trzesienia ziemi i zmiany uzytkowania terenu.",
  "SENTINEL-2": "Satelita multispektralny Sentinel-2 (ESA/Copernicus). Orbita SSO ~786 km, 13 kanalow spektralnych, rozdzielczosc 10 m. Kartuje roslinnosc, uprawy i zbiorniki wodne.",
  "SENTINEL-3": "Satelita oceanograficzny Sentinel-3 (ESA/Copernicus). Orbita SSO ~814 km. Mierzy temperature powierzchni morza, kolor oceanu i topografie.",
  "SENTINEL-6": "Satelita altimetryczny Sentinel-6 / Michael Freilich (ESA/NASA/NOAA). Orbita ~1336 km. Mierzy poziom morza z dokladnoscia do kilku milimetrow.",
  "LANDSAT":    "Satelita teledetekcyjny Landsat (NASA/USGS). Orbita SSO ~705 km. Najdluzsza nieprzerwana archiwum zdiec powierzchni Ziemi - od 1972 r.",
  "ICESAT":     "Satelita ICESat-2 (NASA). Orbita ~500 km. Laserowy altimetr ATLAS mierzy grubosc lodowcow i pokrywy lodowej Arktyki i Antarktyki.",
  "GRACE":      "Satelita GRACE-FO (NASA/GFZ). Para satelitow ~490 km. Mierzy zmiany pola grawitacyjnego Ziemi; ujawnia utrate masy lodowcow i poziom wod gruntowych.",
  "SWARM":      "Konstelacja Swarm (ESA). Trzy satelity ~450–530 km. Badaja pole magnetyczne Ziemi z bezprecedensowa dokladnoscia.",
  "CRYOSAT":    "Satelita CryoSat-2 (ESA). Orbita ~720 km, inklinacja 92 deg. Mierzy grubosc arktycznych i antarktycznych pokryw lodowych.",
  "AEOLUS":     "Satelita AEOLUS (ESA). Orbita SSO ~320 km. Pierwszy satelita mierzacy globalne profile wiatrow atmosferycznych za pomoca lidaru UV.",
  "CLOUDSAT":   "Satelita CloudSat (NASA). Orbita SSO ~705 km. Radar milimetrowy bada strukture 3D chmur i opadow; lata w formacji 'A-Train'.",
  "CALIPSO":    "Satelita CALIPSO (NASA/CNES). Orbita SSO ~705 km. Lidar aerozolowy mierzy profile pylu, dymu i chmur cyrrusowych; czesc A-Train.",
  "CHEOPS":     "Teleskop CHEOPS (ESA/Szwajcaria). Orbita SSO ~700 km. Bada egzoplanety tranzytem - mierzy dokladne rozmiary i gestosc znanych planet pozaslonecznych.",
  "JASON":      "Satelita Jason-3 (CNES/NOAA/NASA/EUMETSAT). Orbita ~1336 km. Altimetryczny pomiar poziomu morzow i oceanow; kontynuuje serie pomiarow od 1992 r.",
  "FLOCK":      "Nanosatelita Flock / Dove (Planet Labs). Orbita SSO ~475 km, format 3U CubeSat. Czesc konstelacji ponad 200 satelitow fotografujacych cala Ziemie codziennie.",
  "LEMUR":      "Nanosatelita Lemur-2 (Spire Global). Orbita SSO ~500 km. Ocenia pogode przez radio-okultacje GPS; zbiera dane AIS ze statkow i ADS-B z samolotow.",
  // Inne
  "ONEWEB":     "Satelita konstelacji OneWeb (Eutelsat OneWeb). Orbita LEO ~1200 km, inklinacja 87.9 deg. Jeden z ok. 600+ satelitow sieci szerokopasmowego internetu.",
  "IRIDIUM":    "Satelita konstelacji Iridium NEXT. Orbita LEO ~780 km, inklinacja 86.4 deg. Globalna siec telefonii satelitarnej i transmisji danych; 66 aktywnych satelitow.",
  "GLOBALSTAR": "Satelita systemu Globalstar. Orbita LEO ~1414 km. Globalna siec telefonii i danych satelitarnych; uzywany m.in. w urzadzeniach ratunkowych.",
  "ORBCOMM":    "Satelita sieci ORBCOMM. Orbita LEO ~560 km. Przesylanie krotkich wiadomosci M2M (machine-to-machine); monitoring pojazdow, kontenerow i infrastruktury.",
  "INTELSAT":   "Satelita geostacjonarny Intelsat. Orbita GEO ~35 786 km. Jeden z najwiekszych komercyjnych operatorow satelitow telekomunikacyjnych na swiecie.",
  "SES":        "Satelita geostacjonarny SES. Orbita GEO lub MEO. Europejski operator telekomunikacyjny; dostarcza TV, internet i lacza rzadowe.",
  "EUTELSAT":   "Satelita geostacjonarny Eutelsat. Orbita GEO ~35 786 km. Europejski operator zapewniajacy dystrybucje TV i internet satelitarny dla Europy i Afryki.",
};

function getSatDesc(sat) {
  const n = sat.name.toUpperCase();
  for (const [key, desc] of Object.entries(SAT_DESC)) {
    if (n.includes(key.toUpperCase())) return desc;
  }
  return null;
}

// To przelicza ruch sredni z satellite.js (radiany na minute) na obiegi na dobe.
function revPerDay(sat) {
  return sat.satrec ? sat.satrec.no * 1440 / (2 * Math.PI) : NaN;
}

// To klasyfikuje orbite: HEO = silnie eliptyczna (mimosrod > 0.25),
// GEO = geosynchroniczna (ok. 1 obieg na dobe), LEO < 2000 km, reszta MEO.
function orbitClass(sat) {
  const ecc = sat.satrec ? sat.satrec.ecco : 0;
  const rev = revPerDay(sat);
  if (ecc > 0.25) return "HEO";
  if (sat.alt < 2000) return "LEO";
  if (rev > 0.9 && rev < 1.1) return "GEO";
  return "MEO";
}

function renderPanel(sat) {
  const pr = document.getElementById("panel-right");
  document.getElementById("pr-empty") && document.getElementById("pr-empty").remove();

  const altLabel = orbitClass(sat);
  const altClass = altLabel.toLowerCase();
  const vel = Math.hypot(sat.vx, sat.vy, sat.vz).toFixed(3);
  const period = sat.satrec ? ((2 * Math.PI / sat.satrec.no)).toFixed(1) : "---";
  const mm = sat.satrec ? revPerDay(sat).toFixed(6) : "---";

  const isFav = favorites.has(sat.norad);
  pr.innerHTML = `
    <div class="pr-header">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="pr-name" id="pr-sat-name" style="flex:1;min-width:0">${esc(sat.name)}</div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button title="${lang==='pl'?'dodaj do ulubionych':'toggle favorite'}"
            onclick="toggleFavorite('${nid(sat.norad)}')"
            style="background:transparent;border:1px solid var(--border);color:${isFav?'var(--warn)':'var(--dim)'};
                   font-size:14px;padding:0 6px;cursor:pointer;border-radius:0;height:22px;line-height:1">
            ${isFav ? '★' : '☆'}
          </button>
          <button title="${lang==='pl'?'kopiuj NORAD ID':'copy NORAD ID'}"
            onclick="copyToClipboard('${nid(sat.norad)}', this)"
            style="background:transparent;border:1px solid var(--border);color:var(--dim);
                   font-family:var(--mono);font-size:9px;padding:0 6px;cursor:pointer;border-radius:0;height:22px;line-height:1">
            ID
          </button>
          ${_allowTleExport ? `<button title="${lang==='pl'?'kopiuj TLE':'copy TLE'}"
            onclick="copyTLE('${nid(sat.norad)}', this)"
            style="background:transparent;border:1px solid var(--border);color:var(--dim);
                   font-family:var(--mono);font-size:9px;padding:0 6px;cursor:pointer;border-radius:0;height:22px;line-height:1">
            TLE
          </button>` : ''}
        </div>
      </div>
      <div class="pr-norad">
        NORAD: ${esc(sat.norad)}
        <span class="orbit-badge ${altClass}" id="pr-badge">${altLabel}</span>
      </div>
    </div>
    ${getSatDesc(sat) ? `<div class="info-section" style="background:rgba(0,180,255,0.04)"><div class="is-title">${t("description")}</div><div style="font-size:0.63rem;color:var(--text);line-height:1.6;font-family:var(--sans)">${getSatDesc(sat)}</div></div>` : ""}

    <div class="info-section">
      <div class="is-title">${t("current_position")}</div>
      <div class="data-row"><span class="dr-key">${t("latitude")}</span><span class="dr-val c-accent" id="pr-lat">${sat.lat.toFixed(5)}&deg;</span></div>
      <div class="data-row"><span class="dr-key">${t("longitude")}</span><span class="dr-val c-accent" id="pr-lng">${sat.lng.toFixed(5)}&deg;</span></div>
      <div class="data-row"><span class="dr-key">${t("altitude")}</span><span class="dr-val c-green" id="pr-alt">${isFinite(sat.alt) ? Math.round(sat.alt) : "---"} ${t("km_short")}</span></div>
      <div class="data-row"><span class="dr-key">${t("velocity")}</span><span class="dr-val c-yellow" id="pr-vel">${vel} ${t("kms_short")}</span></div>
    </div>

    <div class="info-section">
      <div class="is-title">${t("orbital_elements")}</div>
      <div class="data-row"><span class="dr-key">${t("inclination")}</span><span class="dr-val">${sat.inc.toFixed(4)}&deg;</span></div>
      <div class="data-row"><span class="dr-key">${t("eccentricity")}</span><span class="dr-val">${sat.ecc.toFixed(7)}</span></div>
      <div class="data-row"><span class="dr-key">${t("mean_motion")}</span><span class="dr-val">${mm} ${t("revd_short")}</span></div>
      <div class="data-row"><span class="dr-key">${t("period")}</span><span class="dr-val">${period} ${t("minute_short")}</span></div>
      <div class="data-row"><span class="dr-key">${t("category")}</span><span class="dr-val" style="color:${sat.color}">${sat.cat.toUpperCase()}</span></div>
    </div>

    <div class="info-section">
      <div class="is-title">${t("orbit_trail")}</div>
      <button class="btn-orbit ${orbitOn ? "on" : ""}" id="btn-orbit" onclick="toggleOrbit()">
        ${orbitOn ? t("hide_orbit") : t("show_orbit")}
      </button>
    </div>

    <div class="info-section">
      <div class="is-title">${t("side_view")}</div>
      <canvas id="sat-side-view" width="220" height="110" style="width:100%;border-radius:4px;background:rgba(0,0,0,0.3)"></canvas>
    </div>

    <div class="info-section" id="pr-satcat" style="display:none"></div>

    <div class="info-section">
      <div class="is-title">${t("tle_line_1")}</div>
      <div class="tle-block">${esc(sat.tle1)}</div>
    </div>
    <div class="info-section">
      <div class="is-title">${t("tle_line_2")}</div>
      <div class="tle-block">${esc(sat.tle2)}</div>
    </div>
  `;

  // Live-update position fields
  // Fetch SATCAT info asynchronously and update panel
  fetchSatInfo(sat.norad).then(info => {
    const sec = document.getElementById("pr-satcat");
    if (!sec || !info || !info.obj_type) return;
    let rows = "";
    if (info.obj_type)    rows += `<div class="data-row"><span class="dr-key">${t("type")}</span><span class="dr-val" style="color:${info.obj_type_raw==='DEBRIS'?'var(--orange)':info.obj_type_raw==='PAYLOAD'?'var(--green)':'var(--text)'}">${esc(info.obj_type)}</span></div>`;
    if (info.country)     rows += `<div class="data-row"><span class="dr-key">${t("country")}</span><span class="dr-val">${esc(info.country)}</span></div>`;
    if (info.launch_date) rows += `<div class="data-row"><span class="dr-key">${t("launch_date")}</span><span class="dr-val c-accent">${esc(info.launch_date)}</span></div>`;
    if (info.launch_site) rows += `<div class="data-row"><span class="dr-key">${t("launch_site")}</span><span class="dr-val">${esc(info.launch_site)}</span></div>`;
    if (info.decay_date)  rows += `<div class="data-row"><span class="dr-key">${lang==='pl'?'Deorbitacja':'Decay'}</span><span class="dr-val c-orange">${esc(info.decay_date)}</span></div>`;
    if (info.apogee_km)   rows += `<div class="data-row"><span class="dr-key">${t("apogee")}</span><span class="dr-val">${esc(info.apogee_km)} ${t("km_short")}</span></div>`;
    if (info.perigee_km)  rows += `<div class="data-row"><span class="dr-key">${t("perigee")}</span><span class="dr-val">${esc(info.perigee_km)} ${t("km_short")}</span></div>`;
    if (info.rcs_size)    rows += `<div class="data-row"><span class="dr-key">${t("rcs")}</span><span class="dr-val">${esc(info.rcs_size)}</span></div>`;
    if (rows) {
      sec.innerHTML = `<div class="is-title">${t("catalog_data")}</div>${rows}`;
      sec.style.display = "block";
    }
  });

  clearInterval(window._panelTick);
  window._panelTick = setInterval(() => {
    if (selected !== sat) return;
    const pLat = document.getElementById("pr-lat");
    const pLng = document.getElementById("pr-lng");
    const pAlt = document.getElementById("pr-alt");
    const pVel = document.getElementById("pr-vel");
    if (!pLat) return;
    pLat.innerHTML = sat.lat.toFixed(5) + "&deg;";
    pLng.innerHTML = sat.lng.toFixed(5) + "&deg;";
    pAlt.textContent = (isFinite(sat.alt) ? Math.round(sat.alt) : "---") + " " + t("km_short");
    const v = Math.hypot(sat.vx, sat.vy, sat.vz).toFixed(3);
    pVel.textContent = v + " " + t("kms_short");
    drawSideView(sat);
  }, 500);
  drawSideView(sat);
}


// To kopiuje linie TLE wybranego obiektu (bez wstawiania tresci TLE do atrybutu onclick)
function copyTLE(norad, el) {
  const s = allSats.find(function(x) { return x.norad === norad; });
  if (s) copyToClipboard(s.tle1 + "\n" + s.tle2, el);
}
