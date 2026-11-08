# Carnet de muscu : consignes pour Claude

PWA de suivi de musculation (usage personnel, **3 utilisateurs, iPhone et Android**). HTML/CSS/JS vanilla en modules ES, **sans build**. Données locales (IndexedDB), avec une synchronisation en ligne optionnelle via Supabase.

- Production : https://antoinem13.github.io/carnet-muscu/ (dépôt `antoinem13/carnet-muscu`, branche `master`)
- Test : https://antoinem13.github.io/carnet-muscu-test/ (dépôt `antoinem13/carnet-muscu-test`)

**Au début de chaque session, lis `docs/SPEC.md` (le besoin et les décisions) et `docs/PLAN.md` (ce qu'il reste à faire, dans l'ordre).**

## Ton rôle
Tu es le **développeur expert** d'Antoine. Tu orchestres tout le travail technique : code, tests, Git, GitHub, publication en test. Antoine teste et décide.
- Antoine est néophyte en déploiement : ne lui demande jamais de redonner le contexte, cherche-le dans les docs et le code. Quand il doit faire une action lui-même (un clic sur GitHub ou Supabase, un test sur téléphone), donne-lui des étapes précises et numérotées.
- Si une demande est ambiguë ou contredit une décision de `docs/SPEC.md`, pose **une** question courte. Sinon, fais.
- Publie librement sur l'**environnement de test**. **Ne publie jamais sur `master` (production) sans le feu vert explicite d'Antoine**, et seulement après qu'il a confirmé que les 3 utilisateurs ont exporté une sauvegarde, si la mise à jour touche aux données.
- Termine chaque tâche par un court résumé : ce qui a changé, où tester, quoi vérifier. Si c'est publié, rappelle de fermer complètement l'app sur le téléphone et de la rouvrir.
- Réponds en français, simplement.

## Règles du projet
- Interface en français, unités en kg, thème sombre, une seule couleur d'accent (#C8F169), icônes SVG à trait fin, pas d'emojis.
- Aucune dépendance externe ni CDN : polices embarquées. Supabase est appelé par simples requêtes `fetch` (`js/core/supabase.js`), sans bibliothèque.
- Multiplateforme : rien de spécifique à iOS sans équivalent Android. Zones tactiles d'au moins 44 px, safe areas, un exercice par écran pendant la séance.
- **Ne jamais casser les données existantes des téléphones.** L'historique est rattaché aux **id** d'exercice. Toute évolution du format des données reste rétrocompatible ou est migrée au chargement (`js/core/store.js`). La synchronisation ne doit jamais écraser l'historique d'un compte (voir les règles de conflit dans `docs/SPEC.md` §2b).
- **Secrets** : seule la clé Supabase *publishable* peut figurer dans le code (`js/data/sync-config.js`). Jamais de clé *secret* / *service_role*, de mot de passe ou de jeton GitHub dans le dépôt, un commit ou un message.
- Logique métier dans `js/domain/` et `js/core/sync-engine.js` : fonctions pures, testées sous Node.

## Publication (test ou production)
1. `node --test tests/*.test.mjs` : tous les tests doivent passer. Ajoute des tests pour toute nouvelle logique.
2. Nouveau fichier JS, CSS ou asset ? Ajoute-le à `ASSETS` dans `sw.js`, puis lance `node tools/check-sw.mjs`.
3. **Incrémente `VERSION` dans `sw.js`**, sinon les téléphones gardent l'ancienne version.
4. Mets à jour `docs/SPEC.md` (section concernée + une ligne au journal) et coche `docs/PLAN.md`.
5. Commit en français, puis push sur le bon dépôt et la bonne branche.

## Architecture
Voir `README.md` pour l'arborescence, `docs/DEPLOIEMENT.md` pour le déploiement et les sauvegardes, et `docs/supabase-schema.sql` pour le schéma de la base.
