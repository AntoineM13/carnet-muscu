# Plan de travail : synchronisation en ligne → mise en production

État au 2026-11-08 : la synchronisation Supabase est codée sur la branche `sync-supabase` et validée par Antoine sur son Mac (localhost) contre le vrai projet Supabase. Ce plan liste ce qu'il reste à faire, dans l'ordre. **Claude Code orchestre** : il fait le travail technique, publie sur l'environnement de test, dit à Antoine quoi tester, et ne publie en production qu'après son feu vert explicite.

Coche les cases au fur et à mesure (et ajoute une ligne au journal de `docs/SPEC.md` à chaque étape terminée).

---

## Étape 1 : environnement de test sur téléphone
But : tester la version synchronisée sur iPhone et Android, en HTTPS, sans toucher la production.

- [x] Créer le dépôt public `antoinem13/carnet-muscu-test` (avec `gh repo create` si `gh` est installé et connecté ; sinon guider Antoine pour le créer vide sur github.com, en 1 minute).
- [x] Y publier le contenu de la branche `sync-supabase` (branche `main` du dépôt de test). Le dépôt de production n'est pas modifié.
- [x] Activer GitHub Pages sur ce dépôt (branche `main`, dossier racine), via `gh api` si possible, sinon guider Antoine (Settings → Pages).
- [x] Vérifier que `https://antoinem13.github.io/carnet-muscu-test/` répond et que l'app se charge.
- [x] Dans Supabase (Antoine, guidé) : Authentication → URL Configuration → ajouter `https://antoinem13.github.io/carnet-muscu-test/` aux **Redirect URLs**. (Facultatif tant que « Confirm email » reste désactivé : aucun lien e-mail n'est utilisé.)
- [x] Donner à Antoine la checklist téléphone :
  1. Ouvrir l'adresse de test. Installer l'app sur l'écran d'accueil (iPhone : Safari → Partager → Sur l'écran d'accueil ; Android : Chrome → Installer l'application).
  2. Se connecter avec un **compte de test** (ex. `antoine+test@…`, le « + » crée une adresse distincte qui arrive dans la même boîte mail).
  3. Faire une mini-séance, couper le réseau (mode avion), modifier quelque chose, remettre le réseau : vérifier que « en attente » repasse à « Synchronisé ».
  4. Vérifier la même donnée sur le Mac (version de test ouverte dans le navigateur).
  5. Si possible, faire le même test sur le téléphone Android de l'ami.

✅ Critère de validation : Antoine confirme que tout fonctionne sur iPhone (et Android si possible).

**Étape 1 validée le 2026-11-08** (iPhone + Mac). Android : à tester par l'ami quand possible.

## Étape 2 : intégrer les retours de la salle
Antoine a des retours d'usage à transmettre. Les traiter **sur la branche `sync-supabase`**, les republier sur l'environnement de test, et les faire valider avant la production. On ne publie qu'une seule fois en production (une seule sauvegarde demandée aux amis).

- [x] Recueillir les retours d'Antoine (lot 1, 2026-11-08) :
  - [x] chrono de repos désactivable (réglage par compte) ;
  - [x] message « Annuler » qui bloquait les suppressions enchaînées dans l'éditeur de séance ;
  - [x] progression : force / volume du même exercice dans deux séances (référence = même séance) ;
  - [x] onglet « Progrès » (remplace Objectifs) : résumé de la semaine, tableau par séance, courbes par séance ;
  - [x] lot 2 (analyse de l'export) : incréments par matériel (réglables) et par exercice, poids de corps, détection des dégressives, repos > 15 min ignoré, fusion de doublons, fond sous la Dynamic Island ;
  - [x] muscles sur deux niveaux (groupes + parties, principal / secondaires) et type de mouvement (poly / isolation) ;
  - [ ] banque d'exercices commune : banque intégrée FR/EN + description (~150-200 exercices), plus ajouts partagés via une table Supabase commune (`bank`, lecture par tous les connectés, écriture par l'auteur).
  - [ ] recherche par filtres (muscle, type de mouvement, matériel) sans listes indigestes : « Mes exercices » d'abord, la banque en second ;
  - [ ] signalement des exercices proches (à la création + badge « Doublon possible ? » dans la bibliothèque, avec « Ce sont deux exercices différents ») ;
  - [ ] silhouette 2D cliquable face / dos (à tenter ; abandon possible si le rendu n'est pas bon).
- [ ] Implémenter, tester (`node --test tests/*.test.mjs`), republier en test.
- [ ] Ajustements Android :
  - le conseil d'installation du premier lancement s'adapte à iOS/Android ;
  - bouton « Installer l'app » via l'événement `beforeinstallprompt` sur Android ;
  - section Android dans `docs/DEPLOIEMENT.md`.

✅ Critère : Antoine valide la version de test complète.

## Étape 3 : sauvegarde nocturne sur le Mac mini
But : le plan gratuit Supabase n'a pas de sauvegarde automatique. Chaque nuit, une copie de toute la table `docs` est enregistrée sur le Mac mini.

Conception proposée (sans dépendance à installer) :
- Script `tools/backup/backup-supabase.py` (Python 3 du Mac) : appelle `GET https://<projet>.supabase.co/rest/v1/docs?select=*` avec la clé **secret** (contourne la RLS, lecture de toutes les lignes, pagination). Écrit `~/Sauvegardes/carnet-muscu/docs-AAAA-MM-JJ.json`. Garde les 30 derniers fichiers.
- **La clé secret n'est JAMAIS dans le dépôt** : elle est stockée dans le Trousseau macOS (`security add-generic-password -s carnet-muscu-supabase -a backup -w`), et le script la lit avec `security find-generic-password -s carnet-muscu-supabase -w`. Antoine la saisit lui-même (guider : Supabase → Project Settings → API Keys → Secret keys).
- Planification : `launchd` (`~/Library/LaunchAgents/fr.carnetmuscu.backup.plist`), tous les jours à 3 h. Si le Mac dort à cette heure, la tâche tourne au réveil.
- Fournir aussi une commande de restauration documentée (réinjecter un fichier JSON via l'API avec la clé secret).
- Tester : lancer le script à la main, vérifier le fichier, puis vérifier le lendemain que la tâche planifiée a tourné.

✅ Critère : un fichier de sauvegarde valide est produit automatiquement.

## Étape 4 : mise en production
Uniquement après le feu vert explicite d'Antoine.

- [ ] Supabase (Antoine, guidé) :
  - supprimer les **comptes de test** (Authentication → Users → supprimer ; leurs données partent avec, grâce au `on delete cascade`). Y compris le compte avec l'e-mail réel d'Antoine utilisé pendant les tests sur localhost, pour repartir propre ;
  - **laisser Confirm email DÉSACTIVÉ** (Authentication → Sign In / Providers → Email). Le service d'e-mails intégré de Supabase n'envoie que 2 e-mails/heure et **uniquement aux membres de l'équipe Supabase** (Antoine) : avec la confirmation activée, les amis ne recevraient jamais le lien et ne pourraient pas finir leur inscription. Sans confirmation, l'inscription n'envoie aucun e-mail (limite anti-abus : ~30 inscriptions / 5 min / IP). Mot de passe oublié : supprimer le compte dans Supabase, la personne en recrée un (ses données locales repartent en ligne). Si un jour les e-mails deviennent nécessaires : brancher un SMTP gratuit (ex. Resend), Authentication → Emails → SMTP Settings ;
  - **Site URL** = `https://antoinem13.github.io/carnet-muscu/` et ajouter cette adresse aux Redirect URLs ;
  - (seulement si un SMTP est branché et la confirmation réactivée) vérifier que le lien de confirmation reçu par e-mail renvoie bien vers l'app, et que le fragment `#access_token=…` dans l'URL ne casse pas le routeur.
- [ ] Rédiger le message pour les amis (court, en français) :
  1. **Avant la mise à jour** : Réglages → Exporter la sauvegarde complète → Enregistrer dans Fichiers.
  2. Après la mise à jour (fermer complètement l'app et la rouvrir) : Réglages → Compte et synchronisation → Créer un compte (aucun e-mail de confirmation). Leur historique local est envoyé automatiquement.
- [ ] Attendre qu'Antoine confirme que les amis ont fait leur sauvegarde.
- [ ] Fusionner `sync-supabase` dans `master` : incrémenter `VERSION` dans `sw.js` (version propre, ex. `v1.3.0`), tests au vert, `node tools/check-sw.mjs`, mettre à jour `README.md`, `docs/DEPLOIEMENT.md` et `docs/SPEC.md`. Publier.
- [ ] Vérifier la production en ligne, puis supprimer le dépôt de test (`gh repo delete` ou guider Antoine) et retirer son adresse des Redirect URLs.

✅ Critère : les 3 utilisateurs sont connectés et synchronisés, et la sauvegarde nocturne tourne.

---

## Rappels permanents
- Rien sur `master` sans feu vert d'Antoine.
- Antoine teste, Claude Code fait le reste. Toujours terminer par : ce qui a changé, où le tester, quoi vérifier.
- Jamais de clé secret, de mot de passe ou de jeton dans le dépôt, dans un commit ou dans un message.
