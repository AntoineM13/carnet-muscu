# Spécifications et décisions : Carnet de muscu

Document de référence du projet. **Claude le tient à jour à chaque évolution** : ajouter les nouvelles décisions au journal (dernière section), corriger les sections qui changent.

## 1. Contexte
- App de suivi de musculation, usage personnel : **3 utilisateurs** (Antoine, un collègue, un ami) qui suivent le même programme. Pas d'App Store.
- **iPhone ET Android** : PWA installée depuis Safari (iOS) ou Chrome (Android). Ne rien coder de spécifique à iOS sans équivalent Android.
- 100 % utilisable hors-ligne. Chaque personne a l'app sur son propre téléphone, avec un seul profil par téléphone.
- **Synchronisation en ligne optionnelle (Supabase)**, voir §2b. Sans compte, l'app reste 100 % locale comme avant.
- Objectif : un carnet **simple et rapide entre deux séries** (une main, petit écran) et surtout **flexible**, qu'on peut adapter en direct sans casser le programme de base.
- Principe central : chaque séance enregistrée alimente la suivante. Sur chaque exercice, on voit ce qu'on a fait la dernière fois et ce qu'on vise aujourd'hui.

## 2. Contraintes techniques
- HTML, CSS et JS vanilla en modules ES, sans build, sans CDN. Les polices (Bricolage Grotesque pour les titres et chiffres, DM Sans pour le texte) sont embarquées.
- Données dans IndexedDB, avec sauvegarde automatique à chaque action.
- Service worker en « cache d'abord » (`sw.js`) : incrémenter `VERSION` à chaque publication.
- Écran maintenu allumé pendant une séance (Wake Lock, avec repli silencieux si non supporté).
- Deux exports JSON :
  - la sauvegarde complète ;
  - le programme seul (séances, bibliothèque, planning par défaut), pour le partager sans écraser l'historique de l'autre. L'import fusionne les exercices par id et conserve les notes et marqueurs de douleur locaux.
- Hébergement : GitHub Pages, dépôt `antoinem13/carnet-muscu`, branche `master` (= production, utilisée par les 3 amis).
- Environnement de test : dépôt `antoinem13/carnet-muscu-test` (GitHub Pages), pour tester sur téléphone sans toucher la production. Même domaine que la production, donc isolation explicite (`js/core/env.js`) : base IndexedDB `carnet-muscu-test`, préfixe de cache `cm-test-`, repère « TEST » à l'écran.

## 2b. Synchronisation en ligne (Supabase)
- **Local d'abord** : IndexedDB reste la source de vérité de l'appareil. L'app marche sans réseau ; la synchro se fait en arrière-plan (au démarrage, 3 s après une modification, au retour du réseau, toutes les 60 s).
- Projet Supabase gratuit `carnet-muscu`, région Europe. URL et clé **publishable** dans `js/data/sync-config.js` (clé publique par conception). **Jamais de clé `secret` / `service_role` ni de mot de passe de base dans le dépôt.**
- Une seule table `public.docs` (schéma : `docs/supabase-schema.sql`) : `(user_id, collection, id)` → `data` JSON, `deleted`, `updated_at` (fixé par le serveur). RLS : chacun ne voit que ses lignes.
- Collections synchronisées : exercises, templates, sessions, goals, runs, et `kv` (settings, schedule). `meta` (onboarding, séance active) reste propre à l'appareil.
- Conflits :
  - synchro normale : une modification locale en attente l'emporte ;
  - **première synchro d'un appareil : le serveur l'emporte**, et les documents uniquement locaux sont envoyés. Un téléphone neuf ne peut pas écraser l'historique du compte.
- Pagination par curseur `(updated_at, collection, id)` pour ne perdre aucune ligne à horodatage identique.
- Connexion e-mail + mot de passe (client REST maison, sans bibliothèque : `js/core/supabase.js`). Moteur testable sous Node : `js/core/sync-engine.js`. Branchement : `js/core/sync.js`. Interface : `js/screens/account.js` (réglages + écran de premier lancement « J'ai déjà un compte »).
- « Effacer toutes les données » déconnecte d'abord le compte (l'effacement local ne touche jamais le compte en ligne).
- Plan gratuit Supabase : **pas de sauvegarde automatique** et pause après 1 semaine sans activité (réactivation d'un clic, données conservées). D'où la **sauvegarde nocturne sur le Mac mini d'Antoine** (voir `docs/PLAN.md`).

## 3. Design
- Thème sombre, une seule couleur d'accent (vert citron #C8F169), fonds gris très foncés, cartes arrondies, bordures fines.
- Chiffres tabulaires pour les charges, les reps et le chrono. Icônes SVG à trait fin, pas d'emojis.
- Barre d'onglets en bas : Accueil, Programme, Historique, Objectifs. Pas de barre d'onglets pendant une séance.
- Zones tactiles d'au moins 44 px. Confirmation uniquement pour les actions destructrices, toujours avec un « Annuler » de quelques secondes.
- Principes UX :
  - valider une série en moins de 2 taps ;
  - modifier le planning en 3 taps au maximum ;
  - l'accueil montre « ma prochaine séance » en un tap et la semaine en un coup d'œil.

## 4. Fonctionnalités

### Programme
- Éditeur intégré : séances, exercices, blocs.
- **Superset** : un bloc regroupant plusieurs exercices.
- **Alternatives** : un emplacement peut proposer plusieurs exercices (ex. bûcheron / rowing banc) ; on choisit en séance, et l'app retient le dernier choix.
- Réglages par emplacement : séries, plage de reps, repos, incrément.
- Bibliothèque personnalisable. L'historique est rattaché à l'**id** de l'exercice, donc le renommer ne casse rien.
- Chaque exercice a des notes permanentes et un marqueur « douleur / à éviter » avec commentaire.

### Planning
- Un planning par défaut (jour de la semaine → séance), plus des exceptions semaine par semaine.
- Une modification s'applique à « Cette semaine » (par défaut) ou à « Toutes les semaines ».
- En cas de conflit :
  - **Intervertir** (par défaut) ;
  - **Décaler** : vers le prochain jour libre de la semaine, sinon « dès que possible » ;
  - **Sauter**.
- Statuts d'une séance planifiée : à faire, faite, sautée, décalée. « En retard » est calculé (date passée, pas faite) : un bandeau non bloquant le signale, sans pénalité.
- Une séance sautée n'a aucun impact sur la progression ni sur les stats.
- Prochaine séance proposée, dans cet ordre :
  1. celle prévue aujourd'hui ;
  2. sinon la plus ancienne en retard ;
  3. sinon une séance « dès que possible » ;
  4. sinon la prochaine prévue.
  On peut toujours la changer (lien « Changer »), ou faire une séance libre.

### Séance
- Une séance est une **copie** du modèle : la modifier ne change pas le programme, sauf avec « Définitivement » ou « Mettre à jour le programme » (proposé dans le résumé de fin).
- **Un exercice (ou un superset) par écran.** Boutons fixes en bas : « Précédent », et « Suivant » avec le nom de l'exercice suivant. L'indicateur « Exercice X sur N » ouvre la liste des exercices. Le balayage horizontal est désactivable.
- En cours de séance, on peut réordonner, sauter ou reprendre, ajouter, retirer, grouper ou dégrouper en superset, ajouter ou supprimer des séries, et changer la date.
- **Remplacer un exercice** : « Juste aujourd'hui » ou « Définitivement ». Si des séries sont déjà validées, elles restent attachées à l'exercice d'origine, et le remplaçant prend la suite sur le même écran, dans le même « couloir » du superset.
- **Superset** : les séries s'alternent (A1, B1, A2…) et le repos se lance après le tour complet (réglable).
- Tout reste modifiable jusqu'à la fin de la séance. Après coup, on corrige depuis l'historique, avec un marquage « modifiée après coup ».
- La séance reprend automatiquement si on quitte l'app.
- Résumé de fin : durée, volume, records battus, et une note de séance (sommeil, fatigue, douleur, humeur de 1 à 5, plus un texte libre).

### Saisie
- Champs : charge, reps, repos pris (enregistré automatiquement et modifiable), RPE (optionnel, désactivé par défaut, purement informatif) et note.
- Types de série : échauffement, normale, dégressive, échec. Les échauffements sont exclus du volume.
- **Dégressives** : plusieurs paliers dans la même série. La charge proposée pour chaque palier (−20 % par défaut) n'est qu'une proposition, toujours modifiable à la main. Le chrono démarre après le dernier palier. Le volume compte tous les paliers ; les records et la progression ne comptent que le premier.
- **Échauffement** : proposé sur le premier exercice (à 50, 70 et 85 % de la charge de travail), et disponible à la demande sur les autres.
- Calculateur de disques pour les exercices à la barre (poids de la barre et disques disponibles réglables).
- Chrono de repos : −15 s, +15 s, Passer, alerte visuelle et bip en fin de repos. La vibration n'est pas supportée sur iOS.
- Bouton « Comme la dernière fois ». Les séries suivantes reprennent la charge réellement validée.

### Progression (tout est dans `js/domain/progression.js`)
- **Augmenter** : si toutes les séries de travail ont atteint le **haut** de la plage (double progression), on ajoute l'incrément et on repart au bas de la plage.
- **Stabiliser** : sinon, même charge, avec un objectif de +1 rep par série.
- **Récup / volume** : charge −10 % (réglable), reps au haut de la plage et une série de plus.
- « Forme du jour » (Frais / Normal / KO) en début de séance. **KO** bascule tout en Récup. Le mode reste modifiable exercice par exercice.
- Les suggestions préremplissent les séries et restent indicatives. Les échauffements et les paliers de dégressive sont ignorés.

### Objectifs et stats
- Records : charge max, meilleur 1RM estimé (Epley), meilleur volume.
- Graphique par exercice : charge max, 1RM estimé ou volume.
- Objectifs de type charge × reps ou 1RM estimé, avec date cible optionnelle. Affichage : barre d'avancement, valeur actuelle et écart restant.

### Course à pied (module optionnel, désactivable)
- Sortie : date, distance, durée et note ; l'allure est calculée. Pas de GPS.
- Historique, courbe d'allure ou de distance, et sorties visibles dans la semaine et le calendrier.
- Plans-types indicatifs et modifiables : débutant (marche / course) et intermédiaire (facile + qualité).

## 5. Conventions de saisie (décisions d'Antoine)
- Haltères : la charge est saisie **par haltère**.
- Tractions et dips : **lest additionnel** (0 = poids du corps, négatif = assistance).
- Unilatéral : **une seule saisie, reps par côté**.
- Volume = charge saisie × reps, telle quelle.

## 6. Données de départ
- `js/data/seed-program.js` : 4 séances. Les supersets et le planning par défaut sont décrits dans ce fichier : mercredi Pec/Dos, vendredi Jambes, samedi Dos/Pec, dimanche Bras/Épaules, les autres jours en repos.
- Valeurs par défaut : 3 séries, 8-12 reps, 90 s de repos, incrément de 2,5 kg.

## 7. Idées pour une v2 (garder l'architecture compatible)
Semaine de décharge, détection de stagnation, champ tempo, volume par groupe musculaire et par semaine, poids de corps, photos de progression, comparaison entre les deux utilisateurs via fichier exporté.

## 8. Journal des décisions
Une ligne par évolution ou décision, la plus récente en bas : `AAAA-MM-JJ : quoi, pourquoi`.

- 2026-09-26 : v1 livrée (étapes 1 à 3 : programme/planning/séance/historique, progression/objectifs, course à pied).
- 2026-09-26 : « Développé incliné » (Dos/Pec) est un exercice distinct de « Développé incliné haltères » (Pec/Dos), à fusionner si c'est le même.
- 2026-09-26 : « Arrière d'épaule » est classé en haltères par défaut.
- 2026-09-26 : la première semaine après l'installation n'est planifiée qu'à partir du jour même, pour éviter de faux « retards ».
- 2026-09-26 : le résumé de fin propose « Mettre à jour le programme » quand la structure de la séance a changé.
- 2026-11-08 : un 3e utilisateur rejoint le projet, sur Android. L'app doit rester multiplateforme.
- 2026-11-08 : choix de Supabase (gratuit) plutôt qu'un hébergement 100 % Mac mini : zéro maintenance, et rien à installer pour les amis (pas de Tailscale). Le Mac mini sert à la sauvegarde nocturne.
- 2026-11-08 : synchronisation « local d'abord » développée sur la branche `sync-supabase`, validée par Antoine sur son Mac contre le vrai Supabase (création de compte, envoi, téléphone neuf, synchro dans les deux sens, mauvais mot de passe).
- 2026-11-08 : règle de publication : **rien n'est publié sur `master` tant que ce n'est pas stable et validé par Antoine**. Avant chaque publication qui touche aux données, les 3 utilisateurs font un export de sauvegarde.
- 2026-11-08 : la version de test utilise sa propre base locale et son propre cache, car elle partage le domaine `antoinem13.github.io` avec la production : sinon elle aurait modifié les vraies données du téléphone.
