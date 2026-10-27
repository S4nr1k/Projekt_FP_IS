// ---- BOOT ----
var glCanvas = null, gl = null;
var glProg = null, glTexture = null, glTexLoaded = false;
var glBuf = { pos: null, uv: null, idx: null };
var glSatProg = null;
var glSatBuf = { pos: null, color: null, size: null, count: 0, cap: 0 };
// Typed arrays reused between frames - no allocation per draw call
var _satPosArr = null, _satColArr = null, _satSizeArr = null;

document.addEventListener("DOMContentLoaded", () => {
  cvs = document.getElementById("globe");
  ctx = cvs.getContext("2d");

  glCanvas = document.getElementById("gl-canvas");
  _initWebGL();
  initPropWorker();   // uruchom watek propagacji (fallback na sync gdy brak)

  loadSettings();   // przywróć ustawienia z localStorage przed renderem
  loadFavorites();  // ulubione
  resize();
  window.addEventListener("resize", resize);
  applyI18n();   // ustawia też colormode-label, debris tooltip itp. wg języka

  // Restore UI state z loaded settings (po DOM ready)
  const cmBtn = document.getElementById("colormode-toggle");
  if (cmBtn) cmBtn.style.color = colorMode === "altitude" ? "var(--accent)" : "var(--dim)";
  const dbBtn2 = document.getElementById("debris-toggle");
  if (dbBtn2) dbBtn2.style.color = showDebris ? "var(--accent)" : "var(--dim)";
  const texqLbl = document.getElementById("texq-label");
  if (texqLbl) texqLbl.textContent = (window._texQuality || "5k").toUpperCase();
  // Time scale buttons
  if (typeof setTimeScaleUI === "function") setTimeScaleUI(timeScale);

  document.addEventListener("keydown", e => {
    // Nie reaguj gdy user pisze w input/textarea
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") {
      // Wyjątek: Escape w search wychodzi z pola
      if (e.key === "Escape" && tag === "input") e.target.blur();
      return;
    }

    switch (e.key) {
      case "Escape":
        exitChaseCam();
        tracking = false;
        autoRot = true;
        selected = null;
        _currentLaunchSite = null;
        document.getElementById("panel-right").innerHTML =
          `<div class="pr-empty" data-i18n="select_target">${t("select_target")}</div>`;
        break;
      case "/":
        e.preventDefault();
        document.getElementById("search").focus();
        break;
      case " ":  // spacja = pauza auto-rotate
        e.preventDefault();
        autoRot = !autoRot;
        saveSettingsDebounced();
        break;
      case "f":
      case "F":  // F = fullscreen
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
        break;
      case "ArrowLeft":  camRotate(-0.15, 0); break;
      case "ArrowRight": camRotate( 0.15, 0); break;
      case "ArrowUp":    camRotate(0, -0.15); break;
      case "ArrowDown":  camRotate(0,  0.15); break;
      case "+":
      case "=":
        camZoom(1.2);
        break;
      case "-":
      case "_":
        camZoom(1 / 1.2);
        break;
      case "r":
      case "R":
        camReset();
        break;
      case "o":
      case "O":  // O = toggle orbit trail dla wybranego sat
        if (selected) toggleOrbit();
        break;
      case "p":
      case "P":  // P = panel metryk wydajnosci
        togglePerfPanel();
        break;
      case "?":
      case "h":
      case "H":  // H/? = pokaż help
        showHelp();
        break;
    }
  });
  bindMouse();
  bindUI();
  runClock();
  loadData();
  requestAnimationFrame(loop);
});

