// ---- WEBGL INIT (shadery, bufory, tekstury) ----
function _initWebGL() {
  if (!glCanvas) return;
  gl = glCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) { console.warn("WebGL not available"); return; }
  // Size canvas immediately
  const _wrap = document.getElementById("globe-wrap");
  if (_wrap) { glCanvas.width = _wrap.clientWidth; glCanvas.height = _wrap.clientHeight; }

  // Vertex shader: transforms sphere geometry + passes UV and normal
  const vert = `
    attribute vec3 aPos;
    attribute vec2 aUV;
    uniform mat4 uMV;
    uniform mat4 uP;
    varying vec2 vUV;
    varying vec3 vNorm;
    void main() {
      vUV   = aUV;
      // Normal = aPos on unit sphere in geographic coords (same space as sun direction)
      // Both sun and normal are in ECI-aligned coords, view rotation doesn't affect their dot product
      vNorm = aPos;
      gl_Position = uP * uMV * vec4(aPos, 1.0);
    }
  `;

  // Fragment shader: texture + Lambert sun shading + terminator
  const frag = `
    precision mediump float;
    varying vec2 vUV;
    varying vec3 vNorm;
    uniform sampler2D uTex;
    uniform vec3 uSun;
    void main() {
      vec4 tex  = texture2D(uTex, vUV);
      float d   = dot(normalize(vNorm), normalize(uSun));
      float lit = smoothstep(-0.12, 0.15, d);
      vec3 night = tex.rgb * 0.25 + vec3(0.0, 0.005, 0.025);
      vec3 day   = tex.rgb * 1.1;
      gl_FragColor = vec4(mix(night, day, lit), 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error("Shader error:", gl.getShaderInfoLog(s));
    return s;
  }

  glProg = gl.createProgram();
  gl.attachShader(glProg, compile(gl.VERTEX_SHADER, vert));
  gl.attachShader(glProg, compile(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(glProg);
  if (!gl.getProgramParameter(glProg, gl.LINK_STATUS))
    console.error("Program link error:", gl.getProgramInfoLog(glProg));

  // Build unit sphere mesh
  const SLAT = 96, SLNG = 192;
  const pos = [], uvs = [], idx = [];
  for (let la = 0; la <= SLAT; la++) {
    const phi = (la / SLAT) * Math.PI;
    const sp  = Math.sin(phi), cp = Math.cos(phi);
    for (let lo = 0; lo <= SLNG; lo++) {
      const lam = (lo / SLNG) * 2 * Math.PI;
      pos.push(sp * Math.cos(lam), cp, sp * Math.sin(lam));
      uvs.push((lo / SLNG + 0.5) % 1.0, la / SLAT);
    }
  }
  for (let la = 0; la < SLAT; la++) {
    for (let lo = 0; lo < SLNG; lo++) {
      const a = la*(SLNG+1)+lo;
      idx.push(a, a+1, a+SLNG+1, a+1, a+SLNG+2, a+SLNG+1);
    }
  }

  gl.getExtension("OES_element_index_uint");

  glBuf.pos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuf.pos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);

  glBuf.uv = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuf.uv);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);

  glBuf.idx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuf.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
  glBuf.count = idx.length;

  // Texture
  glTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE,
    new Uint8Array([10, 50, 100]));

  // To laduje teksture; isCurrent pozwala zignorowac spoznione zadanie,
  // gdy uzytkownik zdazyl wybrac inna jakosc.
  function loadTex(src, onDone, isCurrent) {
    const img = new Image();
    img.onload = () => {
      if (isCurrent && !isCurrent()) return;
      gl.bindTexture(gl.TEXTURE_2D, glTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      // Mipmapy dzialaja tylko dla wymiarow bedacych potega 2. Tekstury Ziemi
      // sa NPOT (np. 5400x2700), wiec uzywamy LINEAR + CLAMP bez mipmap.
      const isPOT = (n) => (n & (n - 1)) === 0;
      if (isPOT(img.naturalWidth) && isPOT(img.naturalHeight)) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const ext = gl.getExtension("EXT_texture_filter_anisotropic") ||
                  gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
                  gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
      if (ext) {
        const maxAniso = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
      }
      glTexLoaded = true;
      window._earthImgRef = img;
      window._earthImgLoaded = true;
      setStatus("earth texture: " + img.naturalWidth + "x" + img.naturalHeight);
      if (onDone) onDone();
    };
    img.onerror = () => { console.warn("Texture failed:", src); if (onDone) onDone(); };
    setStatus("loading earth texture...");
    img.src = src;
  }

  // Tekstury Ziemi. Zrodlo: Solar System Scope "8K Earth Day Map" (8192x4096),
  // CC BY 4.0, (c) 2010-2017 Solar System Scope. Pliki 2K/5K/8K generuje skrypt
  // przygotuj_tekstury.py i sa serwowane lokalnie z vendor/textures.
  // Gdy brak wybranej rozdzielczosci, ladowana jest nastepna nizsza.
  const TEX_DIR = "vendor/textures/";
  const TEX_SOURCES = {
    "2k": [TEX_DIR + "earth_2k.jpg"],
    "5k": [TEX_DIR + "earth_5k.jpg", TEX_DIR + "earth_2k.jpg"],
    "8k": [TEX_DIR + "earth_8k.jpg", TEX_DIR + "earth_5k.jpg", TEX_DIR + "earth_2k.jpg"],
  };
  let _texReq = 0;   // numer ostatniego zadania zmiany jakosci

  // Laduje teksture danego poziomu jakosci, probuje fallbacki po kolei.
  function loadEarthTexture(quality) {
    const sources = TEX_SOURCES[quality] || TEX_SOURCES["5k"];
    const req = ++_texReq;
    const isCurrent = () => req === _texReq;
    let idx = 0;
    function tryNext() {
      if (!isCurrent()) return;
      if (idx >= sources.length) {
        console.warn("Wszystkie tekstury zawiodly");
        setStatus("brak tekstury Ziemi - uruchom przygotuj_tekstury.py");
        return;
      }
      loadTex(sources[idx++], function() {
        if (!glTexLoaded) tryNext();
      }, isCurrent);
    }
    glTexLoaded = false;
    tryNext();
  }

  // Domyslnie 5K (kompromis jakosc/wydajnosc). Zapamietane w localStorage.
  const savedQuality = localStorage.getItem("orbitwatch_texquality") || "5k";
  window._texQuality = savedQuality;
  window._loadEarthTexture = loadEarthTexture;   // udostepnij dla przelacznika UI
  loadEarthTexture(savedQuality);

  // ---- SATELLITE POINT SHADER ----
// Wersja 2D: pozycja sat dana w pikselach ekranu (sat.sx, sat.sy) tak samo
  // jak Canvas oblicza. Eliminuje rozbieżność między Canvas 2D a WebGL.
  const satVert = `
    precision highp float;
    attribute vec2 aPos;       // pozycja w pikselach ekranu (screen-space)
    attribute vec3 aColor;
    attribute float aSize;
    uniform vec2 uViewport;    // width, height
    varying vec3 vColor;
    void main() {
      // Konwersja screen-space -> clip-space [-1, +1]
      vec2 clip = vec2(
         (aPos.x / uViewport.x) * 2.0 - 1.0,
        -((aPos.y / uViewport.y) * 2.0 - 1.0)   // Y odwrócone
      );
      gl_Position = vec4(clip, 0.0, 1.0);
      vColor = aColor;
      gl_PointSize = aSize;
    }
  `;

  const satFrag = `
    precision highp float;
    varying vec3 vColor;
    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      float d = max(abs(p.x), abs(p.y)) * 2.0;
      if (d > 1.0) discard;
      float edge = 0.78;
      vec3 col = (d > edge) ? vec3(0.0) : vColor;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  glSatProg = gl.createProgram();
  gl.attachShader(glSatProg, compile(gl.VERTEX_SHADER, satVert));
  gl.attachShader(glSatProg, compile(gl.FRAGMENT_SHADER, satFrag));
  gl.linkProgram(glSatProg);
  if (!gl.getProgramParameter(glSatProg, gl.LINK_STATUS))
    console.error("Sat program link error:", gl.getProgramInfoLog(glSatProg));

  // Buffery satelitów - dynamic draw, realokowane gdy zmieni się rozmiar
  glSatBuf.pos   = gl.createBuffer();
  glSatBuf.color = gl.createBuffer();
  glSatBuf.size  = gl.createBuffer();
  glSatBuf.count = 0;
  glSatBuf.cap   = 0;  // alokowana pojemność
}

// Accurate sub-solar point calculation
// Returns unit vector pointing from Earth center toward Sun, in ECI-like coords
// where x=toward prime meridian at J2000, y=north pole, z=east
function _sunDirection() {
  const now  = new Date(_virtNow);   // use virtual time for time warp
  // Julian date
  const JD   = now / 86400000 + 2440587.5;
  const T    = (JD - 2451545.0) / 36525;  // Julian centuries from J2000

  // Sun mean longitude and mean anomaly (degrees)
  const L0   = (280.46646 + 36000.76983 * T) % 360;
  const M    = (357.52911 + 35999.05029 * T - 0.0001537 * T*T) % 360;
  const Mrad = M * DEG;

  // Equation of center
  const C    = (1.914602 - 0.004817*T - 0.000014*T*T) * Math.sin(Mrad)
             + (0.019993 - 0.000101*T) * Math.sin(2*Mrad)
             + 0.000289 * Math.sin(3*Mrad);

  // Sun true longitude & apparent longitude
  const sunLon  = (L0 + C) * DEG;
  const omega   = (125.04 - 1934.136 * T) * DEG;
  const appLon  = sunLon - 0.00569*DEG - 0.00478*DEG*Math.sin(omega);

  // Obliquity of ecliptic
  const eps  = (23.439291111 - 0.013004167*T) * DEG;

  // Sun unit vector in ECI (ecliptic -> equatorial)
  const sunX_ecl = Math.cos(appLon);
  const sunY_ecl = Math.sin(appLon);
  const sunX = sunX_ecl;
  const sunY = Math.cos(eps) * sunY_ecl;
  const sunZ = Math.sin(eps) * sunY_ecl;

  // Rotate by Greenwich Mean Sidereal Time so x-axis points toward prime meridian
  // GMST in radians
  const UT  = (now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 86400;
  const D   = JD - 2451545.0;
  const GMST_deg = (280.46061837 + 360.98564736629 * D) % 360;
  const GMST = GMST_deg * DEG;

  // Rotate sun from equatorial (RA/Dec) to Earth-fixed (rotate by -GMST around y)
  const cosG = Math.cos(-GMST), sinG = Math.sin(-GMST);
  const sx   =  sunX * cosG + sunZ * sinG;
  const sz   = -sunX * sinG + sunZ * cosG;
  const sy   =  sunY;

  // Our sphere: x=cos(lat)*cos(lng), y=sin(lat), z=cos(lat)*sin(lng)
  // This matches ECI after GMST rotation
  return [sx, sy, sz];
}

// Build column-major mat4 (WebGL format)
function mat4(a) { return new Float32Array(a); }

function mat4Mul(A, B) {
  const C = new Float32Array(16);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++)
    for (let k=0;k<4;k++) C[c*4+r] += A[k*4+r]*B[c*4+k];
  return C;
}

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1.0 / Math.tan(fovY / 2);
  return mat4([
    f/aspect, 0,  0,                        0,
    0,        f,  0,                        0,
    0,        0,  (far+near)/(near-far),   -1,
    0,        0,  (2*far*near)/(near-far),  0
  ]);
}

function mat4RotX(a) {
  const c=Math.cos(a), s=Math.sin(a);
  return mat4([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}

function mat4RotY(a) {
  const c=Math.cos(a), s=Math.sin(a);
  return mat4([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}

function mat4Scale(s) {
  return mat4([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]);
}

function mat4Translate(tx, ty, tz) {
  return mat4([1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]);
}

function _drawWebGLGlobe() {
  if (!gl || !glProg) return;
  if (glCanvas.width === 0 || glCanvas.height === 0) {
    glCanvas.width = W; glCanvas.height = H;
  }
  const cw = glCanvas.width, ch = glCanvas.height;
  gl.viewport(0, 0, cw, ch);
  // Wypełnij całe tło WebGL ciemnym kolorem (był wcześniej w Canvas 2D
  // jako "dziura wokół globu", ale to zasłaniało satelity poza obrysem).
  gl.clearColor(0x03/255, 0x08/255, 0x10/255, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);   // show both sides of sphere

  gl.useProgram(glProg);

  // Macierz modelu z negacją Z + rotacje z negacją + uFlipU=1 w shaderze.
  // Ta konfiguracja jest historyczna - działa, więc nie ruszamy.
  const Mscale = new Float32Array([R,0,0,0, 0,R,0,0, 0,0,-R,0, 0,0,0,1]);
  const M  = mat4Mul(mat4RotX(-rotX), mat4Mul(mat4RotY(-rotY), Mscale));

  // View: kamera w (0,0,R*3.5)
  const V  = mat4Translate(0, 0, -R * 3.5);

  const MV = mat4Mul(V, M);

  // Projection: match 2D canvas perspective
  // fovY such that at z=0 the globe fills ~0.38 of screen height
  const fovY   = 2 * Math.atan(ch / 2 / (R * 3.5));
  const aspect = cw / ch;
  const P      = mat4Perspective(fovY, aspect, R * 0.1, R * 20);

  const uMV = gl.getUniformLocation(glProg, "uMV");
  const uP  = gl.getUniformLocation(glProg, "uP");
  gl.uniformMatrix4fv(uMV, false, MV);
  gl.uniformMatrix4fv(uP,  false, P);
  // Zachowaj macierze do użycia w drawSatsWebGL (taki sam układ jak glob)
  window._lastMV = MV;
  window._lastP  = P;

  // Sun direction in ECI world space (unaffected by globe rotation)
  const sun = _sunDirection();
  gl.uniform3fv(gl.getUniformLocation(glProg, "uSun"), new Float32Array(sun));

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.uniform1i(gl.getUniformLocation(glProg, "uTex"), 0);

  const aPos = gl.getAttribLocation(glProg, "aPos");
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuf.pos);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  const aUV = gl.getAttribLocation(glProg, "aUV");
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuf.uv);
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuf.idx);
  gl.drawElements(gl.TRIANGLES, glBuf.count, gl.UNSIGNED_INT, 0);
}


function resize() {
  const wrap = document.getElementById("globe-wrap");
  W = cvs.width  = wrap.clientWidth;
  H = cvs.height = wrap.clientHeight;
  R = Math.min(W, H) * 0.38 * zoom;
  if (glCanvas) {
    glCanvas.width  = W;
    glCanvas.height = H;
  }
  _globeBuf = null; // force re-render
}

// Rozpoznaje kategorie satelity z nazwy (gdy backend nie sklasyfikowal).
function guessCatFromName(name, isDebris) {
  const n = (name || "").toUpperCase();
  if (/STARLINK/.test(n)) return "starlink";
  if (/ISS|ZARYA|TIANGONG|UNITY|ZVEZDA|NAUKA|CSS \(/.test(n)) return "iss";
  if (/NOAA|GOES|METOP|METEOSAT|HIMAWARI|FENGYUN|FY-|MSG|DMSP/.test(n)) return "weather";
  if (/GPS|GLONASS|GALILEO|BEIDOU|NAVSTAR|IRNSS|QZSS|COSMOS 2\d{3}/.test(n)) return "gps";
  if (/HUBBLE|HST|TERRA|AQUA|AURA|LANDSAT|SENTINEL|ICESAT|GRACE|SWARM|CRYOSAT|JASON/.test(n)) return "science";
  return "other";
}

