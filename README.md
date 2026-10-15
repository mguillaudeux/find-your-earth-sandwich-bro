# Find your earth sandwich bro 🍞🌍🍞

**Comment préparer un sandwich terrestre. Littéralement.**
Pose une tranche de pain face contre terre : le site trouve où, de l'autre côté de la planète, ton *sandwich bro* doit poser la sienne.

👉 **Essayer :** https://mguillaudeux.github.io/find-your-earth-sandwich-bro/

## La recette

1. **Pose une tranche de pain face contre terre.** Clique sur le globe, utilise ta position ou choisis un classique.
2. **Détermine la position de ton sandwich bro.** On traverse la Terre par son centre jusqu'à l'**antipode**. Si on tombe en mer, ce qui arrive le plus souvent, on prend la terre ferme la plus proche et on affiche l'écart.
3. **Trouve un sandwich bro.** Ça, c'est ton problème. Le site te donne quand même un lien à lui envoyer.
4. **Demande-lui de poser une tranche face contre terre.** TADAM 🎉

## Comment c'est calculé

- **Antipode** : `(lat, lon) → (−lat, lon ± 180°)`. C'est exact même sur l'ellipsoïde terrestre, qui est symétrique par rapport à son centre.
- **Terre la plus proche** : si l'antipode n'est pas sur la terre ferme, on cherche le point de côte le plus proche en distance géodésique. Le calcul utilise une Terre sphérique de 6 371 km de rayon, avec une erreur inférieure à 0,5 %. Les côtes sont densifiées tous les 5 km.
- **Petites îles** : le calcul utilise les côtes Natural Earth au 1:10m, alors que le globe affiché utilise le 1:50m, plus léger. Sans ce détail, on raterait par exemple les îles Antipodes (Nouvelle-Zélande), presque aux antipodes de Londres. Quelques polygones à l'envers de ces données sont réparés au chargement.
- **Confidentialité** : tout est calculé dans le navigateur, ta position n'est envoyée nulle part.

Le code de calcul est dans [`web/js/geo.js`](web/js/geo.js) : des fonctions pures, testées dans [`tests/`](tests/).

## Lancer en local

```bash
npm install
npm test          # tests du calcul (node:test), dont des cas réels : Wellington ↔ Espagne, Paris, Londres…
npm run serve     # http://localhost:8000
npm run data      # régénère web/data/ (seulement si on change de source)
```

Le site est 100 % statique (`web/`). Il est déployé sur GitHub Pages par [`.github/workflows/pages.yml`](.github/workflows/pages.yml) après les tests.

## Crédits

- Clin d'œil à l'[Earth Sandwich](https://en.wikipedia.org/wiki/Earth_sandwich) lancé par Ze Frank en 2006.
- Contours : [Natural Earth](https://www.naturalearthdata.com/), domaine public, via [world-atlas](https://github.com/topojson/world-atlas).
- Lieux habités : [GeoNames](https://www.geonames.org/), CC BY 4.0, via [all-the-cities](https://www.npmjs.com/package/all-the-cities). On garde le lieu le plus peuplé par case de 0,5°.
- Globe : [d3](https://d3js.org/) et [topojson-client](https://github.com/topojson/topojson-client), inclus dans `web/vendor/` (licence ISC).

---

## English

**How to make an earth sandwich. Literally.** Put a slice of bread face down on the ground; the site finds where, on the other side of the planet, your *sandwich bro* must put theirs.

The antipode is `(−lat, lon ± 180°)`. When it falls in the ocean, which happens most of the time, the site picks the nearest dry land by geodesic distance and shows how far off your sandwich is. Everything runs in your browser. Run `npm test` for the tests and `npm run serve` to try it locally.

Licence : MIT.
