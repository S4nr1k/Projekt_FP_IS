// ---- DATA ----
async function loadData() {
  setSub("Pobieranie z /api/satellites...");
  try {
    const r = await fetch("/api/satellites");
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    buildSats(data, "API");
  } catch (e) {
    setSub("Brak backendu, uzywam danych wbudowanych...");
    // Fallback: fetch bundled endpoint or use inline data
    try {
      const r = await fetch("/api/satellites/bundled");
      if (!r.ok) throw new Error(r.status);
      buildSats(await r.json(), "wbudowane");
    } catch {
      buildSats(INLINE_TLE, "wbudowane");
    }
  }
}

function buildSats(data, src) {
  // Wzorzec regex skompilowany raz
  const debrisRe = /\bDEB\b|\bDEBRIS\b|R\/B|\bROCKET\b|^OBJECT\b|\bCOOLANT\b|\bCHUNK\b|\bFRAGMENT\b|\bWESTFORD\b|\bSHRAPNEL\b/i;
  allSats = data.map(d => {
    let satrec = null;
    try { satrec = satellite.twoline2satrec(d.tle1, d.tle2); } catch {}
    const inc = d.tle2 ? parseFloat(d.tle2.substring(8, 16)) : 0;
    const ecc = d.tle2 ? parseFloat("0." + d.tle2.substring(26, 33).trim()) : 0;
    let altEst = 500;
    if (d.tle2 && d.tle2.length >= 63) {
      try {
        const mm = parseFloat(d.tle2.substring(52, 63));
        if (mm > 0) {
          const T_min = 1440 / mm;
          const a_km  = Math.pow((398600.4418 * (T_min*60/2/Math.PI)**2), 1/3);
          altEst = Math.max(0, a_km - 6371);
        }
      } catch {}
    }
    // Szczatek rozpoznajemy WYLACZNIE po nazwie (DEB, R/B, OBJECT itp.).
    // NIE po kategorii "other" - bo CelesTrak wrzuca tam tysiace normalnych
    // satelitow, co powodowaloby ukrywanie prawie wszystkiego.
    const isDebris = debrisRe.test(d.name);
    // Reklasyfikacja po nazwie gdy backend dal "other" (CelesTrak active).
    let cat = d.cat;
    if (cat === "other") cat = guessCatFromName(d.name, isDebris);
    return {
      name: d.name, norad: d.norad, cat: cat,
      tle1: d.tle1, tle2: d.tle2, satrec,
      color: CAT_COLOR[cat] || CAT_COLOR.other,
      lat: 0, lng: 0, alt: altEst,
      vx: 0, vy: 0, vz: 0,
      sx: 0, sy: 0,
      front: false,
      isDebris,
      inc, ecc,
      _idx: 0,   // indeks w allSats (ustawiany nizej, uzywany przez worker)
    };
  });
  // Ustaw indeks kazdego satelity (worker adresuje satrecs po indeksie)
  for (let i = 0; i < allSats.length; i++) allSats[i]._idx = i;

  // Wyslij TLE do workera (asynchronicznie buduje satrecs w tle)
  if (_useWorker && propWorker) sendTLEsToWorker();

  updateCounts();
  applyFilter();
  renderFavorites();
  fetchPolicy();   // pobierz polityke redystrybucji (eksport TLE)
  hideLoading();
  setStatus(t("loading_count", {n: allSats.length, src}));
}

