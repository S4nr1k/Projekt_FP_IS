// ---- FAVORITES ----
function loadFavorites() {
  try {
    const raw = localStorage.getItem("orbitwatch_favorites");
    if (raw) favorites = new Set(JSON.parse(raw));
  } catch {}
}
function saveFavorites() {
  try {
    localStorage.setItem("orbitwatch_favorites", JSON.stringify([...favorites]));
  } catch {}
}
function toggleFavorite(norad) {
  if (favorites.has(norad)) favorites.delete(norad);
  else favorites.add(norad);
  saveFavorites();
  renderFavorites();
  if (selected && selected.norad === norad) renderPanel(selected);  // odśwież gwiazdkę
}
function renderFavorites() {
  const cont = document.getElementById("favorites-list");
  if (!cont) return;
  const favs = allSats.filter(s => favorites.has(s.norad));
  if (favs.length === 0) {
    cont.innerHTML = `<div style="color:var(--dim2);font-size:10px;padding:8px 12px;font-style:italic">
      ${lang==='pl' ? 'brak - klik gwiazdki w panelu' : 'none - click star in panel'}
    </div>`;
    return;
  }
  cont.innerHTML = favs.map(s => `
    <div class="sat-row ${selected===s?'active':''}" onclick="selectSat(allSats.find(x=>x.norad==='${nid(s.norad)}'))">
      <span class="r-dot" style="background:${s.color}"></span>
      <div class="r-info">
        <div class="r-name">${esc(s.name)}</div>
        <div class="r-sub">${isFinite(s.alt)?Math.round(s.alt):'---'} km &middot; ${esc(s.cat)}</div>
      </div>
    </div>
  `).join("");
}

