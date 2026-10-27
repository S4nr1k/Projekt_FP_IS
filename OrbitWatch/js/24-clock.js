// ---- CLOCK ----
function runClock() {
  function tick() {
    // Real time dla LOC zegar, virtual dla UTC (gdy time warp aktywny)
    const real = new Date();
    const virt = timeScale === 1 ? real : new Date(_virtNow);
    const pad = n => String(n).padStart(2, "0");

    // Local time z prawdziwego zegara
    document.getElementById("clock-local").textContent =
      pad(real.getHours()) + ":" + pad(real.getMinutes()) + ":" + pad(real.getSeconds()) + " LOC";

    // UTC - z wirtualnego zegara jeśli time warp, inaczej real
    const utcLabel = timeScale === 1 ? " UTC" : " UTC ⏩";
    document.getElementById("clock-utc").textContent =
      pad(virt.getUTCHours()) + ":" + pad(virt.getUTCMinutes()) + ":" + pad(virt.getUTCSeconds()) + utcLabel;
    document.getElementById("clock-utc").style.color = timeScale === 1 ? "var(--dim)" : "var(--warn)";

    document.getElementById("clock-date").textContent =
      virt.toLocaleDateString(lang === "en" ? "en-US" : "pl-PL", {weekday:"short", day:"2-digit", month:"short", year:"numeric"});

    setTimeout(tick, 200);  // częściej żeby virtual time skakał płynnie
  }
  tick();
}

