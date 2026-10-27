// ---- PROPAGATION WORKER ----
// Propagacja SGP4 w osobnym watku. Glowny watek tylko renderuje.
// Worker dostaje TLE raz, potem co klatke timestamp; zwraca pozycje przez
// transferable Float32Array (zero-copy). Fallback na propagacje synchroniczna
// gdy Worker niedostepny.

var propWorker   = null;     // instancja Web Workera
var workerReady  = false;    // czy worker zbudowal satrecs
var _posBuffer   = null;     // Float32Array [lat,lng,alt,vx,vy,vz] per sat
var _workerBusy  = false;    // czy czeka na odpowiedz (unikamy kolejkowania)
var _useWorker   = true;     // globalny przelacznik (false = tryb synchroniczny)

// To buduje pelny adres satellite.js na wlasnym serwerze. Worker tworzony z Bloba
// nie rozwiazuje adresow wzglednych, dlatego adres musi byc absolutny.
var SATJS_URL = new URL("vendor/satellite.min.js", document.baseURI).href;

// Kod workera jako string. importScripts laduje satellite.js z wlasnego serwera.
var WORKER_SRC = `
self.importScripts("${SATJS_URL}");
var satrecs = [];
self.onmessage = function(e) {
  const msg = e.data;
  if (msg.type === "init") {
    // Buduj satrecs z par TLE. Niepoprawne TLE -> null (pomijane).
    satrecs = msg.tles.map(function(tle) {
      try {
        const r = satellite.twoline2satrec(tle[0], tle[1]);
        return (r && !r.error) ? r : null;
      } catch (err) { return null; }
    });
    self.postMessage({ type: "ready", count: satrecs.length });
    return;
  }
  if (msg.type === "propagate") {
    // Propaguj podzbior indeksow na podany czas. Wynik do transferable bufora.
    const t = new Date(msg.time);
    const gmst = satellite.gstime(t);
    const idx = msg.indices;
    const out = new Float32Array(idx.length * 6);
    for (let k = 0; k < idx.length; k++) {
      const r = satrecs[idx[k]];
      const o = k * 6;
      if (!r) { out[o] = NaN; continue; }
      try {
        const pv = satellite.propagate(r, t);
        if (!pv || !pv.position) { out[o] = NaN; continue; }
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        out[o]   = satellite.degreesLat(geo.latitude);
        out[o+1] = satellite.degreesLong(geo.longitude);
        out[o+2] = geo.height;
        out[o+3] = pv.velocity ? pv.velocity.x : 0;
        out[o+4] = pv.velocity ? pv.velocity.y : 0;
        out[o+5] = pv.velocity ? pv.velocity.z : 0;
      } catch (err) { out[o] = NaN; }
    }
    self.postMessage({ type: "result", buffer: out.buffer, indices: idx }, [out.buffer]);
  }
};
`;

// Tworzy worker z inline Blob. Zwraca false gdy srodowisko nie wspiera Workerow.
function initPropWorker() {
  if (!window.Worker) { _useWorker = false; return false; }
  try {
    const blob = new Blob([WORKER_SRC], { type: "application/javascript" });
    propWorker = new Worker(URL.createObjectURL(blob));
    propWorker.onmessage = onWorkerMessage;
    propWorker.onerror = function() { _useWorker = false; workerReady = false; _workerBusy = false; };
    return true;
  } catch (err) {
    _useWorker = false;
    return false;
  }
}

// Wysyla wszystkie TLE do workera. Wolane po zaladowaniu danych.
function sendTLEsToWorker() {
  if (!propWorker) return;
  workerReady = false;
  const tles = allSats.map(function(s) { return [s.tle1, s.tle2]; });
  propWorker.postMessage({ type: "init", tles: tles });
  // Jesli worker nie odpowie w 6s (np. blad ladowania biblioteki), przejdz na tryb sync.
  setTimeout(function() {
    if (!workerReady) { _useWorker = false; }
  }, 6000);
}

// Odbiera wiadomosci od workera (ready / result).
function onWorkerMessage(e) {
  const msg = e.data;
  if (msg.type === "ready") {
    workerReady = true;
    return;
  }
  if (msg.type === "result") {
    // Zapisz pozycje z bufora do obiektow satelitow.
    const arr = new Float32Array(msg.buffer);
    const idx = msg.indices;
    for (let k = 0; k < idx.length; k++) {
      const s = allSats[idx[k]];
      const o = k * 6;
      if (!s || isNaN(arr[o])) continue;
      s.lat = arr[o];
      s.lng = arr[o+1];
      s.alt = arr[o+2];
      s.vx  = arr[o+3];
      s.vy  = arr[o+4];
      s.vz  = arr[o+5];
    }
    _workerBusy = false;
  }
}

