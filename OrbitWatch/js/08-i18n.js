// ---- i18n ----
var lang = localStorage.getItem("orbitwatch_lang") || "pl";
var I18N = {
  pl: {
    // header / stats
    "total": "total", "vis": "vis", "filt": "filt", "fps": "fps",
    // panel left
    "search": "szukaj", "search_placeholder": "nazwa, NORAD ID...",
    "filter": "filtr",
    "all": "wszystkie", "starlink": "starlink", "stations": "stacje",
    "weather": "pogodowe", "gnss": "nawigacyjne", "science": "naukowe", "debris": "szczatki",
    "objects": "obiekty",
    // panel right
    "select_target": "wybierz satelite",
    "description": "opis", "current_position": "pozycja aktualna",
    "latitude": "szerokosc", "longitude": "dlugosc", "altitude": "wysokosc", "velocity": "predkosc",
    "orbital_elements": "elementy orbitalne",
    "inclination": "inklinacja", "eccentricity": "mimosrod", "mean_motion": "sr. ruch",
    "period": "okres", "category": "kategoria",
    "orbit_trail": "slad orbity",
    "show_orbit": "pokaz slad orbity", "hide_orbit": "ukryj slad orbity",
    "side_view": "widok boczny",
    "catalog_data": "dane katalogowe",
    "type": "typ", "country": "kraj/org.", "launch_date": "start",
    "launch_site": "miejsce startu", "apogee": "apogeum", "perigee": "perygeum",
    "rcs": "przekroj rad.",
    "tle_line_1": "tle line 1", "tle_line_2": "tle line 2",
    "satellite": "satelita",
    // bottom bar
    "src": "src", "satdb": "satdb",
    "space_track_btn": "space-track", "debris_btn": "szczatki",
    "init": "init...",
    "loading_count": "Zaladowano {n} satelitow ({src})",
    "loading_tle": "ladowanie TLE", "fetching": "pobieranie z serwera",
    // tooltip
    "minute_short": "min", "km_short": "km", "kms_short": "km/s", "revd_short": "rev/d",
    // language toggle
    "lang_label": "lang",
    "altitude_range": "wysokosc orbity",
    "velocity_range": "predkosc orbitalna",
    "launch_sites": "miejsca startow",
    "missions_from": "Misje z tego miejsca",
    "favorites": "ulubione",
    "time_warp": "skala czasu",
    "now": "teraz",
    "color_mode": "kolor",
    "cm_category": "kategoria",
    "cm_altitude": "wysokosc",
    "debris_tooltip": "Pokaz/ukryj szczatki",
    "chase_cam": "TRYB POGONI",
    "cc_top": "GORA", "cc_angle": "SKOS", "cc_side": "BOK", "cc_now": "TERAZ",
    "cc_hint": "PPM: obrot | TAB: widok | ESC: wyjscie",
    "cc_sats_on": "satelity: WL", "cc_sats_off": "satelity: WYL", "cc_exit": "wyjscie",
  },
  en: {
    "total": "total", "vis": "vis", "filt": "filt", "fps": "fps",
    "search": "search", "search_placeholder": "name, NORAD ID...",
    "filter": "filter",
    "all": "all", "starlink": "starlink", "stations": "stations",
    "weather": "weather", "gnss": "gnss", "science": "science", "debris": "debris",
    "objects": "objects",
    "select_target": "select target",
    "description": "description", "current_position": "current position",
    "latitude": "latitude", "longitude": "longitude", "altitude": "altitude", "velocity": "velocity",
    "orbital_elements": "orbital elements",
    "inclination": "inclination", "eccentricity": "eccentricity", "mean_motion": "mean motion",
    "period": "period", "category": "category",
    "orbit_trail": "orbit trail",
    "show_orbit": "show orbit trail", "hide_orbit": "hide orbit trail",
    "side_view": "side view",
    "catalog_data": "catalog data",
    "type": "type", "country": "country/org", "launch_date": "launch date",
    "launch_site": "launch site", "apogee": "apogee", "perigee": "perigee",
    "rcs": "radar x-section",
    "tle_line_1": "tle line 1", "tle_line_2": "tle line 2",
    "satellite": "satellite",
    "src": "src", "satdb": "satdb",
    "space_track_btn": "space-track", "debris_btn": "debris",
    "init": "init...",
    "loading_count": "Loaded {n} satellites ({src})",
    "loading_tle": "loading TLE", "fetching": "fetching from server",
    "minute_short": "min", "km_short": "km", "kms_short": "km/s", "revd_short": "rev/d",
    "lang_label": "lang",
    "altitude_range": "orbit altitude",
    "velocity_range": "orbital velocity",
    "launch_sites": "launch sites",
    "missions_from": "Missions from this site",
    "favorites": "favorites",
    "time_warp": "time warp",
    "now": "now",
    "color_mode": "color",
    "cm_category": "category",
    "cm_altitude": "altitude",
    "debris_tooltip": "Toggle debris",
    "chase_cam": "CHASE CAM",
    "cc_top": "TOP", "cc_angle": "ANGLE", "cc_side": "SIDE", "cc_now": "NOW",
    "cc_hint": "RMB drag: rotate | TAB: switch | ESC: exit",
    "cc_sats_on": "sats: ON", "cc_sats_off": "sats: OFF", "cc_exit": "exit",
  }
};
function t(key, vars) {
  const dict = I18N[lang] || I18N.pl;
  let s = dict[key] || I18N.pl[key] || key;
  if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
  return s;
}
function setLang(newLang) {
  if (!I18N[newLang]) return;
  lang = newLang;
  localStorage.setItem("orbitwatch_lang", lang);
  applyI18n();
  // Przerysuj otwarty panel z nowym językiem - kosmodrom albo satelita
  if (_currentLaunchSite) showLaunchSitePopup(_currentLaunchSite);
  else if (selected) renderPanel(selected);
}
function applyI18n() {
  // Wszystkie elementy z data-i18n="key"
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  // Highlight active language button
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
  // Dynamiczne elementy (tekst wstawiany przez JS, bez data-i18n)
  // Color mode label
  const cmLbl = document.getElementById("colormode-label");
  if (cmLbl) cmLbl.textContent = colorMode === "altitude" ? t("cm_altitude") : t("cm_category");
  const cmPre = document.getElementById("colormode-prefix");
  if (cmPre) cmPre.textContent = t("color_mode") + ": ";
  // Debris button title
  const dbBtn = document.getElementById("debris-toggle");
  if (dbBtn) dbBtn.title = t("debris_tooltip");
  // Chase cam banner - przerysuj jeśli aktywny
  if (chaseCam) refreshChaseBanner();
}

// Tworzy banner chase cam z aktualnym jezykiem i toggle widocznosci satelitow.
function refreshChaseBanner() {
  const ind = document.getElementById("tracking-ind");
  if (!ind) return;
  const satsLabel = chaseSatVisible ? t("cc_sats_on") : t("cc_sats_off");
  ind.innerHTML = t("chase_cam") + " | "
    + "<span onclick='toggleChaseSats();event.stopPropagation()' style='cursor:pointer;padding:0 4px;color:" + (chaseSatVisible ? "var(--accent)" : "var(--dim)") + "'>" + satsLabel + "</span>"
    + " | <span onclick='recenterChaseCam();event.stopPropagation()' style='cursor:pointer;padding:0 4px;color:var(--warn)'>&#8634; " + t("cc_now") + "</span>"
    + " | ESC: " + t("cc_exit");
  ind.style.display = "block";
}

var rotX = 0.28;
var rotY = 0.0;
var zoom = 1.0;
var dragging = false;
var autoRot = true;
var tracking  = false;
var showAtmosphere = true;   // poswiata atmosfery wokol globu
var chaseCam  = false;
var _dragMoved = false;   // true gdy mysz poruszyla sie podczas LMB down
var lastMX    = 0, lastMY  = 0;

var W, H, R;
var cvs, ctx;

var fpsLast = 0;
var fpsCount = 0;
var fps = 0;
var _perfPanelOn = false;   // panel metryk (klawisz P)
var _propMs = 0;            // czas propagacji w glownym watku (ms)
var _frameMs = 0;           // czas calej klatki (ms)
var _propCount = 0;         // liczba satelitow propagowanych w tej klatce
var _visCount = 0;          // liczba widocznych satelitow (z drawSats)

