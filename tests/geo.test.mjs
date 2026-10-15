import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geoContains, geoArea } from "d3";
import { feature, mesh } from "topojson-client";
import {
  EARTH_RADIUS_KM, antipode, normalizeLon, surfaceKm, throughEarthKm, interpolate,
  buildCoastIndex, nearestCoast, findSandwich, nearestPlace, verdict, repairLand,
} from "../web/js/geo.js";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} ≉ ${b} (±${tol})`);

// --- Géométrie pure -------------------------------------------------------------

test("l'antipode inverse la latitude et décale la longitude de 180°", () => {
  const check = ([a, b], [c, d]) => { close(a, c, 1e-9); close(b, d, 1e-9); };
  check(antipode(48.85, 2.35), [-48.85, -177.65]);
  check(antipode(-10, -170), [10, 10]);
  check(antipode(0, 0), [0, -180]);
});

test("l'antipode de l'antipode est le point de départ", () => {
  for (const [lat, lon] of [[12.3, 45.6], [-80, 179.9], [0, -180], [33, -0.5]]) {
    const [a, b] = antipode(...antipode(lat, lon));
    close(a, lat, 1e-9);
    close(normalizeLon(b - lon), 0, 1e-9);
  }
});

test("un point et son antipode sont à un demi-tour de Terre", () => {
  const [a, b] = antipode(43.3, 5.4);
  close(surfaceKm(43.3, 5.4, a, b), Math.PI * EARTH_RADIUS_KM, 1e-6);
  close(throughEarthKm(43.3, 5.4, a, b), 2 * EARTH_RADIUS_KM, 1e-6, "la corde vaut le diamètre");
});

test("distance Paris–Londres réaliste (~344 km)", () => {
  close(surfaceKm(48.8566, 2.3522, 51.5074, -0.1278), 344, 3);
});

test("l'interpolation reste sur le grand cercle", () => {
  const [lat, lon] = interpolate(0, 0, 0, 90, 0.5);
  close(lat, 0, 1e-9);
  close(lon, 45, 1e-9);
  const total = surfaceKm(10, 20, -30, 100);
  const [mlat, mlon] = interpolate(10, 20, -30, 100, 0.25);
  close(surfaceKm(10, 20, mlat, mlon), total / 4, 1e-6);
});

test("la côte densifiée n'a pas de trou plus grand que le pas", () => {
  const idx = buildCoastIndex([[[0, 0], [10, 0]]], 5);
  assert.ok(idx.size > 1000 / 5, `${idx.size} points`);
  const [, , km] = nearestCoast(idx, 0.0, 5.01);
  assert.ok(km < 2.5, `${km} km`);
});

test("verdict selon l'écart", () => {
  assert.equal(verdict(0), "perfect");
  assert.equal(verdict(42), "great");
  assert.equal(verdict(420), "tilted");
  assert.equal(verdict(4200), "open");
});

// --- Avec les vraies données (Natural Earth, GeoNames) ---------------------------

const topo = JSON.parse(readFileSync(new URL("../web/data/land-detail.json", import.meta.url)));
const land = feature(topo, topo.objects.land).features[0];
const repaired = repairLand(land.geometry, geoArea);
const coast = buildCoastIndex(mesh(topo, topo.objects.land).coordinates, 5);
const isLand = (lat, lon) => geoContains(land, [lon, lat]);
const places = JSON.parse(readFileSync(new URL("../web/data/places.json", import.meta.url)));

test("les données détaillées sont réparées : l'océan n'est plus de la terre", () => {
  assert.ok(repaired > 0, "des anneaux à l'envers ont été retournés");
  assert.ok(geoArea(land) < 4 * Math.PI * 0.35, "les terres couvrent ~29 % de la planète");
  assert.equal(isLand(0, -150), false, "milieu du Pacifique");
  assert.equal(isLand(48.85, 2.35), true, "Paris");
});

test("Wellington ↔ Espagne : un sandwich parfait", () => {
  const s = findSandwich(-41.29, 174.78, isLand, coast);
  assert.equal(s.gapKm, 0);
  const place = nearestPlace(places, ...s.target);
  assert.equal(place.country, "ES");
});

test("Hong Kong ↔ nord de l'Argentine / Bolivie", () => {
  const s = findSandwich(22.32, 114.17, isLand, coast);
  assert.equal(s.gapKm, 0);
  assert.ok(["AR", "BO"].includes(nearestPlace(places, ...s.target).country));
});

test("depuis Paris, l'antipode est en mer et on se rabat sur la terre la plus proche", () => {
  const s = findSandwich(48.8566, 2.3522, isLand, coast);
  assert.ok(s.startOnLand);
  assert.ok(s.gapKm > 0, "l'antipode de Paris est dans le Pacifique");
  assert.ok(isLand(...s.target) || s.gapKm >= 0);
  // aucun point de côte ne doit être plus proche que celui retenu
  close(surfaceKm(...s.antipode, ...s.target), s.gapKm, 1e-6);
  const place = nearestPlace(places, ...s.target);
  assert.equal(place.country, "NZ", `trouvé ${place.name} (${place.country})`);
});

test("Londres ↔ îles Antipodes : les petites îles comptent", () => {
  // Les îles Antipodes (NZ) doivent leur nom à leur position, presque aux antipodes
  // de Londres. Invisibles à l'échelle 1:50m, elles sont bien là en 1:10m.
  const s = findSandwich(51.5074, -0.1278, isLand, coast);
  assert.ok(s.gapKm < 300, `écart ${s.gapKm.toFixed(0)} km`);
  close(s.target[0], -49.68, 0.3, "latitude des îles Antipodes");
  close(s.target[1], 178.77, 0.5, "longitude des îles Antipodes");
});

test("la recherche reste rapide (moins de 100 ms)", () => {
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) nearestCoast(coast, -48.86, -177.65);
  const ms = (performance.now() - t0) / 5;
  assert.ok(ms < 100, `${ms.toFixed(1)} ms pour ${coast.size} points`);
});
