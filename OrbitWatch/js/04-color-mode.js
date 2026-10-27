// ---- COLOR MODE ----
var colorMode = "category";    // "category" | "altitude"
function altToColor(alt) {
  // Gradient od ciepłego (niskie) do zimnego (wysokie)
  // 0-2000 km (LEO): czerwone/żółte
  // 2000-20000 km (MEO): zielono-niebieskie
  // 20000-42000 km (GEO+): fioletowo-magenta
  const a = Math.max(0, Math.min(42000, alt || 0));
  let r, g, b;
  if (a < 2000) {
    // LEO: czerwony -> żółty -> zielony
    const t = a / 2000;
    if (t < 0.5) {
      const k = t / 0.5;
      r = 1.0;
      g = k * 0.8;
      b = 0.1;
    } else {
      const k = (t - 0.5) / 0.5;
      r = 1.0 - k * 0.6;
      g = 0.8 + k * 0.2;
      b = 0.1 + k * 0.3;
    }
  } else if (a < 20000) {
    // MEO: zielono-niebieskie
    const t = (a - 2000) / 18000;
    r = 0.4 - t * 0.3;
    g = 1.0 - t * 0.4;
    b = 0.4 + t * 0.5;
  } else {
    // GEO+: fiolet -> magenta
    const t = Math.min(1, (a - 20000) / 22000);
    r = 0.4 + t * 0.5;
    g = 0.3 - t * 0.2;
    b = 0.9;
  }
  return [r, g, b];
}

