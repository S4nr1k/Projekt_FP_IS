// ---- CAMERA CONTROLS (buttons) ----
function camRotate(dy, dx) {
  // dy = przesunięcie rotY (poziome), dx = przesunięcie rotX (pionowe)
  autoRot  = false;
  tracking = false;
  rotY += dy;
  rotX += dx;
  // Clamp rotX (góra-dół) żeby nie odwrócić globu
  rotX = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, rotX));
  saveSettingsDebounced();
}
function camZoom(factor) {
  zoom = Math.max(0.5, Math.min(5.0, zoom * factor));
  saveSettingsDebounced();
}
function camReset() {
  autoRot  = true;
  tracking = false;
  rotX = 0.28;
  zoom = 1.0;
  saveSettingsDebounced();
}

// Kopiuj tekst do schowka z wizualnym feedbackiem na przycisku
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = "✓";
    btn.style.color = "var(--accent)";
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.color = "var(--dim)";
    }, 1200);
  }).catch(() => {
    // Fallback: stara metoda
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = orig; }, 1200);
    }
  });
}

// Color mode toggle: category | altitude
function toggleDebris() {
  showDebris = !showDebris;
  const btn = document.getElementById("debris-toggle");
  const debrisCount = allSats.filter(s => s.isDebris).length;
  if (btn) {
    btn.style.color = showDebris ? "var(--accent)" : "var(--dim)";
    btn.style.borderColor = showDebris ? "var(--accent)" : "var(--border)";
    // Pokaz ile szczatkow jest ukrytych/widocznych
    const label = lang === "pl" ? "szczatki" : "debris";
    btn.textContent = showDebris
      ? label + " (" + debrisCount + ")"
      : label + " (0/" + debrisCount + ")";
  }
  applyFilter();
  saveSettingsDebounced();
}

function toggleColorMode() {
  colorMode = colorMode === "category" ? "altitude" : "category";
  const lbl = document.getElementById("colormode-label");
  const btn = document.getElementById("colormode-toggle");
  if (lbl) lbl.textContent = colorMode === "altitude" ? t("cm_altitude") : t("cm_category");
  if (btn) btn.style.color = colorMode === "altitude" ? "var(--accent)" : "var(--dim)";
  saveSettingsDebounced();
}

// Cykl jakosci tekstury Ziemi: 2k -> 5k -> 8k -> 2k. Przeladowuje teksture.
function cycleTexQuality() {
  const order = ["2k", "5k", "8k"];
  const cur = window._texQuality || "5k";
  const next = order[(order.indexOf(cur) + 1) % order.length];
  window._texQuality = next;
  localStorage.setItem("orbitwatch_texquality", next);
  const lbl = document.getElementById("texq-label");
  if (lbl) lbl.textContent = next.toUpperCase();
  if (window._loadEarthTexture) window._loadEarthTexture(next);
}

// Time scale - wybór skali czasu (UI)
function setTimeScaleUI(s) {
  setTimeScale(s);
  document.querySelectorAll(".tc-btn").forEach(btn => {
    btn.classList.toggle("active", parseFloat(btn.dataset.scale) === s);
  });
  const val = document.getElementById("tc-value");
  if (val) {
    if (s === 1) val.textContent = "1×";
    else if (s === -1) val.textContent = "◀◀";
    else if (s >= 1000) val.textContent = (s/1000) + "k×";
    else val.textContent = s + "×";
    val.style.color = s === 1 ? "var(--accent)" : "var(--warn)";
  }
}

// Pokaż overlay z pomocą / skrótami klawiszowymi
function showHelp() {
  let overlay = document.getElementById("help-overlay");
  if (overlay) { overlay.remove(); return; }  // toggle
  overlay = document.createElement("div");
  overlay.id = "help-overlay";
  overlay.onclick = () => overlay.remove();
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:9999;
    display:flex; align-items:center; justify-content:center;
    font-family:var(--mono); cursor:pointer;
  `;
  const isPL = lang === "pl";
  const shortcuts = [
    ["/",           isPL ? "fokus na wyszukiwanie" : "focus search"],
    ["←→↑↓",        isPL ? "obrot globu" : "rotate globe"],
    ["+ / -",       isPL ? "zoom in/out" : "zoom in/out"],
    ["R",           isPL ? "reset widoku" : "reset view"],
    ["spacja",      isPL ? "pauza auto-rotate" : "pause auto-rotate"],
    ["O",           isPL ? "pokaz/ukryj orbite" : "toggle orbit trail"],
    ["P",           isPL ? "panel wydajnosci" : "performance panel"],
    ["F",           isPL ? "pelny ekran" : "fullscreen"],
    ["TAB",         isPL ? "zmien widok chase cam" : "switch chase cam view"],
    ["ESC",         isPL ? "wyjdz / odznacz" : "exit / deselect"],
    ["H / ?",       isPL ? "ta lista" : "this help"],
  ];
  overlay.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--accent);
                padding:24px 32px;min-width:380px;color:var(--text)"
         onclick="event.stopPropagation()">
      <h2 style="color:var(--accent);font-size:14px;margin-bottom:16px;
                 letter-spacing:2px;text-transform:uppercase">
        ${isPL ? "Skroty klawiszowe" : "Keyboard shortcuts"}
      </h2>
      <table style="border-collapse:collapse;font-size:12px;width:100%">
        ${shortcuts.map(([k, d]) => `
          <tr>
            <td style="padding:4px 16px 4px 0;color:var(--accent);font-weight:700;white-space:nowrap">${k}</td>
            <td style="padding:4px 0;color:var(--dim)">${d}</td>
          </tr>
        `).join("")}
      </table>
      <div style="margin-top:16px;color:var(--dim2);font-size:10px;text-align:right">
        ${isPL ? "klik gdziekolwiek = zamknij" : "click anywhere = close"}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Ustaw zakres wysokości dla strefy orbity (LEO/MEO/GEO)
function setAltZone(zone) {
  const ranges = {
    leo: [160,   2000],   // Low Earth Orbit
    meo: [2000,  35000],  // Medium Earth Orbit
    geo: [35000, 42000],  // Geostationary / Geosync
  };
  const r = ranges[zone];
  if (!r) return;
  const altMinEl = document.getElementById("alt-min");
  const altMaxEl = document.getElementById("alt-max");
  altMinEl.value = r[0];
  altMaxEl.value = r[1];
  // Toggle: drugi klik na tym samym zone -> reset
  const wasActive = document.querySelector(`.alt-tag[data-zone="${zone}"]`).classList.contains("active");
  document.querySelectorAll(".alt-tag").forEach(t => t.classList.remove("active"));
  if (!wasActive) {
    document.querySelector(`.alt-tag[data-zone="${zone}"]`).classList.add("active");
  } else {
    // reset do pełnego zakresu
    altMinEl.value = 0;
    altMaxEl.value = 42000;
  }
  // Wywołaj update via event
  altMinEl.dispatchEvent(new Event("input"));
}

