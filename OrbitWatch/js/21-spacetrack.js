// ---- Space-Track / SATDB ----
var _satInfoCache = {};   // norad -> info object

async function stSaveCredentials() {
  const user = document.getElementById("st-user").value.trim();
  const pass = document.getElementById("st-pass").value.trim();
  const msg  = document.getElementById("st-status-msg");
  if (!user || !pass) { msg.textContent = "Podaj email i haslo."; return; }
  msg.style.color = "var(--dim)";
  msg.textContent = "Zapisywanie i synchronizacja...";
  try {
    const r = await fetch("/api/spacetrack/credentials", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ user, password: pass })
    });
    const d = await r.json();
    if (d.ok) {
      msg.style.color = "var(--green)";
      msg.textContent = "OK - SATCAT sync + TLE cache wyczyszczony. Poczekaj ~30s i odswiez strone.";
      document.getElementById("tle-source-label").textContent = "Zrodlo: Space-Track.org (live)";
      document.getElementById("tle-source-label").style.color = "var(--green)";
      setTimeout(() => document.getElementById("st-modal").style.display = "none", 4000);
      setTimeout(checkSatDbStatus, 5000);
    } else {
      msg.style.color = "var(--orange)";
      msg.textContent = "Blad: " + d.error;
    }
  } catch (e) {
    msg.style.color = "var(--orange)";
    msg.textContent = "Blad polaczenia z serwerem.";
  }
}

async function checkSatDbStatus() {
  try {
    const r = await fetch("/api/spacetrack/status");
    const d = await r.json();
    const el  = document.getElementById("satdb-indicator");
    const src = document.getElementById("tle-source-label");
    if (d.total > 0) {
      el.style.color = "var(--green)";
      el.textContent = `SATDB: ${d.total.toLocaleString()} obj (${d.payloads.toLocaleString()} sat, ${d.debris.toLocaleString()} debris)`;
      if (src && d.has_credentials) {
        src.textContent = "Zrodlo: Space-Track.org (live)";
        src.style.color = "var(--green)";
      }
    } else if (d.has_credentials) {
      el.style.color = "var(--orange)";
      el.textContent = "SATDB: synchronizacja...";
    } else {
      el.style.color = "var(--dim)";
      el.textContent = "SATDB: brak (skonfiguruj Space-Track)";
    }
  } catch {}
}

async function fetchSatInfo(norad) {
  if (!norad) return {};
  const key = String(norad).padStart(5, "0");
  if (_satInfoCache[key]) return _satInfoCache[key];
  try {
    const r = await fetch(`/api/satinfo/${norad}`);
    const d = await r.json();
    if (d && d.obj_type !== undefined) {
      _satInfoCache[key] = d;
      return d;
    }
  } catch {}
  return {};
}

// Check SATDB status on load
setTimeout(checkSatDbStatus, 2000);

function toggleOrbit() {
  orbitOn = !orbitOn;
  const btn = document.getElementById("btn-orbit");
  if (btn) {
    btn.textContent = orbitOn ? "Ukryj slad orbity" : "Pokaz slad orbity";
    btn.classList.toggle("on", orbitOn);
  }
}

