// Géométrie du sandwich terrestre. Fonctions pures, sans dépendance, testées dans tests/.
//
// La Terre est traitée comme une sphère de rayon moyen 6 371 km : l'erreur sur les
// distances reste sous 0,5 %, bien en dessous de l'épaisseur d'une tranche de pain
// à l'échelle de la planète.

export const EARTH_RADIUS_KM = 6371.0088;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Ramène une longitude dans [-180, 180). */
export function normalizeLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Antipode : le point atteint en traversant la Terre par son centre.
 * Exact aussi sur l'ellipsoïde, car la Terre est symétrique par rapport à son centre.
 */
export function antipode(lat, lon) {
  return [-lat, normalizeLon(lon + 180)];
}

/** Angle au centre (radians) entre deux points, formule de haversine. */
export function centralAngle(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dp = p2 - p1;
  const dl = (lon2 - lon1) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance à la surface (le long d'un grand cercle), en km. */
export function surfaceKm(lat1, lon1, lat2, lon2) {
  return EARTH_RADIUS_KM * centralAngle(lat1, lon1, lat2, lon2);
}

/** Distance en ligne droite à travers la Terre (la corde), en km. */
export function throughEarthKm(lat1, lon1, lat2, lon2) {
  return 2 * EARTH_RADIUS_KM * Math.sin(centralAngle(lat1, lon1, lat2, lon2) / 2);
}

/** Point situé à la fraction t du grand cercle entre deux points. */
export function interpolate(lat1, lon1, lat2, lon2, t) {
  const d = centralAngle(lat1, lon1, lat2, lon2);
  if (d === 0) return [lat1, lon1];
  const a = Math.sin((1 - t) * d) / Math.sin(d);
  const b = Math.sin(t * d) / Math.sin(d);
  const p1 = lat1 * RAD, l1 = lon1 * RAD, p2 = lat2 * RAD, l2 = lon2 * RAD;
  const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
  const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
  const z = a * Math.sin(p1) + b * Math.sin(p2);
  return [Math.atan2(z, Math.hypot(x, y)) * DEG, Math.atan2(y, x) * DEG];
}

/**
 * Transforme des lignes de côte ([[lon, lat], ...] façon GeoJSON) en un nuage de
 * points serrés : aucun écart entre deux points ne dépasse `stepKm`.
 * L'index renvoyé permet ensuite une recherche du point le plus proche très rapide.
 */
export function buildCoastIndex(lines, stepKm = 5) {
  const lats = [];
  const lons = [];
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const [lon, lat] = line[i];
      if (i > 0) {
        const [plon, plat] = line[i - 1];
        const n = Math.ceil(surfaceKm(plat, plon, lat, lon) / stepKm);
        for (let k = 1; k < n; k++) {
          const [ilat, ilon] = interpolate(plat, plon, lat, lon, k / n);
          lats.push(ilat);
          lons.push(ilon);
        }
      }
      lats.push(lat);
      lons.push(lon);
    }
  }
  const lat = Float64Array.from(lats, (v) => v * RAD);
  const lon = Float64Array.from(lons, (v) => v * RAD);
  const cosLat = lat.map(Math.cos);
  return { lat, lon, cosLat, size: lat.length, stepKm };
}

/** Point de côte le plus proche d'une position : [lat, lon, distance en km]. */
export function nearestCoast(index, lat, lon) {
  const p = lat * RAD;
  const l = lon * RAD;
  const cp = Math.cos(p);
  let best = Infinity;
  let bi = -1;
  for (let i = 0; i < index.size; i++) {
    // On compare h (monotone avec la distance) pour éviter un asin par point.
    const h = Math.sin((index.lat[i] - p) / 2) ** 2
      + cp * index.cosLat[i] * Math.sin((index.lon[i] - l) / 2) ** 2;
    if (h < best) { best = h; bi = i; }
  }
  const km = EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(best)));
  return [index.lat[bi] * DEG, index.lon[bi] * DEG, km];
}

/**
 * Le cœur de la recette : depuis le point où tu poses ta tranche, trouve où ton
 * sandwich bro doit poser la sienne.
 *  - `isLand(lat, lon)` dit si un point est sur la terre ferme ;
 *  - si l'antipode est en mer, on prend le point de terre le plus proche.
 */
export function findSandwich(lat, lon, isLand, coastIndex) {
  const [alat, alon] = antipode(lat, lon);
  const startOnLand = isLand(lat, lon);
  if (isLand(alat, alon)) {
    return { start: [lat, lon], startOnLand, antipode: [alat, alon], target: [alat, alon], gapKm: 0 };
  }
  const [tlat, tlon, gapKm] = nearestCoast(coastIndex, alat, alon);
  return { start: [lat, lon], startOnLand, antipode: [alat, alon], target: [tlat, tlon], gapKm };
}

/**
 * Quelques minuscules polygones des données 1:10m sont « à l'envers » : leur aire
 * calculée couvre toute la planète, ce qui ferait croire que l'océan est de la terre.
 * On retourne ces anneaux. `geoArea` est la fonction d3.geoArea (injectée pour garder
 * ce module sans dépendance).
 */
export function repairLand(geometry, geoArea) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let fixed = 0;
  for (const poly of polys) {
    if (geoArea({ type: "Polygon", coordinates: poly }) > 2 * Math.PI) {
      poly.forEach((ring) => ring.reverse());
      fixed++;
    }
  }
  return fixed;
}

/** Lieu habité le plus proche parmi [lat, lon, nom, pays, population]. */
export function nearestPlace(places, lat, lon) {
  let best = null;
  let bestKm = Infinity;
  for (const p of places) {
    const km = surfaceKm(lat, lon, p[0], p[1]);
    if (km < bestKm) { bestKm = km; best = p; }
  }
  return best && { name: best[2], country: best[3], population: best[4], km: bestKm };
}

/** Qualité du sandwich selon l'écart entre l'antipode et la tranche d'en face. */
export function verdict(gapKm) {
  if (gapKm < 1) return "perfect";
  if (gapKm < 100) return "great";
  if (gapKm < 1000) return "tilted";
  return "open";
}
