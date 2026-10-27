// ---- DRAW ----
function drawBg() {
  const cx = W/2, cy = H/2;

  if (gl) {
    // Tło WebGL wypełnia cały obszar - Canvas 2D zostaje transparentne nad nim.
    // Nie rysujemy tu nic, żeby nie zasłonić satelitów które są poza obrysem globu.
  } else {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) / 2);
    g.addColorStop(0, "#050c1e");
    g.addColorStop(1, "#020509");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Stars only outside globe area
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 220; i++) {
    const sx = ((i * 1543 + 127) % W);
    const sy = ((i * 2311 + 89)  % H);
    const dx = sx - cx, dy = sy - cy;
    if (dx*dx + dy*dy < (R+1)*(R+1)) continue;
    const sz = i % 4 === 0 ? 1.1 : 0.55;
    ctx.beginPath();
    ctx.arc(sx, sy, sz, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGlobe() {
  const cx = W / 2, cy = H / 2;

  // WebGL renders the textured sphere on its own canvas (behind 2D canvas)
  if (gl) {
    _drawWebGLGlobe();
  } else {
    // Fallback: solid ocean + land polygons on 2D canvas
    const og = ctx.createRadialGradient(cx - R*0.3, cy - R*0.3, 0, cx, cy, R);
    og.addColorStop(0, "#1a4a7a"); og.addColorStop(0.5, "#0d2f55"); og.addColorStop(1, "#061828");
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
    ctx.fillStyle = og; ctx.fill();
    drawLand(cx, cy);
  }

  // WebGL canvas is behind - 2D canvas is transparent over globe area
  // Just don't draw anything opaque where the globe is

  // Day/night is handled by WebGL shader; 2D overlay only for fallback mode
  if (!gl) drawDayNight(cx, cy);

  // Grid lines on top
  drawGrid(cx, cy);

  // Atmosfera: cienka poswiata na krawedzi globu (radial gradient na zewnatrz R).
  // Subtelna, pasuje do brutalist stylu. Wlaczana flaga showAtmosphere.
  if (showAtmosphere) {
    const ag = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.13);
    ag.addColorStop(0,    "rgba(60,160,255,0.0)");
    ag.addColorStop(0.35, "rgba(60,160,255,0.18)");
    ag.addColorStop(0.7,  "rgba(40,120,220,0.07)");
    ag.addColorStop(1,    "rgba(40,120,220,0.0)");
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.13, 0, Math.PI * 2);
    ctx.fillStyle = ag;
    ctx.fill();
  }

  // Border globu (1px)
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(0,255,102,0.25)";
  ctx.lineWidth = 1; ctx.stroke();
}

// Legacy texture buffer (unused when WebGL is active)
var _globeBuf = null, _globeBufR = null, _globeBufRX = null, _globeBufRY = null;

// Precompute the inverse rotation matrix so we can go screen -> sphere -> lat/lng
function invRot(rx, ry) {
  // Inverse of rot(): rotY then rotX  ->  inverse: -rotX then -rotY
  const cy = Math.cos(-ry), sy = Math.sin(-ry);
  const cx = Math.cos(-rx), sx = Math.sin(-rx);
  return (x, y, z) => {
    // undo rotX
    const y1 =  y * cx - z * sx;
    const z1 =  y * sx + z * cx;
    // undo rotY
    const x2 =  x * cy + z1 * sy;
    const z2 = -x * sy + z1 * cy;
    return { x: x2, y: y1, z: z2 };
  };
}

function drawTexturedGlobe(cx, cy) {
  const ri = Math.ceil(R);
  // Re-render offscreen buffer when rotation or size changes
  const needsRender = !_globeBuf
    || _globeBufR !== ri
    || Math.abs(_globeBufRX - rotX) > 0.002
    || Math.abs(_globeBufRY - rotY) > 0.002;
  if (needsRender) {
    _globeBuf   = _renderGlobeToBuffer(ri);
    _globeBufR  = ri;
    _globeBufRX = rotX;
    _globeBufRY = rotY;
  }
  // Blit buffer to main canvas
  ctx.drawImage(_globeBuf, cx - ri, cy - ri);
}

// Pre-scaled texture data - computed once when image loads
var _texData = null, _TEX_W = 0, _TEX_H = 0;

function _ensureTexData() {
  if (_texData) return;
  const img = window._earthImgRef;
  if (!img) return;
  _TEX_W = 512; _TEX_H = 256;
  const tb = new OffscreenCanvas(_TEX_W, _TEX_H);
  tb.getContext("2d").drawImage(img, 0, 0, _TEX_W, _TEX_H);
  _texData = tb.getContext("2d").getImageData(0, 0, _TEX_W, _TEX_H).data;
}

function _renderGlobeToBuffer(ri) {
  _ensureTexData();

  // Render at HALF resolution then upscale 2x - 4x fewer pixels
  const SCALE = 2;
  const half  = Math.ceil(ri / SCALE);
  const sz    = half * 2;
  const buf   = new OffscreenCanvas(sz, sz);
  const bctx  = buf.getContext("2d");

  if (!_texData) {
    bctx.fillStyle = "#0d2f55";
    bctx.beginPath(); bctx.arc(half, half, half, 0, Math.PI * 2);
    bctx.fill();
    // Upscale and return
    const out = new OffscreenCanvas(ri * 2, ri * 2);
    out.getContext("2d").drawImage(buf, 0, 0, ri * 2, ri * 2);
    return out;
  }

  const imgData = bctx.createImageData(sz, sz);
  const outPx   = imgData.data;
  const invR    = invRot(rotX, rotY);
  const persp   = ri * 3.5;
  const riS     = ri / SCALE;  // sphere radius in half-res coords
  const ri2     = riS * riS;

  for (let py = 0; py < sz; py++) {
    for (let px = 0; px < sz; px++) {
      // Fast circle cull
      const dx0 = px - half, dy0 = py - half;
      if (dx0*dx0 + dy0*dy0 > ri2 + riS) continue;

      const sx =  dx0 * SCALE;
      const sy = -dy0 * SCALE;

      const dx = sx / persp, dy = sy / persp;
      const a  = dx*dx + dy*dy + 1;
      const b  = -2 * persp;
      const c  = persp*persp - ri*ri;
      const disc = b*b - 4*a*c;
      if (disc < 0) continue;

      const u = (-b - Math.sqrt(disc)) / (2 * a);
      const Z = u - persp, X = dx * u, Y = dy * u;

      const w   = invR(X, Y, Z);
      const lat = Math.asin(Math.max(-1, Math.min(1, w.y / ri)));
      const lng = Math.atan2(w.z, w.x);

      const uf = (lng / (Math.PI * 2) + 0.5);
      const vf = 0.5 - lat / Math.PI;
      const tx = Math.min(_TEX_W - 1, Math.floor(uf * _TEX_W));
      const ty = Math.min(_TEX_H - 1, Math.floor(vf * _TEX_H));

      const ti = (ty * _TEX_W + tx) * 4;
      const pi = (py * sz + px) * 4;
      outPx[pi]   = _texData[ti];
      outPx[pi+1] = _texData[ti+1];
      outPx[pi+2] = _texData[ti+2];
      outPx[pi+3] = 255;
    }
  }

  bctx.putImageData(imgData, 0, 0);

  // Upscale to full resolution with clip
  const fullSz  = ri * 2;
  const final   = new OffscreenCanvas(fullSz, fullSz);
  const fctx    = final.getContext("2d");
  fctx.beginPath();
  fctx.arc(ri, ri, ri, 0, Math.PI * 2);
  fctx.clip();
  // Upscale with smoothing
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = "medium";
  fctx.drawImage(buf, 0, 0, fullSz, fullSz);

  return final;
}

// Day/night terminator - shade night side
function drawDayNight(cx, cy) {
  const now   = new Date();
  const dayFrac = (now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 86400;

  // Approximate sub-solar point
  const solarDec  = -23.45 * Math.cos((now.getUTCMonth() + 10) / 12 * 2 * Math.PI) * DEG;
  const solarHour = (dayFrac - 0.5) * 360 * DEG;  // hour angle to longitude

  const sx = Math.cos(solarDec) * Math.cos(solarHour);
  const sy = Math.sin(solarDec);
  const sz = Math.cos(solarDec) * Math.sin(solarHour);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  // For each pixel on globe determine if it's night
  // Approximate via gradient in sun direction
  const sunRot  = rot({ x: sx * R, y: sy * R, z: sz * R });
  const sunProj = proj(sunRot);

  // Radial gradient centred on anti-sun point for night overlay
  const aSunRot  = rot({ x: -sx * R, y: -sy * R, z: -sz * R });
  const aSunProj = proj(aSunRot);

  const nightGrad = ctx.createRadialGradient(aSunProj.x, aSunProj.y, R * 0.1, aSunProj.x, aSunProj.y, R * 1.8);
  nightGrad.addColorStop(0,    "rgba(0,0,20,0.75)");
  nightGrad.addColorStop(0.35, "rgba(0,0,15,0.55)");
  nightGrad.addColorStop(0.5,  "rgba(0,0,8,0.20)");
  nightGrad.addColorStop(0.6,  "transparent");

  ctx.fillStyle = nightGrad;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
}

// Simplified land polygons - major continents as lat/lng point arrays
// Each sub-array is one polygon; drawn as filled shapes on the globe
var LAND = [
  // North America (simplified)
  [[-170,72],[-140,70],[-120,60],[-95,50],[-83,46],[-82,42],[-75,45],[-65,47],[-60,50],[-55,47],[-53,46],[-60,43],[-70,41],[-75,35],[-80,25],[-87,15],[-83,8],[-77,8],[-75,10],[-78,15],[-85,16],[-90,16],[-92,18],[-97,19],[-105,20],[-110,22],[-115,29],[-118,34],[-122,37],[-124,40],[-130,54],[-135,58],[-140,60],[-148,60],[-155,58],[-160,60],[-165,60],[-168,64],[-170,72]],
  // Greenland
  [[-45,83],[-20,83],[-18,76],[-20,70],[-25,65],[-35,63],[-45,60],[-52,63],[-55,70],[-55,77],[-45,83]],
  // South America
  [[-80,12],[-75,10],[-62,10],[-50,5],[-35,-5],[-35,-8],[-38,-10],[-40,-15],[-40,-20],[-42,-22],[-45,-23],[-48,-28],[-51,-33],[-53,-33],[-58,-34],[-62,-38],[-65,-42],[-66,-45],[-65,-50],[-68,-54],[-70,-52],[-73,-48],[-75,-40],[-72,-35],[-70,-30],[-70,-18],[-75,-10],[-77,-2],[-78,2],[-78,8],[-80,12]],
  // Europe (simplified)
  [[-10,36],[0,36],[10,38],[18,40],[28,41],[30,38],[34,37],[36,36],[36,42],[34,46],[25,48],[22,55],[18,57],[15,58],[10,57],[5,52],[0,46],[-2,44],[-8,44],[-10,38],[-10,36]],
  // Scandinavia
  [[5,57],[10,57],[15,58],[20,60],[25,65],[28,70],[25,72],[20,70],[18,65],[15,60],[10,58],[5,57]],
  // Africa
  [[-5,35],[10,37],[15,38],[25,37],[35,32],[40,22],[42,12],[44,11],[42,4],[40,-2],[36,-8],[34,-20],[32,-26],[28,-30],[26,-34],[20,-34],[18,-28],[14,-22],[12,-18],[10,-10],[6,-2],[2,4],[0,5],[-5,5],[-8,5],[-15,10],[-18,14],[-18,20],[-14,22],[-12,24],[-10,28],[-5,32],[-5,35]],
  // Asia (simplified, split)
  [[26,42],[35,37],[40,36],[50,30],[55,25],[60,22],[65,22],[70,22],[75,20],[80,12],[80,8],[77,8],[72,20],[68,22],[65,25],[60,25],[55,22],[50,20],[45,15],[42,12],[42,37],[36,42],[30,46],[25,48],[28,55],[30,60],[28,70],[30,75],[40,73],[50,72],[55,73],[60,72],[65,68],[70,65],[75,65],[80,65],[85,68],[90,72],[95,72],[100,70],[105,72],[110,70],[115,65],[120,60],[125,55],[130,48],[135,45],[140,42],[142,45],[142,52],[140,55],[135,60],[130,65],[125,68],[120,70],[115,73],[105,75],[100,77],[90,77],[80,75],[70,72],[65,70],[60,68],[55,70],[50,68],[45,66],[40,65],[35,60],[30,57],[26,55],[22,55],[25,48],[30,46],[26,42]],
  // Australia
  [[115,-22],[120,-20],[125,-15],[130,-12],[136,-12],[138,-15],[142,-10],[145,-15],[150,-20],[152,-25],[152,-30],[148,-35],[145,-38],[140,-38],[135,-35],[130,-34],[125,-32],[120,-28],[116,-24],[115,-22]],
  // Japan (simplified)
  [[130,31],[135,33],[136,36],[138,38],[140,40],[141,42],[140,44],[135,42],[131,34],[130,31]],
  // UK / Ireland
  [[-6,50],[-3,50],[0,51],[2,52],[0,55],[-3,58],[-6,58],[-8,56],[-6,54],[-4,52],[-6,50]],
  // New Zealand (simplified)
  [[172,-34],[174,-36],[176,-38],[176,-42],[172,-44],[170,-42],[168,-44],[167,-46],[168,-46],[170,-44],[172,-42],[173,-38],[172,-34]],
  // Iceland
  [[-25,63],[-14,63],[-12,65],[-14,66],[-18,66],[-22,65],[-25,64],[-25,63]],
  // Antarctica (rough)
  [[-180,-75],[-150,-72],[-120,-70],[-90,-72],[-60,-70],[-30,-72],[0,-71],[30,-72],[60,-70],[90,-72],[120,-70],[150,-72],[180,-75],[180,-90],[-180,-90],[-180,-75]],
];

function _landPointToScreen(lat, lng) {
  const rr = rot(llr(lat, lng, R - 1));
  return { p: proj(rr), front: rr.z > 0 };
}

function drawLand(cx, cy) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  const landColor = "rgba(34,85,45,0.82)";
  const landBorder = "rgba(50,120,60,0.5)";

  LAND.forEach(poly => {
    if (poly.length < 3) return;
    // Project all points
    const pts = poly.map(([lng, lat]) => _landPointToScreen(lat, lng));

    // Check if at least some points face front
    const frontCount = pts.filter(p => p.front).length;
    if (frontCount === 0) return;

    // Draw polygon - skip segments that cross the limb (long screen jumps)
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < pts.length; i++) {
      const cur  = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      if (!cur.front) { started = false; continue; }
      const dx = cur.p.x - prev.p.x, dy = cur.p.y - prev.p.y;
      if (!started || Math.hypot(dx, dy) > R * 0.5) {
        ctx.moveTo(cur.p.x, cur.p.y);
        started = true;
      } else {
        ctx.lineTo(cur.p.x, cur.p.y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = landColor;
    ctx.fill();
    ctx.strokeStyle = landBorder;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  });

  ctx.restore();
}

function drawGrid(cx, cy) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  // Minor grid - denser and slightly brighter
  ctx.strokeStyle = "rgba(0,100,200,0.22)";
  ctx.lineWidth = 0.5;
  for (let lat = -80; lat <= 80; lat += 15) drawLatLine(lat);
  for (let lng = -180; lng <= 180; lng += 20) drawLngLine(lng);

  // Equator
  ctx.strokeStyle = "rgba(0,180,255,0.45)";
  ctx.lineWidth = 1;
  drawLatLine(0);

  // Tropics + Arctic/Antarctic circles
  ctx.strokeStyle = "rgba(0,140,200,0.20)";
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 6]);
  for (const lat of [-66.5, -23.5, 23.5, 66.5]) drawLatLine(lat);
  ctx.setLineDash([]);

  ctx.restore();
}

function drawLatLine(lat) {
  const segs = [];
  for (let lng = -180; lng <= 180; lng += 2) {
    const r = rot(llr(lat, lng, R));
    const p = proj(r);
    if (r.z > -R) segs.push(p);
    else if (segs.length) { strokeSegs(segs); segs.length = 0; }
  }
  strokeSegs(segs);
}

function drawLngLine(lng) {
  const segs = [];
  for (let lat = -85; lat <= 85; lat += 2) {
    const r = rot(llr(lat, lng, R));
    const p = proj(r);
    if (r.z > -R) segs.push(p);
    else if (segs.length) { strokeSegs(segs); segs.length = 0; }
  }
  strokeSegs(segs);
}

function strokeSegs(pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

