# Carnet de muscu : consignes pour Claude

PWA de suivi de musculation pour iPhone (usage personnel, 2 utilisateurs). HTML/CSS/JS vanilla en modules ES, **sans build**. Données 100 % locales (IndexedDB), aucun backend. Publiée sur GitHub Pages depuis la branche `master` : https://antoinem13.github.io/carnet-muscu/

## Règles
- Interface en français, unités en kg, thème sombre, une seule couleur d'accent (#C8F169), icônes SVG à trait fin, pas d'emojis.
- Aucune dépendance externe ni CDN (polices embarquées dans `assets/fonts`).
- Mobile-first iPhone : zones tactiles ≥ 44 px, safe areas, un exercice par écran pendant la séance.
- Ne jamais casser les données existantes : l'historique est rattaché aux **id** d'exercice. Toute évolution du format des données doit rester compatible (ou être migrée dans `js/core/store.js`).
- La logique métier reste dans `js/domain/` (fonctions pures, testables sous Node). La progression est isolée dans `js/domain/progression.js`.
- Le programme de départ vit dans `js/data/seed-program.js`, jamais codé en dur ailleurs.

## Avant chaque publication
1. `node --test tests/*.test.mjs` : tous les tests doivent passer (ajouter des tests pour toute nouvelle logique métier).
2. Nouveau fichier JS, CSS ou asset ? L'ajouter à la liste `ASSETS` de `sw.js`, puis lancer `node tools/check-sw.mjs`.
3. **Incrémenter `VERSION` dans `sw.js`**, sinon les iPhones gardent l'ancienne version en cache.
4. Tester en local : `python3 -m http.server 8000`, puis ouvrir http://localhost:8000 (vue mobile).
5. Commit en français, message clair, puis `git push` sur `master`.

## Architecture
Voir `README.md` (arborescence) et `docs/DEPLOIEMENT.md` (déploiement, sauvegardes).
