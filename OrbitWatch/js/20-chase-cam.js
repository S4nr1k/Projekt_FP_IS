// ---- CHASE CAM ----
// Renders the globe from a position near the satellite using WebGL
// plus 2D overlay for the satellite dot and HUD
function drawSideView(sat) {
  const c = document.getElementById("sat-side-view");
  if (!c) return;
  const x = c.getContext("2d");
  const SW = c.width, SH = c.height;
  x.clearRect(0, 0, SW, SH);

  _ensureTexData();   // make sure CPU texture data is ready
  const cx = SW * 0.42, cy = SH * 0.5;
  const er  = SH * 0.30;
  const maxAlt = 42000;
  const ao  = er + er * 0.65 * Math.log1p(Math.min(sat.alt||550, maxAlt) / 550) / Math.log1p(maxAlt / 550);

  // ---- Mini globe: draw Earth texture if available ----
  if (glTexLoaded && gl && _texData) {
    // Sample our cached texture data onto a small circle
    const diam = Math.ceil(er * 2);
    const id   = x.createImageData(diam, diam);
    const px   = id.data;
    const sun  = _sunDirection();
    // Rotate view to show satellite's subpoint at bottom-center
    const vLat = sat.lat * DEG;
    const vLng = sat.lng * DEG;
    const cvLat = Math.cos(vLat), svLat = Math.sin(vLat);
    const cvLng = Math.cos(vLng), svLng = Math.sin(vLng);

    for (let py = 0; py < diam; py++) {
      for (let pxi = 0; pxi < diam; pxi++) {
        const nx_ = (pxi - er) / er;
        const ny_ = (py  - er) / er;
        const r2  = nx_*nx_ + ny_*ny_;
        if (r2 > 1) continue;
        const nz_ = Math.sqrt(1 - r2);
        // Rotate sphere: show satellite subpoint at bottom
        // Apply inverse of view rotation: Ry(-vLng) * Rx(-vLat)
        const ax  = nx_, ay = ny_, az = nz_;
        // First Rx(-vLat): rotate around x axis
        const ax1 = ax, ay1 = ay*cvLat + az*svLat, az1 = -ay*svLat + az*cvLat;
        // Then Ry(-vLng):
        const ax2 = ax1*cvLng - az1*svLng, ay2 = ay1, az2 = ax1*svLng + az1*cvLng;
        // Lat/lng from rotated point
        const lat_ = Math.asin(Math.max(-1, Math.min(1, ay2)));
        const lng_ = Math.atan2(az2, ax2);
        // UV sample
        const uv = ((lng_ / (Math.PI*2) + 0.5 + 1) % 1);
        const vv = 0.5 - lat_ / Math.PI;
        const tx = Math.min(_TEX_W-1, Math.floor(uv * _TEX_W));
        const ty = Math.min(_TEX_H-1, Math.floor(vv * _TEX_H));
        const ti = (ty * _TEX_W + tx) * 4;
        // Lambert sun shading
        const dot_ = ax2*sun[0] + ay2*sun[1] + az2*sun[2];
        const lit_ = Math.max(0, Math.min(1, (dot_ + 0.12) / 0.25));
        const ii   = (py * diam + pxi) * 4;
        px[ii]   = _texData[ti]   * (0.2 + 0.8*lit_);
        px[ii+1] = _texData[ti+1] * (0.2 + 0.8*lit_);
        px[ii+2] = _texData[ti+2] * (0.2 + 0.8*lit_) + (1-lit_)*12;
        px[ii+3] = 255;
      }
    }
    // Clip to circle and draw
    const oc = new OffscreenCanvas(diam, diam);
    oc.getContext("2d").putImageData(id, 0, 0);
    x.save();
    x.beginPath(); x.arc(cx, cy, er, 0, Math.PI*2); x.clip();
    x.drawImage(oc, cx-er, cy-er, diam, diam);
    x.restore();
  } else {
    // Fallback gradient
    const eg = x.createRadialGradient(cx-er*0.2, cy-er*0.2, er*0.1, cx, cy, er);
    eg.addColorStop(0,"#1e6090"); eg.addColorStop(0.5,"#0d3555"); eg.addColorStop(1,"#061020");
    x.beginPath(); x.arc(cx, cy, er, 0, Math.PI*2); x.fillStyle=eg; x.fill();
  }

  // Atmosphere ring
  const ah = x.createRadialGradient(cx, cy, er*0.9, cx, cy, er*1.14);
  ah.addColorStop(0,"rgba(30,120,255,0.15)"); ah.addColorStop(1,"transparent");
  x.beginPath(); x.arc(cx, cy, er*1.14, 0, Math.PI*2); x.fillStyle=ah; x.fill();
  x.beginPath(); x.arc(cx, cy, er, 0, Math.PI*2);
  x.strokeStyle="rgba(0,160,255,0.4)"; x.lineWidth=1; x.stroke();

  // Orbit circle
  x.beginPath(); x.arc(cx, cy, ao, 0, Math.PI*2);
  x.strokeStyle="rgba(0,180,255,0.2)"; x.lineWidth=0.8;
  x.setLineDash([3,4]); x.stroke(); x.setLineDash([]);

  // Satellite position angle from lat
  const angle = -sat.lat * DEG - Math.PI/2;
  const spX = cx + Math.cos(angle) * ao;
  const spY = cy + Math.sin(angle) * ao;
  const gx  = cx + Math.cos(angle) * er;
  const gy  = cy + Math.sin(angle) * er;

  // Nadir line (sat to surface)
  x.beginPath(); x.moveTo(spX, spY); x.lineTo(gx, gy);
  x.strokeStyle="rgba(255,200,50,0.7)"; x.lineWidth=1;
  x.setLineDash([3,3]); x.stroke(); x.setLineDash([]);

  // Surface crosshair
  x.beginPath(); x.arc(gx, gy, 3, 0, Math.PI*2);
  x.fillStyle="rgba(255,200,50,0.85)"; x.fill();

  // Satellite glow + dot
  const sg = x.createRadialGradient(spX, spY, 0, spX, spY, 9);
  sg.addColorStop(0, sat.color+"77"); sg.addColorStop(1,"transparent");
  x.beginPath(); x.arc(spX, spY, 9, 0, Math.PI*2); x.fillStyle=sg; x.fill();
  x.beginPath(); x.arc(spX, spY, 3, 0, Math.PI*2); x.fillStyle="#fff"; x.fill();
  x.beginPath(); x.arc(spX, spY, 5.5, 0, Math.PI*2);
  x.strokeStyle=sat.color; x.lineWidth=1; x.stroke();

  // Velocity arrow
  const vAngle = angle + Math.PI/2;
  x.beginPath(); x.moveTo(spX,spY);
  x.lineTo(spX+Math.cos(vAngle)*18, spY+Math.sin(vAngle)*18);
  x.strokeStyle="#2dff6e"; x.lineWidth=1.5; x.globalAlpha=0.75; x.stroke(); x.globalAlpha=1;

  // Alt label
  x.font="9px 'Share Tech Mono',monospace";
  x.fillStyle=sat.color; x.globalAlpha=0.9;
  x.fillText((isFinite(sat.alt)?Math.round(sat.alt):"---")+" km", spX+8, spY-5);
  x.globalAlpha=1;

  // Speed
  const spd = Math.hypot(sat.vx||0, sat.vy||0, sat.vz||0);
  x.font="8px 'Share Tech Mono',monospace";
  x.fillStyle="#2dff6e";
  x.fillText("v "+spd.toFixed(2)+" km/s", SW*0.60, SH-8);
  x.fillStyle="rgba(0,180,255,0.4)";
  x.fillText("i="+(sat.inc||0).toFixed(1)+"°", SW*0.02, SH-5);
}


// Chase cam jako "zoom mode" - glob obraca się do satelity (przez tracking),
// kamera płynnie się przybliża. Wszystkie inne satelity pozostają widoczne.
var chaseSatVisible = true;   // czy pokazywać pozostałe satelity w chase cam
var _chaseZoomAnim = null;

function enterChaseCam(sat) {
  if (!sat || !isFinite(sat.lat)) return;
  selected = sat;
  tracking = true;       // plynne wysrodkowanie satelity
  autoRot  = false;
  chaseCam = true;
  chaseSatVisible = true;

  // Zoom docelowy zalezny od wysokosci orbity: niskie blizej, wysokie dalej
  // (zeby satelita zawsze wypelnial podobna czesc kadru).
  const alt = isFinite(sat.alt) ? sat.alt : 500;
  const targetZoom = alt < 2000 ? 3.2 : alt < 20000 ? 2.2 : 1.6;
  const startZoom = zoom;
  const duration = 1400;
  const startTime = performance.now();
  if (_chaseZoomAnim) cancelAnimationFrame(_chaseZoomAnim);
  function animateZoom() {
    const t = Math.min(1, (performance.now() - startTime) / duration);
    const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;  // cubic in-out
    zoom = startZoom + (targetZoom - startZoom) * e;
    if (t < 1) _chaseZoomAnim = requestAnimationFrame(animateZoom);
    else _chaseZoomAnim = null;
  }
  _chaseZoomAnim = requestAnimationFrame(animateZoom);

  refreshChaseBanner();
}

// Przywróć domyślny widok chase cam
function recenterChaseCam() {
  if (!chaseCam) return;
  tracking = true;   // ponownie wyśrodkuj
  const startZoom = zoom, targetZoom = 3.0;
  const startTime = performance.now();
  function animate() {
    const t = Math.min(1, (performance.now() - startTime) / 500);
    const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
    zoom = startZoom + (targetZoom - startZoom) * e;
    if (t < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

// Toggle widoczności pozostałych satelitów w chase cam
function toggleChaseSats() {
  chaseSatVisible = !chaseSatVisible;
  refreshChaseBanner();
}

function exitChaseCam() {
  if (!chaseCam) return;
  chaseCam = false;
  tracking = false;
  if (_chaseZoomAnim) { cancelAnimationFrame(_chaseZoomAnim); _chaseZoomAnim = null; }

  // Płynny powrót zoomu do 1.0
  const startZoom = zoom, targetZoom = 1.0;
  const startTime = performance.now();
  function animate() {
    const t = Math.min(1, (performance.now() - startTime) / 800);
    const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
    zoom = startZoom + (targetZoom - startZoom) * e;
    if (t < 1) requestAnimationFrame(animate);
    else autoRot = true;   // wznów auto-rotate po zakończeniu
  }
  requestAnimationFrame(animate);

  const ind = document.getElementById("tracking-ind");
  if (ind) ind.style.display = "none";
}

