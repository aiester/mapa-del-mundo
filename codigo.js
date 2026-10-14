"use strict";

const globeElement = document.getElementById("globeViz");
const loadingElement = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const cardContent = document.getElementById("cardContent");
const cardIndex = document.getElementById("cardIndex");
const countryCount = document.getElementById("countryCount");

const formatter = new Intl.NumberFormat("es-ES");
const countryStats = new Map();
const countryOrder = new Map();
let globe;
let selectedFeature;

function hideLoading() {
  loadingElement.classList.add("is-hidden");
}

function normalizeCountryCode(code) {
  return String(code ?? "").padStart(3, "0");
}

function formatPopulation(population) {
  return typeof population === "number" ? formatter.format(population) : "Dato no disponible";
}

function showCountry(feature) {
  const code = normalizeCountryCode(feature.id);
  const stats = countryStats.get(code);
  const name = stats?.name ?? feature.properties?.name ?? "País desconocido";
  const capital = stats?.capital || "Dato no disponible";
  const population = formatPopulation(stats?.population);
  selectedFeature = feature;
  cardIndex.textContent = String((countryOrder.get(code) ?? 0) + 1).padStart(2, "0");

  cardContent.innerHTML = `
    <div class="country-flag" aria-hidden="true"></div>
    <h2 class="country-name"></h2>
    <p class="country-native"></p>
    <div class="stat-row">
      <span class="stat-icon" aria-hidden="true">⌖</span>
      <div><span class="stat-label">CAPITAL</span><span class="stat-value capital-value"></span></div>
    </div>
    <div class="stat-row">
      <span class="stat-icon" aria-hidden="true">◉</span>
      <div><span class="stat-label">POBLACIÓN</span><span class="stat-value population-value"></span></div>
    </div>`;
  cardContent.querySelector(".country-name").textContent = name;
  cardContent.querySelector(".country-flag").textContent = stats?.flag ?? "🌐";
  cardContent.querySelector(".country-native").textContent = stats?.officialName ?? " ";
  cardContent.querySelector(".capital-value").textContent = capital;
  cardContent.querySelector(".population-value").textContent = population;

  if (globe) globe.polygonCapColor((polygon) => polygon === selectedFeature ? "#68e5ba" : "#175272");
}

async function loadWorld() {
  if (typeof window.Globe !== "function" || !window.topojson) {
    throw new Error("No se cargó la librería del globo desde unpkg.com. Comprueba si el navegador o una extensión la está bloqueando y recarga la página.");
  }

  const fetchJson = async (url, label) => {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(`No se pudo conectar con ${label}: ${error.message}`);
    }
    if (!response.ok) throw new Error(`${label} respondió con el error HTTP ${response.status}.`);
    return response.json();
  };

  const world = await fetchJson(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
    "el mapa del mundo"
  );
  const [countriesResult, populationResult] = await Promise.allSettled([
    fetchJson("https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json", "los datos de países"),
    fetchJson("https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=1000&date=2023:2024", "las cifras de población")
  ]);

  if (countriesResult.status === "fulfilled") {
    for (const country of countriesResult.value) {
      if (!country.ccn3) continue;
      countryStats.set(normalizeCountryCode(country.ccn3), {
        name: country.translations?.spa?.common ?? country.name?.common ?? "País desconocido",
        officialName: country.translations?.spa?.official ?? country.name?.official ?? "",
        capital: country.capital?.[0] ?? "Dato no disponible",
        flag: country.flag ?? "🌐"
      });
    }
  } else {
    console.warn("No se pudieron cargar los nombres y capitales de los países.", countriesResult.reason);
  }

  if (populationResult.status === "fulfilled" && Array.isArray(populationResult.value[1])) {
    const latestPopulations = new Map();
    for (const record of populationResult.value[1]) {
      if (!record.countryiso3code || record.value == null) continue;
      const current = latestPopulations.get(record.countryiso3code);
      if (!current || Number(record.date) > Number(current.date)) {
        latestPopulations.set(record.countryiso3code, record);
      }
    }
    if (countriesResult.status === "fulfilled") {
      for (const country of countriesResult.value) {
        const record = latestPopulations.get(country.cca3);
        const stats = countryStats.get(normalizeCountryCode(country.ccn3));
        if (stats && record) stats.population = record.value;
      }
    }
  } else {
    console.warn("No se pudieron cargar las cifras de población.", populationResult.status === "rejected" ? populationResult.reason : "Respuesta sin datos.");
  }

  const features = window.topojson.feature(world, world.objects.countries).features;
  features.forEach((feature, index) => countryOrder.set(normalizeCountryCode(feature.id), index));
  countryCount.textContent = `${features.length} PAÍSES`;

  globe = window.Globe()(globeElement)
    .width(globeElement.clientWidth)
    .height(globeElement.clientHeight)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#4bcfbd")
    .atmosphereAltitude(0.18)
    .globeImageUrl("https://cdn.jsdelivr.net/npm/three-globe@2.45.5/example/img/earth-night.jpg")
    .bumpImageUrl("https://cdn.jsdelivr.net/npm/three-globe@2.45.5/example/img/earth-topology.png")
    .polygonsData(features)
    .polygonCapColor((feature) => feature === selectedFeature ? "#68e5ba" : "#175272")
    .polygonSideColor(() => "rgba(20, 68, 88, 0.72)")
    .polygonStrokeColor(() => "rgba(112, 208, 193, 0.55)")
    .polygonAltitude((feature) => feature === selectedFeature ? 0.018 : 0.006)
    .polygonLabel((feature) => {
      const country = countryStats.get(normalizeCountryCode(feature.id));
      return `<span style="color:#dff8ef">${country?.name ?? feature.properties?.name ?? "País"}</span>`;
    })
    .onPolygonClick((feature) => showCountry(feature))
    .onPolygonHover((feature) => {
      globeElement.style.cursor = feature ? "pointer" : "grab";
      globe.polygonAltitude((polygon) => polygon === selectedFeature ? 0.018 : polygon === feature ? 0.014 : 0.006);
    });

  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.38;
  globe.controls().enableDamping = true;
  globe.controls().dampingFactor = 0.08;
  globe.pointOfView({ lat: 18, lng: -20, altitude: 2.2 });

  const resizeObserver = new ResizeObserver(() => {
    globe.width(globeElement.clientWidth);
    globe.height(globeElement.clientHeight);
  });
  resizeObserver.observe(globeElement);
  hideLoading();

  if (countriesResult.status === "rejected" || populationResult.status === "rejected") {
    countryCount.textContent = `${features.length} PAÍSES · DATOS PARCIALES`;
  }
}

loadWorld().catch((error) => {
  console.error(error);
  loadingText.textContent = error.message;
  loadingElement.classList.add("load-error");
  countryCount.textContent = "DATOS NO DISPONIBLES";
});
