// ---- MINI-MAP ----
function drawMiniMap() {
  const mm = document.getElementById("mini-map");
  if (!mm) return;
  if (!selected || !isFinite(selected.lat)) {
    mm.style.display = "none";
    return;
  }
  mm.style.display = "block";
  const x  = mm.getContext("2d");
  const W  = mm.width, H = mm.height;
  x.clearRect(0, 0, W, H);

  // Tło equirectangular: po prostu siatka
  x.strokeStyle = "rgba(0,255,102,0.12)";
  x.lineWidth = 1;
  // Pionowe linie co 30°
  for (let lng = -180; lng <= 180; lng += 30) {
    const px = ((lng + 180) / 360) * W;
    x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke();
  }
  // Poziome co 30°
  for (let lat = -60; lat <= 60; lat += 30) {
    const py = (1 - (lat + 90) / 180) * H;
    x.beginPath(); x.moveTo(0, py); x.lineTo(W, py); x.stroke();
  }
  // Równik wyraźniej
  x.strokeStyle = "rgba(0,255,102,0.3)";
  const eq = H / 2;
  x.beginPath(); x.moveTo(0, eq); x.lineTo(W, eq); x.stroke();

  // Ground track. 240 punktow per orbita. Przeliczany co klatke.
  const track = computeGroundTrack(selected);
  const trackColor = selected.color || "#00ff66";
  if (track && track.length > 1) {
    x.strokeStyle = trackColor;
    x.lineWidth = 1.2;
    // Rysuj segmentami - nowy segment gdy longitude przeskoczy przez date-line.
    // Wrap wykrywany po RÓŻNICY longitude (>180° = przejście przez ±180).
    let started = false;
    let prevLng = null;
    x.beginPath();
    for (let i = 0; i < track.length; i++) {
      const pt = track[i];
      const px = ((pt.lng + 180) / 360) * W;
      const py = (1 - (pt.lat + 90) / 180) * H;
      const wrap = prevLng !== null && Math.abs(pt.lng - prevLng) > 180;
      if (!started || wrap) {
        x.moveTo(px, py);
        started = true;
      } else {
        x.lineTo(px, py);
      }
      prevLng = pt.lng;
    }
    x.stroke();
  }

  // Aktualna pozycja: znak +
  const cpx = ((selected.lng + 180) / 360) * W;
  const cpy = (1 - (selected.lat + 90) / 180) * H;
  x.strokeStyle = trackColor;
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(cpx - 6, cpy); x.lineTo(cpx + 6, cpy);
  x.moveTo(cpx, cpy - 6); x.lineTo(cpx, cpy + 6);
  x.stroke();
  x.strokeRect(cpx - 3, cpy - 3, 6, 6);

  // Etykieta na górze
  x.font = '9px "JetBrains Mono", monospace';
  x.fillStyle = "rgba(0,255,102,0.9)";
  x.fillText(selected.name, 4, 11);
  x.fillStyle = "rgba(255,255,255,0.5)";
  x.fillText(`${selected.lat.toFixed(1)}°, ${selected.lng.toFixed(1)}°`, 4, H - 4);
}

// Oblicz ground track dla 1 pełnej orbity (do mini-mapy)
function computeGroundTrack(sat) {
  if (!sat.satrec) return [];
  const periodMs = (2 * Math.PI / sat.satrec.no) * 60000;
  const steps = 240;   // gęste próbkowanie - gładka krzywa nawet dla GPS/GEO
  const dt = periodMs / steps;
  const nowMs = _virtNow;
  const start = nowMs - periodMs * 0.5;  // sat w centrum krzywej
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = new Date(start + i * dt);
    try {
      const pv = satellite.propagate(sat.satrec, t);
      if (!pv.position) continue;
      const gmst = satellite.gstime(t);
      const geo  = satellite.eciToGeodetic(pv.position, gmst);
      let lng = geo.longitude * 180 / Math.PI;
      while (lng > 180)  lng -= 360;
      while (lng < -180) lng += 360;
      pts.push({
        lat: geo.latitude  * 180 / Math.PI,
        lng,
      });
    } catch {}
  }
  return pts;
}

// Render satelitów przez GPU jednym wywołaniem drawArrays
function drawSatsWebGL(count) {
  // Upload danych do GPU. 2 floaty per sat (screen-space x,y).
  const posView = _satPosArr.subarray(0, count * 2);
  const colView = _satColArr.subarray(0, count * 3);
  const sizView = _satSizeArr.subarray(0, count);

  gl.useProgram(glSatProg);

  // Viewport size - żeby shader mógł konwertować pixele -> clip space
  gl.uniform2f(gl.getUniformLocation(glSatProg, "uViewport"),
               glCanvas.width, glCanvas.height);

  // Pozycja (2 floaty)
  gl.bindBuffer(gl.ARRAY_BUFFER, glSatBuf.pos);
  if (count > glSatBuf.cap) {
    gl.bufferData(gl.ARRAY_BUFFER, _satPosArr.byteLength, gl.DYNAMIC_DRAW);
    glSatBuf.cap = _satPosArr.length / 2;
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, posView);
  const aPos = gl.getAttribLocation(glSatProg, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Kolor (3 floaty)
  gl.bindBuffer(gl.ARRAY_BUFFER, glSatBuf.color);
  if (gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) < colView.byteLength) {
    gl.bufferData(gl.ARRAY_BUFFER, _satColArr.byteLength, gl.DYNAMIC_DRAW);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, colView);
  const aColor = gl.getAttribLocation(glSatProg, "aColor");
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  // Rozmiar
  gl.bindBuffer(gl.ARRAY_BUFFER, glSatBuf.size);
  if (gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) < sizView.byteLength) {
    gl.bufferData(gl.ARRAY_BUFFER, _satSizeArr.byteLength, gl.DYNAMIC_DRAW);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, sizView);
  const aSize = gl.getAttribLocation(glSatProg, "aSize");
  gl.enableVertexAttribArray(aSize);
  gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0);

  gl.disable(gl.DEPTH_TEST);
  gl.drawArrays(gl.POINTS, 0, count);

  gl.disableVertexAttribArray(aPos);
  gl.disableVertexAttribArray(aColor);
  gl.disableVertexAttribArray(aSize);
}

function updateStats() {
  document.getElementById("s-total").textContent  = allSats.length;
  document.getElementById("s-filter").textContent = filtered.length;
}

