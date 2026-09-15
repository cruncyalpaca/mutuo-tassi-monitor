/* ---------- Utilità di formattazione ---------- */

const fmtPct = (v) => `${v.toFixed(3).replace(".", ",")} %`;
const fmtEur = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
};

/* ---------- Caricamento dati di indice ---------- */

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Impossibile caricare ${path}`);
  return res.json();
}

let euriborHistory = [];
let irsHistory = [];

async function loadIndexData() {
  try {
    [euriborHistory, irsHistory] = await Promise.all([
      loadJSON("data/euribor_6m.json"),
      loadJSON("data/irs_3y.json"),
    ]);
  } catch (err) {
    console.error(err);
    document.getElementById("last-update").textContent =
      "Dati non ancora disponibili: attendi la prima esecuzione automatica.";
    return;
  }

  renderStatTiles();
  renderHistoryChart();
  updateLastUpdateLine();
}

function latestPoint(history) {
  return history.length ? history[history.length - 1] : null;
}

function updateLastUpdateLine() {
  const dates = [latestPoint(euriborHistory), latestPoint(irsHistory)]
    .filter(Boolean)
    .map((p) => p.date)
    .sort();
  const el = document.getElementById("last-update");
  if (dates.length) {
    el.textContent = `Ultimo aggiornamento dati: ${fmtDate(dates[dates.length - 1])}`;
  } else {
    el.textContent = "Nessun dato disponibile ancora.";
  }
}

function renderStatTiles() {
  const e = latestPoint(euriborHistory);
  const i = latestPoint(irsHistory);

  if (e) {
    document.getElementById("euribor-value").textContent = fmtPct(e.value);
    document.getElementById("euribor-meta").textContent = fmtDate(e.date);
  }
  if (i) {
    document.getElementById("irs-value").textContent = fmtPct(i.value);
    document.getElementById("irs-meta").textContent = fmtDate(i.date);
  }
}

/* ---------- Grafico storico ---------- */

let historyChart = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderHistoryChart() {
  const ctx = document.getElementById("history-chart");
  const seriesColor1 = cssVar("--series-1");
  const seriesColor2 = cssVar("--series-2");
  const gridColor = cssVar("--gridline");
  const textColor = cssVar("--text-secondary");

  const legend = document.getElementById("history-legend");
  legend.innerHTML = `
    <span><span class="dot" style="background:${seriesColor1}"></span>Euribor 6 mesi</span>
    <span><span class="dot" style="background:${seriesColor2}"></span>IRS 3 anni</span>
  `;

  if (historyChart) historyChart.destroy();

  // Scala "category" invece di una scala temporale: evita di dipendere da un
  // adapter di date esterno, e va benissimo per un semplice andamento storico.
  const allDates = Array.from(
    new Set([...euriborHistory.map((p) => p.date), ...irsHistory.map((p) => p.date)])
  ).sort();

  const euriborByDate = new Map(euriborHistory.map((p) => [p.date, p.value]));
  const irsByDate = new Map(irsHistory.map((p) => [p.date, p.value]));

  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: allDates.map((d) => fmtDate(d)),
      datasets: [
        {
          label: "Euribor 6 mesi",
          data: allDates.map((d) => (euriborByDate.has(d) ? euriborByDate.get(d) : null)),
          borderColor: seriesColor1,
          backgroundColor: seriesColor1,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
          spanGaps: true,
        },
        {
          label: "IRS 3 anni",
          data: allDates.map((d) => (irsByDate.has(d) ? irsByDate.get(d) : null)),
          borderColor: seriesColor2,
          backgroundColor: seriesColor2,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.formattedValue} %`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, maxTicksLimit: 8, autoSkip: true },
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, callback: (v) => `${v}%` },
        },
      },
    },
  });
}

/* ---------- Ammortamento alla francese ---------- */

function monthlyRateFromAnnual(annualPercent) {
  return annualPercent / 100 / 12;
}

function monthsBetween(dateFromISO, dateToISO) {
  const from = new Date(dateFromISO + "T00:00:00");
  const to = new Date(dateToISO + "T00:00:00");
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

function paymentFromBalance(balance, iMonthly, nMonths) {
  if (nMonths <= 0) return balance;
  if (iMonthly === 0) return balance / nMonths;
  return (balance * iMonthly) / (1 - Math.pow(1 + iMonthly, -nMonths));
}

function projectBalance(balance, iMonthly, payment, nMonths) {
  if (nMonths <= 0) return balance;
  if (iMonthly === 0) return balance - payment * nMonths;
  const growth = Math.pow(1 + iMonthly, nMonths);
  return balance * growth - payment * ((growth - 1) / iMonthly);
}

function ceilToTenCents(value) {
  return Math.ceil(value * 10) / 10;
}

function rateWithFloorAndSpread(indexValue, spread) {
  const rounded = ceilToTenCents(indexValue);
  return Math.max(spread, rounded + spread);
}

/* ---------- Calcolatore personale (localStorage) ---------- */

const STORAGE_KEY = "mutuo-tassi-monitor:parametri";

const DEFAULTS = {
  importo: 120000,
  dataApertura: "2024-06-12",
  durata: 30,
  residuo: 116108.69,
  dataResiduo: "2026-09-15",
  tassoAttuale: 4.85,
  dataFineFisso: "2027-06-12",
  spread: 1.8,
};

function loadParams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    console.warn("localStorage non disponibile, uso i valori di esempio.", err);
  }
  return { ...DEFAULTS };
}

function saveParams(params) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch (err) {
    console.warn("Impossibile salvare i parametri in localStorage.", err);
  }
}

function fillForm(params) {
  document.getElementById("f-importo").value = params.importo;
  document.getElementById("f-data-apertura").value = params.dataApertura;
  document.getElementById("f-durata").value = params.durata;
  document.getElementById("f-residuo").value = params.residuo;
  document.getElementById("f-data-residuo").value = params.dataResiduo;
  document.getElementById("f-tasso-attuale").value = params.tassoAttuale;
  document.getElementById("f-data-fine-fisso").value = params.dataFineFisso;
  document.getElementById("f-spread").value = params.spread;
}

function readForm() {
  return {
    importo: parseFloat(document.getElementById("f-importo").value),
    dataApertura: document.getElementById("f-data-apertura").value,
    durata: parseInt(document.getElementById("f-durata").value, 10),
    residuo: parseFloat(document.getElementById("f-residuo").value),
    dataResiduo: document.getElementById("f-data-residuo").value,
    tassoAttuale: parseFloat(document.getElementById("f-tasso-attuale").value),
    dataFineFisso: document.getElementById("f-data-fine-fisso").value,
    spread: parseFloat(document.getElementById("f-spread").value),
  };
}

let scenarioChart = null;

function runCalculation(params) {
  const nMonthsTotal = params.durata * 12;
  const elapsedMonths = monthsBetween(params.dataApertura, params.dataResiduo);
  const remainingAtResiduo = nMonthsTotal - elapsedMonths;

  if (remainingAtResiduo <= 0) {
    alert("La data del capitale residuo è oltre la fine prevista del mutuo: controlla i dati inseriti.");
    return;
  }

  const iAttuale = monthlyRateFromAnnual(params.tassoAttuale);
  const rataAttuale = paymentFromBalance(params.residuo, iAttuale, remainingAtResiduo);

  const monthsToFixedEnd = monthsBetween(params.dataResiduo, params.dataFineFisso);
  const balanceAtFixedEnd = projectBalance(params.residuo, iAttuale, rataAttuale, monthsToFixedEnd);
  const remainingAtFixedEnd = remainingAtResiduo - monthsToFixedEnd;

  const irsLatest = latestPoint(irsHistory);
  const euriborLatest = latestPoint(euriborHistory);

  document.getElementById("res-rata-attuale").textContent = fmtEur(rataAttuale);
  document.getElementById("res-capitale-proiettato").textContent = fmtEur(Math.max(balanceAtFixedEnd, 0));

  const oggi = new Date();
  const fineFisso = new Date(params.dataFineFisso + "T00:00:00");
  const giorniRestanti = Math.round((fineFisso - oggi) / (1000 * 60 * 60 * 24));
  document.getElementById("res-countdown").textContent =
    giorniRestanti > 0
      ? `al ${fmtDate(params.dataFineFisso)} · ${giorniRestanti} giorni`
      : `periodo fisso terminato il ${fmtDate(params.dataFineFisso)}`;

  let tassoFisso = null;
  let tassoVariabile = null;
  let rataFissa = null;
  let rataVariabile = null;

  if (irsLatest && remainingAtFixedEnd > 0) {
    tassoFisso = rateWithFloorAndSpread(irsLatest.value, params.spread);
    rataFissa = paymentFromBalance(Math.max(balanceAtFixedEnd, 0), monthlyRateFromAnnual(tassoFisso), remainingAtFixedEnd);
    document.getElementById("fisso-formula").textContent =
      `IRS 3A ${fmtPct(irsLatest.value)} (${fmtDate(irsLatest.date)}) arrotondato + spread ${params.spread.toFixed(2)}%`;
    document.getElementById("fisso-tasso").textContent = fmtPct(tassoFisso);
    document.getElementById("fisso-rata").textContent = `${fmtEur(rataFissa)} / mese`;
  }

  if (euriborLatest && remainingAtFixedEnd > 0) {
    tassoVariabile = rateWithFloorAndSpread(euriborLatest.value, params.spread);
    rataVariabile = paymentFromBalance(Math.max(balanceAtFixedEnd, 0), monthlyRateFromAnnual(tassoVariabile), remainingAtFixedEnd);
    document.getElementById("variabile-formula").textContent =
      `Euribor 6M ${fmtPct(euriborLatest.value)} (${fmtDate(euriborLatest.date)}) arrotondato + spread ${params.spread.toFixed(2)}%`;
    document.getElementById("variabile-tasso").textContent = fmtPct(tassoVariabile);
    document.getElementById("variabile-rata").textContent = `${fmtEur(rataVariabile)} / mese`;
  }

  // Il contenitore va reso visibile PRIMA di creare il grafico: Chart.js
  // misura le dimensioni del canvas al momento della creazione e non le
  // ricalcola correttamente se all'inizio è dentro un elemento "hidden".
  document.getElementById("result-block").hidden = false;
  renderScenarioChart(rataAttuale, rataFissa, rataVariabile);
}

function renderScenarioChart(rataAttuale, rataFissa, rataVariabile) {
  const ctx = document.getElementById("scenario-chart");
  const neutral = cssVar("--series-neutral");
  const c1 = cssVar("--series-2"); // fisso
  const c2 = cssVar("--series-1"); // variabile
  const textColor = cssVar("--text-secondary");
  const gridColor = cssVar("--gridline");

  const labels = ["Rata attuale"];
  const data = [rataAttuale];
  const colors = [neutral];

  if (rataFissa !== null) {
    labels.push("Scenario fisso");
    data.push(rataFissa);
    colors.push(c1);
  }
  if (rataVariabile !== null) {
    labels.push("Scenario variabile");
    data.push(rataVariabile);
    colors.push(c2);
  }

  if (scenarioChart) scenarioChart.destroy();

  scenarioChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderRadius: 4,
          barThickness: 40,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (item) => fmtEur(item.parsed.x) },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, callback: (v) => fmtEur(v) },
        },
        y: {
          grid: { display: false },
          ticks: { color: textColor },
        },
      },
    },
  });
}

function initCalculator() {
  const params = loadParams();
  fillForm(params);

  document.getElementById("mutuo-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const values = readForm();
    saveParams(values);
    runCalculation(values);
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    fillForm(DEFAULTS);
    saveParams(DEFAULTS);
    runCalculation(DEFAULTS);
  });

  // Primo calcolo automatico con i valori salvati/di esempio.
  runCalculation(params);
}

/* ---------- Avvio ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  await loadIndexData();
  initCalculator();
});
