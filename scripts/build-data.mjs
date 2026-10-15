// Prépare les données servies par le site (à relancer seulement si on change de source).
//
//   web/data/land.json         contours des terres émergées pour dessiner le globe (Natural Earth 1:50m)
//   web/data/land-detail.json  contours détaillés pour le calcul (Natural Earth 1:10m) : à cette
//                              échelle on garde les petites îles, et ce sont souvent elles qu'on
//                              touche en arrivant de l'autre côté de la Terre (ex. îles Antipodes)
//   web/data/places.json  lieux habités pour nommer l'endroit trouvé (GeoNames, via all-the-cities)
//
// Pour garder un fichier léger, on ne garde que le lieu le plus peuplé de chaque
// case de 0,5° × 0,5° : ~21 000 lieux, assez pour toujours avoir un repère proche.

import { copyFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "web", "data");
mkdirSync(out, { recursive: true });

copyFileSync(require.resolve("world-atlas/land-50m.json"), join(out, "land.json"));
copyFileSync(require.resolve("world-atlas/land-10m.json"), join(out, "land-detail.json"));

const CELL = 0.5;
const cities = require("all-the-cities");
const best = new Map();
for (const c of cities) {
  const [lon, lat] = c.loc.coordinates;
  const key = `${Math.floor(lat / CELL)},${Math.floor(lon / CELL)}`;
  const prev = best.get(key);
  if (!prev || c.population > prev.population) best.set(key, c);
}

// Format compact : [lat, lon, nom, code pays ISO-2, population]
const places = [...best.values()]
  .sort((a, b) => b.population - a.population)
  .map((c) => [
    +c.loc.coordinates[1].toFixed(3),
    +c.loc.coordinates[0].toFixed(3),
    c.name,
    c.country,
    c.population,
  ]);

writeFileSync(join(out, "places.json"), JSON.stringify(places));
console.log(`land.json copié, ${places.length} lieux écrits dans places.json`);
