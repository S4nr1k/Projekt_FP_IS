// ---- TIME WARP ----
var timeScale = 1.0;           // 1×, 10×, 100×, 1000×
var _virtNow  = Date.now();    // wirtualny zegar (aktualizowany w pętli)
var _lastRealMs = Date.now();  // ostatni real timestamp dla diff
function getVirtualNow() {
  const realNow = Date.now();
  _virtNow += (realNow - _lastRealMs) * timeScale;
  _lastRealMs = realNow;
  return new Date(_virtNow);
}
function resetVirtualTime() {
  _virtNow = Date.now();
  _lastRealMs = Date.now();
}
function setTimeScale(s) {
  // Przy zmianie skali, syncuj wirtualny czas tak żeby nie skoczył
  getVirtualNow(); // accrual przed zmianą
  timeScale = s;
}

