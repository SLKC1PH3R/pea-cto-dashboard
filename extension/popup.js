const content = document.getElementById("content");

function eur(n) {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

function signPct(n) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(2)} %`;
}

function signEur(n) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${eur(Math.abs(n))}`;
}

function renderTemplate(id) {
  const tpl = document.getElementById(id);
  content.innerHTML = "";
  content.appendChild(tpl.content.cloneNode(true));
}

function renderData(snapshot) {
  renderTemplate("tpl-data");

  content.querySelector('[data-field="portfolioValue"]').textContent = eur(snapshot.portfolioValue);

  const changeEl = content.querySelector('[data-field="dailyChangeLine"]');
  changeEl.textContent = `${signEur(snapshot.dailyChange)} (${signPct(snapshot.dailyPercent)})`;
  changeEl.classList.add(snapshot.dailyChange >= 0 ? "pos" : "neg");

  const gainerBlock = content.querySelector('[data-field="gainerBlock"]');
  if (snapshot.topGainer) {
    content.querySelector('[data-field="topGainer"]').innerHTML = `<span>${snapshot.topGainer.ticker}</span><span class="pos">${signPct(snapshot.topGainer.pct)}</span>`;
  } else {
    gainerBlock.remove();
  }

  const loserBlock = content.querySelector('[data-field="loserBlock"]');
  if (snapshot.topLoser) {
    content.querySelector('[data-field="topLoser"]').innerHTML = `<span>${snapshot.topLoser.ticker}</span><span class="neg">${signPct(snapshot.topLoser.pct)}</span>`;
  } else {
    loserBlock.remove();
  }

  if (snapshot.fetchedAt) {
    const mins = Math.round((Date.now() - snapshot.fetchedAt) / 60000);
    content.querySelector('[data-field="updatedAt"]').textContent =
      mins <= 0 ? "Mis à jour à l'instant" : `Mis à jour il y a ${mins} min`;
  }
}

function renderError(snapshot) {
  if (snapshot.error === "no-token") renderTemplate("tpl-no-token");
  else if (snapshot.error === "invalid-token") renderTemplate("tpl-invalid-token");
  else renderTemplate("tpl-network-error");

  const configureBtn = document.getElementById("configure-btn");
  if (configureBtn) configureBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

async function load() {
  const cached = await folioGetCachedSnapshot();
  if (cached && !cached.error) renderData(cached);

  const fresh = await folioFetchSnapshot();
  if (fresh.error) {
    if (!cached || cached.error) renderError(fresh);
    return;
  }
  renderData(fresh);
}

load();
