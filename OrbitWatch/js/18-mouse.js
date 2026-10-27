// ---- MOUSE ----
function bindMouse() {
  cvs.addEventListener("mousedown", e => {
    if (e.button !== 0) return;   // tylko LMB
    if (chaseCam) return;         // w chase cam drag zablokowany, tracking zostaje
    dragging  = true;
    autoRot   = false;
    tracking  = false;
    lastMX    = e.clientX;
    lastMY    = e.clientY;
    _dragMoved = false;           // czy mysz faktycznie sie poruszyla
    cvs.classList.add("dragging");
  });

  window.addEventListener("mouseup", () => {
    dragging   = false;
    cvs.classList.remove("dragging");
    // Reset after a tick so click handler can read _dragMoved first
    setTimeout(() => { _dragMoved = false; }, 10);
    saveSettingsDebounced();
  });

  window.addEventListener("mousemove", e => {
    if (dragging) {
      // Drag musi przekroczyc 5px zeby zostal uznany za drag (zeby nie psuc klikow)
      const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
      if (Math.hypot(dx, dy) > 5) _dragMoved = true;
      if (!chaseCam) {
        rotY += (e.clientX - lastMX) * 0.005;
        rotX += (e.clientY - lastMY) * 0.005;
        rotX  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
      }
      lastMX = e.clientX;
      lastMY = e.clientY;
    } else {
      if (!chaseCam) handleHover(e);
    }
  });

  cvs.addEventListener("wheel", e => {
    e.preventDefault();
    // Zoom dziala w obu trybach. W chase cam zakres szerszy.
    zoom *= e.deltaY > 0 ? 0.92 : 1.08;
    const maxZoom = chaseCam ? 6.0 : 3.5;
    zoom = Math.max(0.35, Math.min(maxZoom, zoom));
    saveSettingsDebounced();
  }, { passive: false });

  cvs.addEventListener("click", e => {
    if (_dragMoved) return;          // was a drag, not a click
    if (chaseCam)  return;           // no satellite selection in chase cam
    const rect = cvs.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    let best   = null;
    let bestD  = 18;
    filtered.forEach(sat => {
      if (!sat.front) return;
      const d = Math.hypot(sat.sx - mx, sat.sy - my);
      if (d < bestD) { bestD = d; best = sat; }
    });
    if (best) {
      selectSat(best);
      tracking = false;
      return;
    }
    // Brak satelity - sprawdź kosmodrom
    const site = findHoverLaunchSite(mx, my);
    if (site) {
      showLaunchSitePopup(site);
    }
  });

  // Right mouse - rotate chase cam
  cvs.addEventListener("contextmenu", e => e.preventDefault());
  // Double-click globe: wejscie do chase cam.
  cvs.addEventListener("dblclick", e => {
    if (chaseCam) return;
    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bestD = 50;
    filtered.forEach(sat => {
      if (!sat.front) return;
      const d = Math.hypot(sat.sx - mx, sat.sy - my);
      if (d < bestD) { bestD = d; best = sat; }
    });
    // If nothing nearby, use currently selected satellite
    if (!best && selected) best = selected;
    if (best) { selectSat(best); enterChaseCam(best); }
  });
}

function handleHover(e) {
  const rect = cvs.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  const my   = e.clientY - rect.top;
  let hov    = null;
  let bestD  = 22;
  filtered.forEach(sat => {
    if (!sat.front) return;
    const d = Math.hypot(sat.sx - mx, sat.sy - my);
    if (d < bestD) { bestD = d; hov = sat; }
  });
  // Launch site hover - tylko gdy nie ma sat blisko kursora
  const newHoverSite = hov ? null : findHoverLaunchSite(mx, my);
  if (newHoverSite !== hoverSite) hoverSite = newHoverSite;

  const tt = document.getElementById("tooltip");
  if (hov) {
    tt.style.display = "block";
    tt.style.left    = (mx + 14) + "px";
    tt.style.top     = (my - 18) + "px";
    const vel = Math.hypot(hov.vx, hov.vy, hov.vz).toFixed(2);
    tt.innerHTML = `
      <div class="tt-name">${esc(hov.name)}</div>
      <div class="tt-row"><span class="tt-key">${t("altitude")}</span><span class="tt-val">${isFinite(hov.alt) ? Math.round(hov.alt) : "---"} ${t("km_short")}</span></div>
      <div class="tt-row"><span class="tt-key">${t("latitude")}</span><span class="tt-val">${hov.lat.toFixed(2)}&deg;</span></div>
      <div class="tt-row"><span class="tt-key">${t("longitude")}</span><span class="tt-val">${hov.lng.toFixed(2)}&deg;</span></div>
      <div class="tt-row"><span class="tt-key">${t("velocity")}</span><span class="tt-val">${vel} ${t("kms_short")}</span></div>
    `;
    cvs.style.cursor = "pointer";
  } else if (hoverSite) {
    tt.style.display = "none";
    cvs.style.cursor = "pointer";
  } else {
    tt.style.display = "none";
    cvs.style.cursor = dragging ? "grabbing" : "grab";
  }
}

