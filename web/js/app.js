// Interface : globe, recette en 4 étapes, animation finale.
// d3 et topojson sont chargés en scripts classiques (variables globales), voir index.html.

import {
  antipode, buildCoastIndex, findSandwich, nearestPlace, repairLand,
  surfaceKm, throughEarthKm, centralAngle, verdict,
} from "./geo.js";
import { makeT } from "./i18n.js";

const { d3, topojson } = window;
const $ = (sel) => document.querySelector(sel);

// Lieux classiques : les deux premiers font des sandwichs parfaits.
const EXAMPLES = [
  { fr: "Wellington", en: "Wellington", at: [-41.29, 174.78] },
  { fr: "Hong Kong", en: "Hong Kong", at: [22.32, 114.17] },
  { fr: "Shanghai", en: "Shanghai", at: [31.23, 121.47] },
  { fr: "Paris", en: "Paris", at: [48.8566, 2.3522] },
  { fr: "Londres", en: "London", at: [51.5074, -0.1278] },
  { fr: "Montréal", en: "Montreal", at: [45.5, -73.57] },
];

const COLORS = {
  ocean: "#cfe2e8", oceanEdge: "#9fc3cf", land: "#c9d79f", landEdge: "#8ea461",
  grat: "rgba(60, 90, 100, .12)", start: "#c2702c", antipode: "#3f5f6c", target: "#7a4b9c",
};

const state = {
  lang: "fr",
  start: null,        // [lat, lon] de ta tranche
  result: null,       // sortie de findSandwich
  startPlace: null,
  targetPlace: null,
  detail: null,       // { isLand, coast, places } une fois chargé
};

let t = makeT("fr");
const fmt = {
  km: (v) => `${new Intl.NumberFormat(state.lang, { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)} km`,
  coord: ([lat, lon]) => {
    const n = (v) => new Intl.NumberFormat(state.lang, { maximumFractionDigits: 3 }).format(Math.abs(v));
    const ns = lat >= 0 ? "N" : "S";
    const ew = state.lang === "fr" ? (lon >= 0 ? "E" : "O") : (lon >= 0 ? "E" : "W");
    return `${n(lat)}° ${ns}, ${n(lon)}° ${ew}`;
  },
  place: (p) => {
    if (!p) return "";
    let country = p.country;
    try { country = new Intl.DisplayNames([state.lang], { type: "region" }).of(p.country); } catch { /* code brut */ }
    return `${p.name} (${country})`;
  },
};

// --- Langue ----------------------------------------------------------------------

function applyLang(lang) {
  state.lang = lang;
  t = makeT(lang);
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  try { localStorage.setItem("esb-lang", lang); } catch { /* stockage indisponible */ }
  renderExamples();
  refreshTexts();
}

function initialLang() {
  try {
    const saved = localStorage.getItem("esb-lang");
    if (saved === "fr" || saved === "en") return saved;
  } catch { /* stockage indisponible */ }
  return (navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
}

// --- Globe -----------------------------------------------------------------------

const canvas = $("#globe");
const ctx = canvas.getContext("2d");
const projection = d3.geoOrthographic().clipAngle(90).precision(0.3);
const path = d3.geoPath(projection, ctx);
const graticule = d3.geoGraticule10();
let landDraw = null;
let rotation = [-10, -30, 0];
let idleSpin = true;
let size = 0;

function resize() {
  const box = canvas.parentElement.getBoundingClientRect();
  size = Math.min(box.width, 560);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  projection.translate([size / 2, size / 2]).scale(size / 2 - 6);
  draw();
}

function visible([lat, lon]) {
  const center = [-rotation[0], -rotation[1]];
  return d3.geoDistance([lon, lat], center) < Math.PI / 2 - 0.01;
}

function marker([lat, lon], kind) {
  if (!visible([lat, lon])) return;
  const [x, y] = projection([lon, lat]);
  ctx.save();
  ctx.translate(x, y);
  if (kind === "antipode") {
    ctx.strokeStyle = COLORS.antipode;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(5, -5); ctx.lineTo(-5, 5); ctx.stroke();
  } else {
    // Petite tranche de pain : croûte + mie
    const crust = kind === "start" ? COLORS.start : COLORS.target;
    ctx.fillStyle = crust;
    roundRect(-11, -10, 22, 20, 7); ctx.fill();
    ctx.fillStyle = "#f6e3b8";
    roundRect(-7.5, -6.5, 15, 13, 4.5); ctx.fill();
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw() {
  if (!size) return;
  projection.rotate(rotation);
  ctx.clearRect(0, 0, size, size);

  ctx.beginPath(); path({ type: "Sphere" });
  ctx.fillStyle = COLORS.ocean; ctx.fill();

  ctx.beginPath(); path(graticule);
  ctx.strokeStyle = COLORS.grat; ctx.lineWidth = 0.7; ctx.stroke();

  if (landDraw) {
    ctx.beginPath(); path(landDraw);
    ctx.fillStyle = COLORS.land; ctx.fill();
    ctx.strokeStyle = COLORS.landEdge; ctx.lineWidth = 0.6; ctx.stroke();
  }

  if (state.result) {
    const { start, antipode: a, target } = state.result;
    // Écart entre l'antipode et la tranche d'en face
    if (state.result.gapKm > 0) {
      ctx.beginPath();
      path({ type: "LineString", coordinates: [[a[1], a[0]], [target[1], target[0]]] });
      ctx.strokeStyle = COLORS.target; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    }
    marker(a, "antipode");
    marker(target, "target");
    marker(start, "start");
  } else if (state.start) {
    marker(state.start, "start");
  }

  ctx.beginPath(); path({ type: "Sphere" });
  ctx.strokeStyle = COLORS.oceanEdge; ctx.lineWidth = 1.5; ctx.stroke();
}

function spin() {
  if (idleSpin) {
    rotation = [rotation[0] + 0.12, rotation[1], 0];
    draw();
  }
  requestAnimationFrame(spin);
}

function setupInteraction() {
  let moved = 0;
  let startRot;
  let startPos;
  d3.select(canvas)
    .call(
      d3.drag()
        .container(canvas)
        .on("start", (ev) => { idleSpin = false; moved = 0; startRot = rotation.slice(); startPos = [ev.x, ev.y]; })
        .on("drag", (ev) => {
          const dx = ev.x - startPos[0];
          const dy = ev.y - startPos[1];
          moved = Math.max(moved, Math.hypot(dx, dy));
          const k = 90 / (projection.scale());
          rotation = [startRot[0] + dx * k, Math.max(-90, Math.min(90, startRot[1] - dy * k)), 0];
          draw();
        })
        .on("end", (ev) => {
          if (moved < 4) {
            const ll = projection.invert([ev.x, ev.y]);
            if (ll && d3.geoDistance(ll, [-rotation[0], -rotation[1]]) < Math.PI / 2) setStart([ll[1], ll[0]]);
          }
        }),
    );
}

function rotateTo([lat, lon], duration = 1600) {
  idleSpin = false;
  const from = rotation.slice();
  const to = [-lon, -lat, 0];
  // chemin le plus court en longitude
  if (to[0] - from[0] > 180) to[0] -= 360;
  if (from[0] - to[0] > 180) to[0] += 360;
  const interp = d3.interpolate(from, to);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return new Promise((resolve) => {
    if (reduce) { rotation = to; draw(); resolve(); return; }
    const timer = d3.timer((elapsed) => {
      const k = d3.easeCubicInOut(Math.min(1, elapsed / duration));
      rotation = interp(k);
      draw();
      if (k >= 1) { timer.stop(); resolve(); }
    });
  });
}

// --- Étapes -----------------------------------------------------------------------

function enable(step, on) {
  $(step).setAttribute("aria-disabled", String(!on));
}

function setStart([lat, lon]) {
  state.start = [lat, lon];
  state.result = null;
  state.targetPlace = null;
  state.startPlace = state.detail ? nearestPlace(state.detail.places, lat, lon) : null;
  $("#s2-result").hidden = true;
  $("#tadam").hidden = true;
  enable("#step2", true);
  enable("#step3", false);
  enable("#step4", false);
  $("#btn-done").disabled = true;
  updateCrossButton();
  rotateTo([lat, lon], 900);
  history.replaceState(null, "", `#${lat.toFixed(4)},${lon.toFixed(4)}`);
  refreshTexts();
  draw();
}

function updateCrossButton() {
  const btn = $("#btn-cross");
  btn.disabled = !state.start || !state.detail;
  $("#s2-status").textContent = !state.start ? t("s2_need") : (!state.detail ? t("s2_loading") : "");
}

async function crossEarth() {
  if (!state.start || !state.detail) return;
  const { isLand, coast, places } = state.detail;
  const r = findSandwich(state.start[0], state.start[1], isLand, coast);
  state.result = r;
  state.startPlace = nearestPlace(places, ...r.start);
  state.targetPlace = nearestPlace(places, ...r.target);
  refreshTexts();
  drawCut();
  $("#s2-result").hidden = false;
  await rotateTo(r.target, 2200);
  enable("#step3", true);
  enable("#step4", true);
  $("#btn-done").disabled = false;
}

function refreshTexts() {
  // Étape 1
  const s1 = $("#s1-result");
  if (state.start) {
    const near = state.startPlace ? t("s1_near", { place: fmt.place(state.startPlace) }) : "";
    let text = t("s1_done", { coords: fmt.coord(state.start), near });
    const r = state.result;
    if (r && !r.startOnLand) text += t("s1_wet");
    s1.textContent = text;
  } else {
    s1.textContent = "";
  }
  updateCrossButton();

  // Étape 2
  const r = state.result;
  const facts = $("#facts");
  facts.innerHTML = "";
  if (r) {
    const add = (k, v, html) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd");
      if (html) dd.append(...html); else dd.textContent = v;
      facts.append(dt, dd);
    };
    add(t("s2_antipode"), fmt.coord(r.antipode));
    if (r.gapKm === 0) {
      add(t("s2_land"), t("s2_same"));
    } else {
      add(t("s2_land"), fmt.coord(r.target));
      add(t("s2_gap"), t("s2_gap_value", { km: fmt.km(r.gapKm) }));
    }
    add(t("s2_through"), fmt.km(throughEarthKm(...r.start, ...r.target)));
    add(t("s2_surface"), fmt.km(surfaceKm(...r.start, ...r.target)));
    if (state.targetPlace) add(t("s2_near"), t("s2_near_value", { place: fmt.place(state.targetPlace), km: fmt.km(state.targetPlace.km) }));
    const a = document.createElement("a");
    a.href = `https://www.openstreetmap.org/?mlat=${r.target[0].toFixed(5)}&mlon=${r.target[1].toFixed(5)}#map=9/${r.target[0].toFixed(4)}/${r.target[1].toFixed(4)}`;
    a.target = "_blank"; a.rel = "noopener"; a.textContent = t("s2_map");
    add("", "", [a]);
    $("#s2-note").textContent = r.gapKm === 0 ? t("s2_perfect_note") : t("s2_ocean_note");
    $("#s3-lives").textContent = state.targetPlace ? t("s3_lives", { place: fmt.place(state.targetPlace) }) : "";
    $("#cut").setAttribute("aria-label", `${t("s2_through")} : ${fmt.km(throughEarthKm(...r.start, ...r.target))}`);
    $("#verdict").textContent = t(`verdict_${verdict(r.gapKm)}`, { km: fmt.km(r.gapKm) });
  } else {
    $("#s3-lives").textContent = "";
  }
}

// Coupe de la Terre : ta tranche en haut, la ligne qui traverse, celle de ton bro en bas.
function drawCut() {
  const r = state.result;
  const svg = d3.select("#cut");
  svg.selectAll("*").remove();
  const c = 110, R = 78;
  const theta = centralAngle(...r.start, ...r.target); // π si pile en face
  const bx = c + R * Math.sin(theta);
  const by = c - R * Math.cos(theta);
  svg.append("circle").attr("cx", c).attr("cy", c).attr("r", R).attr("class", "cut-earth");
  svg.append("circle").attr("cx", c).attr("cy", c).attr("r", R * 0.55).attr("class", "cut-mantle");
  svg.append("circle").attr("cx", c).attr("cy", c).attr("r", R * 0.25).attr("class", "cut-core");
  svg.append("line").attr("x1", c).attr("y1", c - R).attr("x2", bx).attr("y2", by).attr("class", "cut-line");
  svg.append("circle").attr("cx", c).attr("cy", c).attr("r", 2.5).attr("class", "cut-center");
  const slice = (x, y, cls, angle) => svg.append("g").attr("transform", `translate(${x},${y}) rotate(${angle})`).attr("class", cls)
    .call((g) => {
      g.append("rect").attr("x", -16).attr("y", -9).attr("width", 32).attr("height", 12).attr("rx", 5).attr("class", "crust");
      g.append("rect").attr("x", -12).attr("y", -6.5).attr("width", 24).attr("height", 7).attr("rx", 3).attr("class", "crumb");
    });
  slice(c, c - R - 2, "cut-slice start", 0);
  slice(bx + 2 * Math.sin(theta), by - 2 * Math.cos(theta), "cut-slice target", (theta * 180) / Math.PI);
}

// --- Chargement des données ------------------------------------------------------

async function loadData() {
  const topo = await (await fetch("data/land.json")).json();
  landDraw = topojson.feature(topo, topo.objects.land);
  $("#globe-status").hidden = true;
  draw();

  const [detailTopo, places] = await Promise.all([
    fetch("data/land-detail.json").then((r) => r.json()),
    fetch("data/places.json").then((r) => r.json()),
  ]);
  // On laisse le navigateur respirer avant le calcul de l'index des côtes.
  await new Promise((res) => setTimeout(res, 30));
  const land = topojson.feature(detailTopo, detailTopo.objects.land).features[0];
  repairLand(land.geometry, d3.geoArea);
  const coast = buildCoastIndex(topojson.mesh(detailTopo, detailTopo.objects.land).coordinates, 5);
  state.detail = { isLand: (lat, lon) => d3.geoContains(land, [lon, lat]), coast, places };
  if (state.start) state.startPlace = nearestPlace(places, ...state.start);
  refreshTexts();
  if (pendingAuto) { pendingAuto = false; crossEarth(); }
}

// --- Démarrage --------------------------------------------------------------------

function renderExamples() {
  const box = $("#examples");
  box.innerHTML = "";
  for (const ex of EXAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = ex[state.lang];
    b.addEventListener("click", () => setStart(ex.at));
    box.append(b);
  }
}

let pendingAuto = false;

function fromHash() {
  const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!m) return;
  const lat = +m[1], lon = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  if (state.start && state.start[0] === lat && state.start[1] === lon) return;
  setStart([lat, lon]);
  if (state.detail) crossEarth(); else pendingAuto = true;
}

function init() {
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang)));
  applyLang(initialLang());

  $("#btn-here").addEventListener("click", () => {
    if (!navigator.geolocation) { $("#s1-result").textContent = t("s1_geo_error"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setStart([pos.coords.latitude, pos.coords.longitude]),
      () => { $("#s1-result").textContent = t("s1_geo_error"); },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  });

  $("#coords-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const lat = Number(f.get("lat")), lon = Number(f.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      $("#s1-result").textContent = t("s1_bad_coords");
      return;
    }
    setStart([lat, lon]);
  });

  $("#btn-cross").addEventListener("click", crossEarth);

  $("#btn-share").addEventListener("click", async () => {
    if (!state.start) return;
    const url = `${location.origin}${location.pathname}#${state.start[0].toFixed(4)},${state.start[1].toFixed(4)}`;
    try { await navigator.clipboard.writeText(url); $("#share-status").textContent = t("s3_copied"); }
    catch { $("#share-status").textContent = url; }
  });

  $("#btn-done").addEventListener("click", () => {
    const sec = $("#tadam");
    sec.hidden = false;
    sec.classList.remove("play");
    void sec.offsetWidth; // relance l'animation
    sec.classList.add("play");
    sec.scrollIntoView({ behavior: "smooth", block: "center" });
    sec.focus({ preventScroll: true });
  });

  $("#btn-again").addEventListener("click", () => {
    state.start = null; state.result = null; state.targetPlace = null; state.startPlace = null;
    $("#tadam").hidden = true;
    $("#s2-result").hidden = true;
    ["#step2", "#step3", "#step4"].forEach((s) => enable(s, false));
    $("#btn-done").disabled = true;
    history.replaceState(null, "", location.pathname);
    refreshTexts();
    idleSpin = true;
    draw();
    $("#step1").scrollIntoView({ behavior: "smooth" });
  });

  setupInteraction();
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(spin);
  fromHash();
  window.addEventListener("hashchange", fromHash);
  loadData().catch((err) => { console.error(err); $("#globe-status").textContent = "⚠️ " + err.message; });
}

init();

// Exposé pour le débogage dans la console.
window.earthSandwich = { state, antipode };
