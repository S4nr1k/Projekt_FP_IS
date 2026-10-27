// ---- PERSISTENCE ----
function loadSettings() {
  try {
    const raw = localStorage.getItem("orbitwatch_settings");
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.activeCat === "string")     activeCat = s.activeCat;
    if (typeof s.showDebris === "boolean")   showDebris = s.showDebris;
    if (typeof s.showLaunchSites === "boolean") showLaunchSites = s.showLaunchSites;
    if (typeof s.rotX === "number" && isFinite(s.rotX)) rotX = s.rotX;
    if (typeof s.rotY === "number" && isFinite(s.rotY)) rotY = s.rotY;
    if (typeof s.zoom === "number" && isFinite(s.zoom)) zoom = Math.max(0.5, Math.min(5, s.zoom));
    if (typeof s.altMin === "number") altMin = s.altMin;
    if (typeof s.altMax === "number") altMax = s.altMax;
    if (typeof s.velMin === "number") velMin = s.velMin;
    if (typeof s.velMax === "number") velMax = s.velMax;
    if (typeof s.autoRot === "boolean") autoRot = s.autoRot;
    if (typeof s.colorMode === "string") colorMode = s.colorMode;
    if (typeof s.timeScale === "number" && isFinite(s.timeScale)) timeScale = s.timeScale;
  } catch {}
}
function saveSettings() {
  try {
    localStorage.setItem("orbitwatch_settings", JSON.stringify({
      activeCat, showDebris, showLaunchSites,
      rotX, rotY, zoom, autoRot,
      altMin, altMax, velMin, velMax,
      colorMode, timeScale,
    }));
  } catch {}
}
// Debounced save - wywołuje saveSettings max raz na 500ms
var _saveTimer = null;
function saveSettingsDebounced() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveSettings, 500);
}

