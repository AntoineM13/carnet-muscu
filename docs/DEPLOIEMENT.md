# Guide de déploiement

Ce guide couvre trois choses : mettre l'app en ligne sur GitHub Pages (5 minutes), l'installer sur iPhone, et protéger tes données.

---

## 1. Mettre en ligne sur GitHub Pages

L'app est un site statique : pas de build, pas de serveur. Le dépôt peut être **public**, car aucune donnée ne quitte le téléphone : GitHub ne sert que le code.

1. Sur github.com, crée un dépôt vide (par exemple `carnet-muscu`), sans README.
2. Depuis ce dossier, sur ton Mac :
   ```bash
   git remote add origin https://github.com/<ton-compte>/carnet-muscu.git
   git push -u origin main
   ```
3. Sur GitHub, va dans **Settings → Pages**. Choisis **Source : Deploy from a branch**, **Branch : main**, dossier **/ (root)**, puis **Save**.
4. Au bout d'une minute environ, l'app est disponible à l'adresse `https://<ton-compte>.github.io/carnet-muscu/`.

> GitHub Pages sert le site en HTTPS, ce qui est obligatoire pour le service worker (mode hors-ligne) et pour l'installation sur l'écran d'accueil.

### Tester en local avant de pousser

```bash
python3 -m http.server 8000     # puis ouvrir http://localhost:8000
node --test tests/*.test.mjs    # tests de la logique (planning, progression, stats…)
node tools/check-sw.mjs         # vérifie que tous les fichiers sont bien mis en cache
```

### Publier une mise à jour

1. Modifie le code.
2. **Incrémente `VERSION`** en haut de `sw.js` (par exemple `v1.2.0` → `v1.2.1`). Sans ça, les téléphones gardent l'ancienne version en cache.
3. Si tu as ajouté un fichier, ajoute-le à la liste `ASSETS` de `sw.js` (`node tools/check-sw.mjs` te le signale).
4. `git commit` puis `git push`.
5. Sur l'iPhone, ouvre l'app : un message indique qu'une nouvelle version est installée. Ferme l'app (balaye-la vers le haut dans le sélecteur d'apps) et rouvre-la.

Les mises à jour du code ne touchent jamais tes données.

---

## 2. Installer sur iPhone

1. Ouvre l'adresse GitHub Pages dans **Safari**. Sur iOS 16.4 et plus, Chrome fonctionne aussi, mais Safari reste le plus simple.
2. Touche le bouton **Partager** (le carré avec une flèche vers le haut), puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Lance l'app **depuis l'icône** « Carnet » : elle s'ouvre en plein écran, sans barre Safari, et fonctionne hors-ligne dès la première ouverture.
4. Au premier lancement, choisis **Programme pré-rempli**, **Partir de zéro** ou **Importer un fichier**.

⚠️ Les données de l'app installée sont **séparées** de celles de Safari. Ce que tu saisis dans un onglet Safari n'apparaît pas dans l'app de l'écran d'accueil, et inversement. Utilise toujours l'icône.

### Partager le programme avec ton collègue

1. **Réglages → Exporter le programme seul.** La feuille de partage iOS s'ouvre : envoie le fichier par AirDrop, Messages ou mail.
2. Ton collègue installe l'app (étapes ci-dessus). Au premier lancement, il choisit **Importer un fichier**. S'il utilise déjà l'app : **Réglages → Importer un fichier… → Remplacer mon programme**.

Ce fichier contient les séances, la bibliothèque d'exercices et le planning par défaut. Il ne contient **ni historique, ni objectifs, ni notes personnelles**, et son import n'écrase rien de tout ça chez ton collègue. Comme vous partez du même programme, les identifiants des exercices sont identiques : son historique reste rattaché aux bons exercices.

---

## 3. Sauvegarde et restauration

### La limite iOS à connaître

Toutes les données vivent **uniquement sur le téléphone**, dans le stockage de l'app (IndexedDB). Il n'y a ni compte ni cloud. Sur iOS, ce stockage peut disparaître :

- si tu **supprimes l'icône** de l'écran d'accueil (les données partent avec elle) ;
- si tu **effaces les données de sites** dans les Réglages iOS (Safari → Avancé → Données des sites) ;
- si iOS **manque d'espace**, en cas de stockage saturé ;
- en cas de **changement ou de réinitialisation** du téléphone. Une sauvegarde iCloud de l'iPhone ne garantit pas la restauration des données d'une web app.

Safari efface aussi le stockage des sites non visités depuis 7 jours. Les apps ajoutées à l'écran d'accueil ne sont en principe pas concernées, mais c'est une raison de plus de toujours passer par l'icône. L'app demande en plus à iOS de conserver ses données (« stockage persistant »), sans garantie absolue.

### Exporter : une fois par semaine

**Réglages → Exporter la sauvegarde complète.** Dans la feuille de partage, choisis **Enregistrer dans Fichiers**, de préférence dans **iCloud Drive** (un dossier « Carnet muscu » par exemple).

- Fréquence recommandée : **une fois par semaine**, par exemple après la dernière séance de la semaine.
- L'accueil affiche un rappel si ta dernière sauvegarde a plus de 7 jours.
- Garde les 3 ou 4 derniers fichiers. Ils sont datés et très légers (quelques dizaines de Ko).

La sauvegarde complète contient tout : programme, planning (par défaut et semaines), historique des séances, objectifs, sorties de course et réglages.

### Restaurer

**Réglages → Importer un fichier…**, puis choisis le fichier `carnet-muscu-sauvegarde-AAAA-MM-JJ.json` et confirme **Remplacer mes données**.

⚠️ La restauration **remplace** toutes les données du téléphone par celles du fichier. Pour changer de téléphone : exporte sur l'ancien, installe l'app sur le nouveau, puis importe au premier lancement.

---

## Pour aller plus loin

- Modifier le programme de départ (avant de le partager, par exemple) : `js/data/seed-program.js`.
- Ajuster la logique de progression : `js/domain/progression.js`, un seul module commenté.
- Plans de course indicatifs : `js/data/run-plans.js`, également modifiables dans l'app.
