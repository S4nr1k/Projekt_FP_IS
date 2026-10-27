// ---- COORDINATE TRANSFORMS ----
function llr(lat, lng, r) {
  const phi = lat * DEG;
  const lam = lng * DEG;
  return {
    x: r * Math.cos(phi) * Math.cos(lam),
    y: r * Math.sin(phi),
    z: r * Math.cos(phi) * Math.sin(lam),
  };
}

function rot(p) {
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const x1 =  p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  return { x: x1, y: p.y * cx - z1 * sx, z: p.y * sx + z1 * cx };
}

function proj(p) {
  const d = R * 3.5;
  const denom = Math.max(d + p.z, d * 0.01); // nigdy nie dziel przez ~0
  const s = d / denom;
  return { x: W / 2 + p.x * s, y: H / 2 - p.y * s, z: p.z };
}

