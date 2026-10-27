// ---- UI HELPERS ----
function hideLoading() {
  const el = document.getElementById("loading");
  el.classList.add("hidden");
  setTimeout(() => { el.style.display = "none"; }, 450);
}

function setSub(msg) {
  document.getElementById("load-sub").textContent = msg;
}

function setStatus(msg) {
  document.getElementById("status-msg").textContent = msg;
}

