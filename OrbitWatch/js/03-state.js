// ---- STATE ----
var allSats = [];
var filtered = [];
var selected = null;
var orbitOn    = false;
var activeCat  = "all";
var searchQ    = "";
var showDebris = false;   // default: hide debris/rocket bodies for performance
var favorites  = new Set();  // NORAD IDs of favorited satellites
var _currentLaunchSite = null;  // aktualnie otwarty kosmodrom w panelu (dla i18n)
var _allowTleExport = true;     // czy eksport surowych TLE dozwolony (polityka redystrybucji)
var _dataSource = "celestrak";  // zrodlo danych ("celestrak" | "spacetrack")
var _spacetrackAvailable = false;  // czy sa dane logowania Space-Track

// Pobiera polityke redystrybucji z backendu. Gdy dane ze Space-Track,
// eksport surowych TLE jest ukrywany (redystrybucja wymaga zgody USSPACECOM).
function fetchPolicy() {
  fetch("/api/policy").then(function(r) { return r.json(); }).then(function(p) {
    _allowTleExport = !!p.allow_tle_export;
    _dataSource = p.source || "celestrak";
    _spacetrackAvailable = !!p.spacetrack_available;
    updateSourceLabel();
  }).catch(function() { /* offline/bundled - zostaw domyslne */ });
}

// Aktualizuje etykiete zrodla danych w stopce.
function updateSourceLabel() {
  const el = document.getElementById("tle-source-label");
  if (el) el.textContent = _dataSource === "spacetrack" ? "Zrodlo: Space-Track.org" : "Zrodlo: CelesTrak";
  const tog = document.getElementById("source-toggle-label");
  if (tog) tog.textContent = _dataSource === "spacetrack" ? "Space-Track" : "CelesTrak";
  const tbtn = document.getElementById("source-toggle");
  if (tbtn) tbtn.style.color = _dataSource === "spacetrack" ? "var(--warn)" : "var(--accent)";
}

// Przelacza zrodlo danych CelesTrak <-> Space-Track. Wymaga przeladowania danych.
function cycleDataSource() {
  // Bez danych logowania Space-Track - otworz modal konfiguracji
  if (!_spacetrackAvailable && _dataSource !== "spacetrack") {
    document.getElementById("st-modal").style.display = "flex";
    return;
  }
  const next = _dataSource === "spacetrack" ? "celestrak" : "spacetrack";
  setStatus(lang === "pl" ? "przelaczanie zrodla..." : "switching source...");
  fetch("/api/source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: next }),
  }).then(function(r) { return r.json(); }).then(function() {
    // Przeladuj dane z nowego zrodla
    loadData();
    fetchPolicy();
  }).catch(function() {
    setStatus(lang === "pl" ? "blad przelaczania" : "switch failed");
  });
}

