# Carnet de muscu

Carnet de bord de musculation pour iPhone et Android, sous forme de PWA : installable depuis Safari ou Chrome, 100 % hors-ligne. Les données restent sur le téléphone (IndexedDB), avec une **synchronisation en ligne optionnelle** (Supabase, compte par pseudo + mot de passe) : voir `docs/SPEC.md` §2b et `docs/DEPLOIEMENT.md` §4.

- **Démarrer en local** : `python3 -m http.server 8000` à la racine, puis ouvrir http://localhost:8000
- **Tests des modules métier** : `node --test tests/*.test.mjs`
- **Vérifier la liste de cache du service worker** : `node tools/check-sw.mjs`
- **Déploiement, installation sur iPhone et sauvegardes** : voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)

## Arborescence

```
index.html, manifest.webmanifest, sw.js
assets/fonts/          polices embarquées (Bricolage Grotesque, DM Sans — licence OFL)
assets/icons/          icônes de l'app
css/                   tokens (couleurs, typos), base, composants, écrans
js/app.js              démarrage, routes
js/modules.js          branchement des modules optionnels (progression, course)
js/core/               base de données, état, routeur, utilitaires, actions
js/data/seed-program.js   PROGRAMME ET PLANNING DE DÉPART (fichier à éditer)
js/data/exercise-bank.js  BANQUE D'EXERCICES (FR/EN, muscles, description)
js/data/muscles.js     groupes musculaires et leurs parties
js/data/defaults.js    réglages par défaut
js/domain/             logique métier pure (testable sans navigateur)
  planning.js          ancien planning (données conservées, plus affiché)
  progression.js       dernière performance, suggestions (module unique)
  session.js           séance en cours (supersets, dégressives, remplacements)
  stats.js             volume, 1RM estimé, records
  backup.js            exports / imports JSON
  bank.js              banque d'exercices : recherche, filtres, sections par muscle
  muscles.js           muscles principaux / secondaires
  dashboard.js         onglet Progrès
js/ui/                 composants d'interface, feuilles, icônes SVG
js/screens/            écrans
tests/                 tests Node des modules métier
```

## Modifier le programme de départ

Éditer `js/data/seed-program.js` (commentaires en tête de fichier). Il n'est lu qu'au premier lancement, quand on choisit « Programme pré-rempli ». Ensuite, tout se modifie dans l'app (onglet Programme).
