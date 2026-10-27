// ---- FILTER / SEARCH ----
function updateCounts() {
  const cats = ["all","starlink","iss","weather","gps","science","other"];
  cats.forEach(c => {
    const n = c === "all" ? allSats.length : allSats.filter(s => s.cat === c).length;
    const el = document.getElementById("c-" + c);
    if (el) el.textContent = n;
  });
}

// Range filters: min/max for altitude and velocity
var altMin = 0, altMax = 42000;
var velMin = 0, velMax = 12;

function applyFilter() {
  const q = searchQ.toLowerCase();
  const newFiltered = allSats.filter(s => {
    const catOk    = activeCat === "all" || s.cat === activeCat;
    const nameOk   = !q || s.name.toLowerCase().includes(q) || s.norad.includes(q);
    // Przycisk debris: gdy wyłączony, ukrywa wszystkie szczątki/człony rakiet/
    // obiekty nieznane (flaga isDebris ustawiona w buildSats). Wyszukiwanie pomija filtr.
    // to robi: ukrywa szczatki, chyba ze wlaczono przycisk albo uzytkownik faktycznie czegos szuka
    const debrisOk = showDebris || !s.isDebris || (q && nameOk);
    const alt = isFinite(s.alt) ? s.alt : 0;
    const altOk = alt >= altMin && alt <= altMax;
    const v = Math.hypot(s.vx || 0, s.vy || 0, s.vz || 0);
    const velOk = v >= velMin && v <= velMax;
    return catOk && nameOk && debrisOk && altOk && velOk;
  });
  filtered = newFiltered;
  renderList();
}

// Virtual scroll - renders only visible rows, supports unlimited list size
var VROW_H = 42;  // px per row
var _vlastScroll = 0;

function renderList() {
  const list = document.getElementById("sat-list");

  if (filtered.length === 0) {
    list.innerHTML = "<div style='padding:12px 14px;font-size:0.6rem;color:var(--dim);font-family:var(--mono)'>Brak wynikow</div>";
    return;
  }

  const totalH = filtered.length * VROW_H;

  // Build scaffold once or on data change
  if (!list._vInit || list._vTotal !== filtered.length) {
    list.innerHTML = `
      <div class="vlist-sizer" id="vlist-sizer" style="height:${totalH}px">
        <div class="vlist-viewport" id="vlist-vp"></div>
      </div>`;
    list._vInit  = true;
    list._vTotal = filtered.length;
    list.scrollTop = 0;
  } else {
    document.getElementById("vlist-sizer").style.height = totalH + "px";
  }

  _renderVisibleRows(list);

  list.onscroll = () => _renderVisibleRows(list);
}

function _renderVisibleRows(list) {
  const vp     = document.getElementById("vlist-vp");
  if (!vp) return;
  const scroll  = list.scrollTop;
  const visible = list.clientHeight || 400;
  const start   = Math.max(0, Math.floor(scroll / VROW_H) - 3);
  const end     = Math.min(filtered.length, Math.ceil((scroll + visible) / VROW_H) + 3);

  vp.style.transform = `translateY(${start * VROW_H}px)`;
  vp.innerHTML = "";

  for (let i = start; i < end; i++) {
    const sat = filtered[i];
    const row = document.createElement("div");
    row.className = "sat-row" + (sat === selected ? " sel" : "");
    row.style.height = VROW_H + "px";
    row.innerHTML = `
      <span class="r-dot" style="background:${sat.color}"></span>
      <div class="r-info">
        <div class="r-name">${esc(sat.name)}</div>
        <div class="r-sub">${isFinite(sat.alt) ? Math.round(sat.alt) : "---"} km &bull; ${esc(sat.cat)}</div>
      </div>`;
    row.addEventListener("click", () => {
      const now = Date.now();
      const norad = sat.norad;
      if (window._lastClickNorad === norad && now - window._lastClickTime < 400) {
        // Second click within 400ms = dblclick -> chase cam
        window._lastClickNorad = null;
        selectSat(sat);
        enterChaseCam(sat);
      } else {
        window._lastClickNorad = norad;
        window._lastClickTime  = now;
        selectSat(sat);
      }
    });
    row.dataset.idx   = i;
    row.dataset.norad = sat.norad;
    vp.appendChild(row);
  }
}

function scrollListToSelected() {
  const idx = filtered.indexOf(selected);
  if (idx < 0) return;
  const list = document.getElementById("sat-list");
  if (!list) return;
  list.scrollTop = Math.max(0, idx * VROW_H - 80);
}

function bindUI() {
  // One-time dblclick on satellite list - uses event delegation, survives virtual scroll resets
  const satList = document.getElementById("sat-list");
  satList.addEventListener("dblclick", e => {
    const row = e.target.closest(".sat-row");
    if (!row) return;
    const norad = row.dataset.norad;
    const idx   = parseInt(row.dataset.idx);
    const sat   = (norad && allSats.find(s => s.norad === norad))
               || (!isNaN(idx) && filtered[idx])
               || null;
    if (sat) { selectSat(sat); enterChaseCam(sat); }
  });

  document.getElementById("filters").addEventListener("click", e => {
    const btn = e.target.closest(".filt-btn");
    if (!btn) return;
    document.querySelectorAll(".filt-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeCat = btn.dataset.cat;
    applyFilter();
    saveSettingsDebounced();
  });

  document.getElementById("search").addEventListener("input", e => {
    searchQ = e.target.value;
    // Debounce: with 31k objects, filter is expensive - wait 150ms after typing stops
    clearTimeout(window._searchTimer);
    window._searchTimer = setTimeout(applyFilter, 150);
  });

  // Range sliders: altitude & velocity
  const altMinEl = document.getElementById("alt-min");
  const altMaxEl = document.getElementById("alt-max");
  const velMinEl = document.getElementById("vel-min");
  const velMaxEl = document.getElementById("vel-max");
  const altLabel = document.getElementById("alt-range-label");
  const velLabel = document.getElementById("vel-range-label");

  // Set initial slider values from loaded settings
  altMinEl.value = altMin;
  altMaxEl.value = altMax;
  velMinEl.value = velMin;
  velMaxEl.value = velMax;
  altLabel.textContent = `${altMin} – ${altMax} km`;
  velLabel.textContent = `${velMin.toFixed(1)} – ${velMax.toFixed(1)} km/s`;

  function updateRangeFilters() {
    let amin = parseFloat(altMinEl.value), amax = parseFloat(altMaxEl.value);
    if (amin > amax) [amin, amax] = [amax, amin];
    altMin = amin; altMax = amax;
    altLabel.textContent = `${amin} – ${amax} km`;

    let vmin = parseFloat(velMinEl.value), vmax = parseFloat(velMaxEl.value);
    if (vmin > vmax) [vmin, vmax] = [vmax, vmin];
    velMin = vmin; velMax = vmax;
    velLabel.textContent = `${vmin.toFixed(1)} – ${vmax.toFixed(1)} km/s`;

    clearTimeout(window._rangeTimer);
    window._rangeTimer = setTimeout(applyFilter, 100);
    saveSettingsDebounced();
  }
  [altMinEl, altMaxEl, velMinEl, velMaxEl].forEach(el => {
    el.addEventListener("input", updateRangeFilters);
  });

  // Restore active category from settings
  document.querySelectorAll(".filt-btn").forEach(b => b.classList.remove("active"));
  const restoredCatBtn = document.querySelector(`.filt-btn[data-cat="${activeCat}"]`);
  if (restoredCatBtn) restoredCatBtn.classList.add("active");

  // Restore debris button color
  const dbtBtn = document.getElementById("debris-toggle");
  if (dbtBtn) dbtBtn.style.color = showDebris ? "var(--accent)" : "var(--dim)";
}

