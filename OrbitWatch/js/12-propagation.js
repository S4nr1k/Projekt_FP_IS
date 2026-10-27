// ---- PROPAGATION ----
function propagate(sat, now) {
  if (!sat.satrec) return;
  try {
    const pv = satellite.propagate(sat.satrec, now);
    if (!pv.position) return;
    const gmst = satellite.gstime(now);
    const geo  = satellite.eciToGeodetic(pv.position, gmst);
    sat.lat = satellite.degreesLat(geo.latitude);
    sat.lng = satellite.degreesLong(geo.longitude);
    sat.alt = geo.height;
    sat.vx  = pv.velocity ? pv.velocity.x : 0;
    sat.vy  = pv.velocity ? pv.velocity.y : 0;
    sat.vz  = pv.velocity ? pv.velocity.z : 0;
  } catch {}
}

function orbitPoints(sat, steps) {
  if (!sat.satrec) return [];
  const now    = Date.now();
  const period = (2 * Math.PI / sat.satrec.no) * 60000;
  const pts    = [];
  for (let i = 0; i <= steps; i++) {
    const t = new Date(now + (i / steps) * period);
    try {
      const pv = satellite.propagate(sat.satrec, t);
      if (!pv.position) continue;
      const gmst = satellite.gstime(t);
      const geo  = satellite.eciToGeodetic(pv.position, gmst);
      pts.push({
        lat: satellite.degreesLat(geo.latitude),
        lng: satellite.degreesLong(geo.longitude),
        alt: geo.height,
      });
    } catch {}
  }
  return pts;
}

