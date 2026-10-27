// ---- MAIN LOOP ----
function loop(ts) {
  fpsCount++;
  if (ts - fpsLast >= 1000) {
    fps = fpsCount; fpsCount = 0; fpsLast = ts;
    document.getElementById("s-fps").textContent = fps;
    // Update visible count
    const debrisBtn = document.getElementById("debris-toggle");
    if (debrisBtn) debrisBtn.title = showDebris
      ? (lang==='pl' ? "Ukryj szczatki" : "Hide debris")
      : (lang==='pl' ? "Pokaz szczatki (wylaczone - szybciej)" : "Show debris (off - faster)");
    document.getElementById("tracking-ind").style.display = tracking ? "block" : "none";
  }

  if (tracking && selected && isFinite(selected.lat) && isFinite(selected.lng)) {
    // Centruj rzeczywista pozycje 3D satelity po STRONIE kamery (przod globu).
    // Kamera na (0,0,-projD) patrzy w +Z; punkt z przodu ma satZ<0.
    // Szukamy rotX/rotY tak by wektor satelity trafil na (0,0,-1).
    const phi = selected.lat * DEG, lam = selected.lng * DEG;
    const ux = Math.cos(phi) * Math.cos(lam);
    const uy = Math.sin(phi);
    const uz = Math.cos(phi) * Math.sin(lam);
    // rotY: po obrocie ux ma zniknac (satX=0) a skladowa z ma byc ujemna.
    // atan2(ux, -uz) daje rotacje gdzie wektor laduje na -Z (strona kamery).
    const targetY = Math.atan2(ux, -uz);
    const z1 = -ux * Math.sin(targetY) + uz * Math.cos(targetY);  // z po rotacji Y (ujemne)
    // rotX: obraca (uy, z1) tak by uy zniknelo. z1<0 wiec cel jest na -Z.
    const targetX = -Math.atan2(uy, -z1);
    // Najkrotsza droga katowa
    let dY = targetY - rotY;
    while (dY >  Math.PI) dY -= 2 * Math.PI;
    while (dY < -Math.PI) dY += 2 * Math.PI;
    let dX = targetX - rotX;
    while (dX >  Math.PI) dX -= 2 * Math.PI;
    while (dX < -Math.PI) dX += 2 * Math.PI;
    rotY += dY * 0.08;
    rotX += dX * 0.08;
  } else if (autoRot && !dragging) {
    rotY += 0.0004;
  }

  R = Math.min(W, H) * 0.38 * zoom;

  const now = getVirtualNow();
  const frameN = Math.round(ts / 16);
  const fLen = filtered.length;
  const _propStart = performance.now();
  _propCount = 0;

  if (_useWorker && workerReady) {
    // Tryb worker: selected + ISS liczone synchronicznie (zero latencji dla
    // sledzonego obiektu), reszta wysylana do workera z throttlingiem.
    for (let i = 0; i < fLen; i++) {
      const s = filtered[i];
      if (s === selected || s.cat === "iss") propagate(s, now);
    }
    // Wysylaj batch do workera tylko gdy nie czeka na poprzednia odpowiedz
    if (!_workerBusy) {
      const indices = [];
      for (let i = 0; i < fLen; i++) {
        const s = filtered[i];
        if (s === selected || s.cat === "iss") continue;
        // Throttling per wysokosc orbity (LEO czesciej, GEO rzadziej)
        if (s.alt < 2000)      { if (i % 3 === frameN % 3) indices.push(s._idx); }
        else if (s.alt < 8000) { if (i % 6 === frameN % 6) indices.push(s._idx); }
        else                   { if (i % 10 === frameN % 10) indices.push(s._idx); }
      }
      if (indices.length > 0) {
        _workerBusy = true;
        propWorker.postMessage({ type: "propagate", time: now.getTime(), indices: indices });
      }
    }
  } else {
    // Tryb synchroniczny (fallback): cala propagacja w glownym watku.
    for (let i = 0; i < fLen; i++) {
      const s = filtered[i];
      if (s === selected || s.cat === "iss") {
        propagate(s, now); _propCount++;
      } else if (s.alt < 2000) {
        if (i % 3 === frameN % 3) { propagate(s, now); _propCount++; }
      } else if (s.alt < 8000) {
        if (i % 6 === frameN % 6) { propagate(s, now); _propCount++; }
      } else {
        if (i % 10 === frameN % 10) { propagate(s, now); _propCount++; }
      }
    }
  }
  _propMs = performance.now() - _propStart;

  // Zapisz trail dla wybranego sat (max ~80 punktów, co 4 klatki)
  if (selected && isFinite(selected.lat) && frameN % 4 === 0) {
    if (!selected._trail) selected._trail = [];
    // Zapisuję world-space pozycję sat (przed rotacją), żeby trail "leciał z globem"
    const r1 = R + altOffset(selected.alt || 0);
    const p  = llr(selected.lat, selected.lng, r1);
    selected._trail.push({ px: p.x, py: p.y, pz: p.z });
    if (selected._trail.length > 80) selected._trail.shift();
  }

  ctx.clearRect(0, 0, W, H);

  // Chase cam jest oparty na tracking+zoom i renderuje się przez glowny pipeline.
  // Wszystkie satelity widoczne, mozna wlaczyc/wylaczyc je przyciskiem.
  drawBg();
  drawGlobe();
  drawLaunchSites();
  if (orbitOn && selected) drawOrbit(selected);
  if (!chaseCam || chaseSatVisible) drawSats();
  if (selected && selected.front) drawGroundLine(selected);
  if (!chaseCam) drawMiniMap();
  updateStats();

  _frameMs = performance.now() - ts;
  if (_perfPanelOn) updatePerfPanel();

  requestAnimationFrame(loop);
}

// Aktualizuje panel metryk wydajnosci (klawisz P).
function updatePerfPanel() {
  const el = document.getElementById("perf-panel");
  if (!el) return;
  const mode = _useWorker && workerReady ? "worker" : "sync";
  el.innerHTML =
    "FPS: " + fps + "<br>" +
    "frame: " + _frameMs.toFixed(1) + " ms<br>" +
    "propagation: " + _propMs.toFixed(2) + " ms (" + mode + ")<br>" +
    "propagated/frame: " + _propCount + "<br>" +
    "visible: " + _visCount + " / " + filtered.length + "<br>" +
    "total: " + allSats.length;
}

// Wlacza/wylacza panel metryk.
function togglePerfPanel() {
  _perfPanelOn = !_perfPanelOn;
  const el = document.getElementById("perf-panel");
  if (el) el.style.display = _perfPanelOn ? "block" : "none";
}

