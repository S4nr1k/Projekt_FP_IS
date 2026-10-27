// ---- DRAW: orbity, slad naziemny, satelity ----
function drawOrbit(sat) {
  if (!sat.satrec) return;
  const now    = Date.now();
  const period = (2 * Math.PI / sat.satrec.no) * 60000;  // ms
  const STEPS  = 180;
  // Pełna orbita: -50% do +50% okresu od teraz (cała pętla)
  // Dzięki temu pokazujemy gdzie satelita BYŁ i gdzie BĘDZIE
  const past = [], future = [];
  for (let i = -STEPS/2; i <= STEPS/2; i++) {
    const t = new Date(now + (i / STEPS) * period);
    try {
      const pv = satellite.propagate(sat.satrec, t);
      if (!pv.position) continue;
      const gmst = satellite.gstime(t);
      const geo  = satellite.eciToGeodetic(pv.position, gmst);
      const pt = {
        lat: satellite.degreesLat(geo.latitude),
        lng: satellite.degreesLong(geo.longitude),
        alt: geo.height,
      };
      if (i < 0) past.push(pt); else future.push(pt);
    } catch {}
  }

  ctx.save();

  // ---- Ground track (ślad na powierzchni Ziemi) - cienki, ciągły ----
var trackColor = sat.color || "#00b4ff";
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 0.9;
  drawOrbitPath(past, R + 1, 0.20, trackColor, false);
  drawOrbitPath(future, R + 1, 0.45, trackColor, false);

  // ---- Orbita na wysokości satelity - grubsza, gradient ----
ctx.lineWidth = 1.6;
  drawOrbitPath(past, null, 0.35, trackColor, true);   // przeszłość - przerywana, jaśniej
  drawOrbitPath(future, null, 0.85, trackColor, false); // przyszłość - pełna linia, mocniej

  ctx.restore();
}

// Helper: rysuje ścieżkę orbitalną z testem widoczności i wrap detection
function drawOrbitPath(pts, fixedR, alpha, color, dashed) {
  if (pts.length < 2) return;
  if (dashed) ctx.setLineDash([3, 4]); else ctx.setLineDash([]);

  // Parsuj kolor hex do RGB
  const hex = color.replace("#", "");
  const cr = parseInt(hex.substring(0,2), 16);
  const cg = parseInt(hex.substring(2,4), 16);
  const cb = parseInt(hex.substring(4,6), 16);

  let started = false;
  let prevP = null, prevZ = 0;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const r  = fixedR != null ? fixedR : R + altOffset(pt.alt);
    const rr = rot(llr(pt.lat, pt.lng, r));
    const p  = proj(rr);
    const isBack = rr.z > R * 0.25;  // za globem (przy tej konwencji z>0 = tył)
    if (isBack) { started = false; continue; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; prevP = p; prevZ = rr.z; continue; }
    // Wrap detection - przeskok przez antymeridian
    const dx = p.x - prevP.x, dy = p.y - prevP.y;
    if (Math.hypot(dx, dy) > R * 0.5) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
    prevP = p; prevZ = rr.z;
  }
  ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGroundLine(sat) {
  if (!isFinite(sat.lat) || !isFinite(sat.lng) || !isFinite(sat.alt)) return;
  const groundRot = rot(llr(sat.lat, sat.lng, R));
  // +z = za Ziemią; odrzuć gdy subpunkt jest zbyt głęboko za globem
  if (groundRot.z > R * 0.2) return;
  const gp = proj(groundRot);
  const sp = { x: sat.sx, y: sat.sy };

  // Subpoint marker
  ctx.beginPath();
  ctx.arc(gp.x, gp.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = sat.color;
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Dashed line from sat to subpoint
  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y);
  ctx.lineTo(gp.x, gp.y);
  ctx.strokeStyle = sat.color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([3, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

// LEO 550km->0.08R, MEO 19000km->0.45R, GEO 35786km->0.60R
function altOffset(alt) {
  if (!isFinite(alt) || alt < 0) return 0;
  const c = Math.min(alt, 42000);
  return R * 0.08 + R * 0.55 * Math.log1p(c / 550) / Math.log1p(42000 / 550);
}

function drawSats() {
  const overlay = document.getElementById("overlay");
  overlay.innerHTML = "";

  // Cache trig dla rot() - liczone raz na klatkę
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const projD = R * 3.5;
  const W2 = W / 2, H2 = H / 2;
  const fLen = filtered.length;

  // ---- Alokacja Float32Array (raz, przy zmianie rozmiaru) ----
// 2 floaty pozycji (screen-space) + 3 floaty koloru + 1 float rozmiaru
  if (!_satPosArr || _satPosArr.length < fLen * 2) {
    const cap = Math.max(fLen * 2, 4096);
    _satPosArr  = new Float32Array(cap * 2);
    _satColArr  = new Float32Array(cap * 3);
    _satSizeArr = new Float32Array(cap);
  }

  // ---- Pętla po satelitach: pozycje, test horyzontu, lista highlights ----
var highlights = [];
  let glCount = 0;
  let visCount = 0;
  const horizonRatio = 1.0;  // dla unit-sphere; uR daje skalowanie

  for (let i = 0; i < fLen; i++) {
    const sat = filtered[i];
    if (!isFinite(sat.lat) || !isFinite(sat.lng) || !isFinite(sat.alt)) {
      sat.front = false;
      continue;
    }

    const ao = altOffset(sat.alt);
    const r1 = R + ao;
    const phi = sat.lat * DEG, lam = sat.lng * DEG;
    const cphi = Math.cos(phi), sphi = Math.sin(phi);
    const cl = Math.cos(lam), sl = Math.sin(lam);

    // Pozycja w przestrzeni "world" (jednostki R = 1)
    // Geometria globu w WebGL ma promień 1 i Mscale skaluje przez R i NEGUJE Z.
    // Dlatego do bufora satelitów dajemy pozycję w UKŁADZIE sfery (jednostki 1):
    // x = (r1/R) * cphi * cl,  y = (r1/R) * sphi,  z = (r1/R) * cphi * sl
    // Macierz uMV (taka sama jak globu, z Mscale i rotacjami) zrobi resztę.
    const rUnit = r1 / R;
    const sx = rUnit * cphi * cl;
    const sy = rUnit * sphi;
    const sz = rUnit * cphi * sl;

    // Pozycja w przestrzeni Canvas (po rot+proj) - do test okluzji, klików, highlights
    const px = r1 * cphi * cl;
    const py = r1 * sphi;
    const pz = r1 * cphi * sl;
    const x1 =  px * cosY + pz * sinY;
    const z1 = -px * sinY + pz * cosY;
    const satX = x1;
    const satY = py * cosX - z1 * sinX;
    const satZ = py * sinX + z1 * cosX;

    // Test okluzji ray-sphere: czy Ziemia jest MIĘDZY kamerą a satelitą?
    // Kamera: (0,0,-projD). Satelita: (satX, satY, satZ). Sfera: R w origin.
    // Linia P(t) = kamera + t*(sat - kamera). Rozwiązuję |P(t)|² = R².
    const Dx = satX, Dy = satY, Dz = satZ + projD;     // sat - kamera
    const Ox = 0, Oy = 0, Oz = -projD;                  // kamera (sfera w origin)
    const aQ = Dx*Dx + Dy*Dy + Dz*Dz;
    const bQ = 2 * (Ox*Dx + Oy*Dy + Oz*Dz);
    const cQ = Ox*Ox + Oy*Oy + Oz*Oz - R*R;
    const disc = bQ*bQ - 4*aQ*cQ;
    if (disc > 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-bQ - sq) / (2*aQ);   // pierwsze przecięcie (wejście)
      const t2 = (-bQ + sq) / (2*aQ);   // drugie przecięcie (wyjście)
      // Zasłonięty gdy ŚRODEK kuli jest między kamerą a sat - czyli oba
      // przecięcia (t1<sat AND t2>0) i sat jest poza kulą (t>t2 albo t<t1)
      // Prostszy warunek: sat zasłonięty gdy t2 < 1 (wyjście z kuli przed satelitą)
      // i t1 > 0 (wejście do kuli po stronie satelity od kamery)
      if (t1 > 0 && t2 < 1) {
        sat.front = false;
        continue;
      }
    }
    sat.front = true;
    visCount++;

    // Projekcja Canvas - dla klików / hovera / highlights
    const denom = Math.max(projD + satZ, projD * 0.01);
    const s = projD / denom;
    sat.sx = W2 + satX * s;
    sat.sy = H2 - satY * s;

    // Highlights (selected/ISS) - pomijamy w GL buforze, rysujemy Canvasem
    if (sat === selected || sat.cat === "iss") {
      highlights.push({ sat, z: satZ });
      continue;
    }

    // Wpis w buforze GL - 2D screen-space (te same pozycje co Canvas)
    const i2 = glCount * 2;
    _satPosArr[i2]   = sat.sx;
    _satPosArr[i2+1] = sat.sy;
    // Color: w trybie "altitude" liczymy gradient z wysokości, w "category" - cache hex
    const ci3 = glCount * 3;
    if (colorMode === "altitude") {
      const ac = altToColor(sat.alt);
      _satColArr[ci3]   = ac[0];
      _satColArr[ci3+1] = ac[1];
      _satColArr[ci3+2] = ac[2];
    } else {
      if (!sat._rgb || sat._rgbHex !== sat.color) {
        const hex = sat.color.replace("#", "");
        sat._rgb = [
          parseInt(hex.substring(0,2), 16) / 255,
          parseInt(hex.substring(2,4), 16) / 255,
          parseInt(hex.substring(4,6), 16) / 255,
        ];
        sat._rgbHex = sat.color;
      }
      _satColArr[ci3]   = sat._rgb[0];
      _satColArr[ci3+1] = sat._rgb[1];
      _satColArr[ci3+2] = sat._rgb[2];
    }
    // Różne rozmiary per kategoria:
    // - stacje (highlights): osobno, crosshair
    // - debris: 3px (drobne)
    // - starlink/weather: 5px
    // - GNSS/science: 6px
    // - reszta: 5px
    let size = 5.0;
    if (sat.cat === "other")          size = 3.0;
    else if (sat.cat === "starlink")  size = 5.0;
    else if (sat.cat === "weather")   size = 5.5;
    else if (sat.cat === "gps")       size = 6.0;
    else if (sat.cat === "science")   size = 6.0;
    _satSizeArr[glCount] = size;
    glCount++;
  }

  // ---- GPU rendering wszystkich satelitów w jednym drawArrays ----
// Pozycje są w screen-space (te same co Canvas 2D używa dla labeli/klików),
  // więc nie ma ryzyka rozjazdu z resztą UI.
  if (gl && glSatProg && glCount > 0) {
    drawSatsWebGL(glCount);
  }

  // ---- Canvas 2D: trail za wybranym satelitą ----
if (selected && selected._trail && selected._trail.length > 1) {
    const trail = selected._trail;
    const N = trail.length;
    ctx.lineWidth = 1.5;
    for (let i = 1; i < N; i++) {
      const a = trail[i-1], b = trail[i];
      // Każdy punkt trail ma {x,y,z} (przed projekcją Canvas) - re-projekcja
      // bo glob mógł się obrócić od zapisu
      const ra = rot({x: a.px, y: a.py, z: a.pz});
      const rb = rot({x: b.px, y: b.py, z: b.pz});
      // Pomiń segmenty za horyzontem (z > 0 mocno znaczy że ukryte)
      const pa = proj(ra), pb = proj(rb);
      const alpha = i / N;  // od 0 (najstarszy) do 1 (najnowszy)
      ctx.strokeStyle = selected.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  // ---- Canvas 2D: highlights (selected/ISS) + labele ----
  highlights.sort((a, b) => b.z - a.z);
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 350);   // 0..1 puls
  highlights.forEach(({ sat }) => {
    const isSel = sat === selected;
    const dr = 4;
    const crossLen = 10;
    const col = sat.color;
    // Glow dla wybranego: pulsujaca poswiata wokol znacznika
    if (isSel) {
      const glowR = 14 + pulse * 8;
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.25;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(sat.sx, sat.sy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Pierscien pulsujacy
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.6 - pulse * 0.4;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sat.sx, sat.sy, glowR + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
    // Crosshair: cztery linie prostopadłe od kwadratu
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sat.sx - dr - crossLen, sat.sy); ctx.lineTo(sat.sx - dr - 2, sat.sy);
    ctx.moveTo(sat.sx + dr + 2, sat.sy);        ctx.lineTo(sat.sx + dr + crossLen, sat.sy);
    ctx.moveTo(sat.sx, sat.sy - dr - crossLen); ctx.lineTo(sat.sx, sat.sy - dr - 2);
    ctx.moveTo(sat.sx, sat.sy + dr + 2);        ctx.lineTo(sat.sx, sat.sy + dr + crossLen);
    ctx.stroke();
    if (isSel) {
      ctx.strokeRect(sat.sx - dr, sat.sy - dr, dr*2, dr*2);
    } else {
      ctx.fillStyle = col;
      ctx.fillRect(sat.sx - dr, sat.sy - dr, dr*2, dr*2);
    }
    const lbl = document.createElement("div");
    lbl.className = "sat-label";
    lbl.textContent = sat.name;
    lbl.style.left = sat.sx + "px";
    lbl.style.top = sat.sy + "px";
    overlay.appendChild(lbl);
  });

  document.getElementById("s-visible").textContent = visCount;
  _visCount = visCount;
}

