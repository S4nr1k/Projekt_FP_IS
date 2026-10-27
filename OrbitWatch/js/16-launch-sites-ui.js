// ---- LAUNCH SITES ----
var showLaunchSites = true;   // can be toggled by user
var hoverSite = null;

function drawLaunchSites() {
  if (!showLaunchSites) return;
  ctx.save();
  for (const site of LAUNCH_SITES) {
    const rr = rot(llr(site.lat, site.lng, R + 1));
    if (rr.z > R * 0.15) {        // za horyzontem
      site._sx = null;
      continue;
    }
    const p = proj(rr);
    site._sx = p.x;
    site._sy = p.y;
    const isHover = hoverSite === site;
    // Krzyżyk markera
    const size = isHover ? 7 : 5;
    ctx.strokeStyle = isHover ? "#ff66aa" : "#ff66aa";
    ctx.lineWidth = isHover ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(p.x - size, p.y);
    ctx.lineTo(p.x + size, p.y);
    ctx.moveTo(p.x, p.y - size);
    ctx.lineTo(p.x, p.y + size);
    ctx.stroke();
    // Okrąg wokół
    ctx.beginPath();
    ctx.arc(p.x, p.y, size + 2, 0, Math.PI * 2);
    ctx.stroke();
    // Label tylko dla hover
    if (isHover) {
      // Lazy fetch liczby misji (raz)
      if (site._missionCount === undefined) {
        site._missionCount = "...";
        fetch(`/api/launch_site/${site.id}`).then(r => r.json()).then(data => {
          site._missions = data || [];
          site._missionCount = data ? data.length : 0;
          // Najnowsza data startu z aktywnych misji
          const active = (data || []).filter(m => !m.decay_date);
          if (active.length > 0 && active[0].launch_date) {
            site._latestLaunch = active[0].launch_date;
          }
        }).catch(() => { site._missionCount = "?"; });
      }
      const missions = site._missionCount;
      const latest = site._latestLaunch
        ? `  ${lang==='pl'?'ost.':'last'}: ${site._latestLaunch}`
        : "";
      const txt = `${site.name}  ·  ${missions} ${lang==='pl'?'misji':'missions'}${latest}`;
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.font = '10px "JetBrains Mono", monospace';
      const tw  = ctx.measureText(txt).width + 12;
      ctx.fillRect(p.x - tw/2, p.y - 26, tw, 16);
      ctx.strokeStyle = "#ff66aa";
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - tw/2, p.y - 26, tw, 16);
      ctx.fillStyle = "#ff66aa";
      ctx.textAlign = "center";
      ctx.fillText(txt, p.x, p.y - 15);
      ctx.textAlign = "left";
    }
  }
  ctx.restore();
}

// Hover detection - wywołane z handleHover gdy sat nie znaleziony
function findHoverLaunchSite(mx, my) {
  for (const site of LAUNCH_SITES) {
    if (site._sx == null) continue;
    const dx = mx - site._sx;
    const dy = my - site._sy;
    if (dx*dx + dy*dy < 100) return site;  // 10px radius
  }
  return null;
}

// Klik - pokaż popup z misjami startującymi z danego miejsca
async function showLaunchSitePopup(site) {
  _currentLaunchSite = site;   // zapamiętaj dla i18n
  const pr = document.getElementById("panel-right");
  // Najpierw pokazujemy szkielet z loadingiem
  pr.innerHTML = `
    <div class="pr-header">
      <div class="pr-name">${site.name}</div>
      <div class="pr-norad">${site.country} &middot; ${site.operators.join(", ")}</div>
    </div>
    <div class="info-section">
      <div class="is-title">${t("current_position")}</div>
      <div class="data-row"><span class="dr-key">${t("latitude")}</span><span class="dr-val c-accent">${site.lat.toFixed(4)}&deg;</span></div>
      <div class="data-row"><span class="dr-key">${t("longitude")}</span><span class="dr-val c-accent">${site.lng.toFixed(4)}&deg;</span></div>
    </div>
    <div class="info-section" id="ls-missions">
      <div class="is-title">${t("missions_from")}</div>
      <div style="color:var(--dim);font-size:11px;padding:8px 0">${lang==='pl'?'ładowanie...':'loading...'}</div>
    </div>
  `;

  // Pobierz misje z backendu - użyj cache z hovera jeśli jest
  let missions = site._missions;
  if (!missions) {
    try {
      const r = await fetch(`/api/launch_site/${site.id}`);
      if (r.ok) missions = await r.json();
    } catch {}
  }
  missions = missions || [];

  // Podział: w aktualnym katalogu TLE (klikalne) vs poza nim (deorbitowane/archiwalne)
  const noradSet = new Set(allSats.map(s => s.norad));
  const inCatalog = missions.filter(m => noradSet.has(m.norad));
  const notInCatalog = missions.filter(m => !noradSet.has(m.norad));
  const activeCount = missions.filter(m => !m.decay_date).length;
  const decayedCount = missions.length - activeCount;

  const sec = document.getElementById("ls-missions");
  if (!sec) return;
  if (missions.length === 0) {
    sec.innerHTML = `
      <div class="is-title">${t("missions_from")} (0)</div>
      <div style="color:var(--dim);font-size:11px;padding:8px 0">
        ${lang==='pl' ? 'Brak misji w bazie SATCAT. Skonfiguruj Space-Track dla pełnej bazy.' : 'No missions in SATCAT. Configure Space-Track for full database.'}
      </div>`;
    return;
  }

  // Nagłówek + legenda
  let html = `<div class="is-title">${t("missions_from")} (${missions.length})</div>`;
  html += `<div style="font-size:9px;color:var(--dim);padding:0 0 6px;line-height:1.5">
    ${lang==='pl'
      ? `${activeCount} na orbicie · ${decayedCount} zdeorbitowanych`
      : `${activeCount} on orbit · ${decayedCount} decayed`}<br>
    <span style="color:var(--accent)">■</span> ${lang==='pl'?'jasne = w katalogu (klikalne)':'bright = in catalog (clickable)'} ·
    <span style="opacity:0.5">■</span> ${lang==='pl'?'szare = archiwalne':'gray = archival'}
  </div>`;
  html += '<div style="max-height:55vh;overflow-y:auto">';

  // Najpierw w katalogu (klikalne), potem reszta (archiwalne)
  const showList = [...inCatalog, ...notInCatalog];
  const LIMIT = 500;
  for (const m of showList.slice(0, LIMIT)) {
    const inCat = noradSet.has(m.norad);
    const typeColor =
      m.obj_type === "PAYLOAD" ? "var(--accent)" :
      m.obj_type === "DEBRIS"  ? "var(--dim)"    :
      m.obj_type === "ROCKET BODY" ? "var(--warn)" : "var(--text)";
    html += `
      <div class="sat-row" style="border-left:2px solid transparent;cursor:${inCat?'pointer':'default'};opacity:${inCat?'1':'0.45'}"
        ${inCat ? `onclick="selectSat(allSats.find(s=>s.norad==='${nid(m.norad)}'))"` : ''}>
        <div class="r-info">
          <div class="r-name">${esc(m.name)}</div>
          <div class="r-sub">
            <span style="color:${typeColor}">${esc(m.obj_type||'?')}</span> &middot;
            ${esc(m.launch_date||'?')}
            ${m.decay_date ? `&middot; <span style="color:var(--orange)">${lang==='pl'?'spadł':'decayed'} ${esc(m.decay_date)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }
  if (missions.length > LIMIT) html += `<div style="color:var(--dim);font-size:10px;padding:6px 12px">+ ${missions.length - LIMIT} ${lang==='pl'?'więcej':'more'}…</div>`;
  html += '</div>';
  sec.innerHTML = html;
}

