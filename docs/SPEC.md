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
- Service worker en « cache d'abord » (`sw.js`) : incrémenter `VERSION` à chaque publication. L'installation télécharge les fichiers avec `cache: 'reload'` (sinon la mémoire HTTP de GitHub Pages, 10 min, pouvait installer une nouvelle version avec les anciens fichiers). À l'ouverture, si une nouvelle version s'active dans les 20 premières secondes, l'app se recharge seule ; elle vérifie aussi les mises à jour à chaque retour au premier plan.
- Écran maintenu allumé pendant une séance (Wake Lock, avec repli silencieux si non supporté).
- Deux exports JSON :
  - la sauvegarde complète ;
  - le programme seul (séances, bibliothèque, planning par défaut), pour le partager sans écraser l'historique de l'autre. L'import fusionne les exercices par id et conserve les notes et marqueurs de douleur locaux.
- Hébergement : GitHub Pages, dépôt `antoinem13/carnet-muscu`, branche `master` (= production, utilisée par les 3 amis).
- Environnement de test : dépôt `antoinem13/carnet-muscu-test` (GitHub Pages), pour tester sur téléphone sans toucher la production. Même domaine que la production, donc isolation explicite (`js/core/env.js`) : base IndexedDB `carnet-muscu-test`, préfixe de cache `cm-test-`, étiquette « TEST » dans l'en-tête de l'accueil (pas de pastille flottante : elle brouillait l'en-tête sur iPhone).
- **Jeu de test** (version de test seulement, Réglages → « Jeu de test ») : ajoute 4 semaines de séances fictives construites à partir des séances du Programme (`js/domain/demo.js`, ids `demo-…`), pour voir historique, Progrès et suggestions. Retirable d'un bouton, sans toucher aux autres données. Absent en production.

## 2b. Synchronisation en ligne (Supabase)
- **Local d'abord** : IndexedDB reste la source de vérité de l'appareil. L'app marche sans réseau ; la synchro se fait en arrière-plan (au démarrage, 3 s après une modification, au retour du réseau ou dans l'app, toutes les 15 s tant que l'app est visible).
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
- Barre d'onglets en bas : Accueil, Programme, Historique, Progrès (l'ancien onglet Objectifs, adresse `#/goals` conservée). Pas de barre d'onglets pendant une séance.
- Zones tactiles d'au moins 44 px. Confirmation uniquement pour les actions destructrices, toujours avec un « Annuler » de quelques secondes.
- Principes UX :
  - valider une série en moins de 2 taps ;
  - l'accueil propose « Commencer une séance » (on choisit le jour, puis la séance : rien n'est présélectionné) et montre la semaine en un coup d'œil (séances faites).

## 4. Fonctionnalités

### Programme
- Éditeur intégré : séances, exercices, blocs.
- **Superset** : un bloc regroupant plusieurs exercices.
- **Alternatives** : un emplacement peut proposer plusieurs exercices (ex. bûcheron / rowing banc) ; on choisit en séance, et l'app retient le dernier choix.
- Réglages par emplacement : séries, plage de reps, repos.
- **Incrément** (de combien monte la charge proposée) : défini par le **matériel** dans Réglages → « Charges de ta salle » (défauts : barre 2,5 kg, haltères 2 kg, machine 5 kg, poulie 5 kg, lest 2,5 kg), et modifiable **par exercice** dans sa fiche. L'ancien incrément stocké dans chaque emplacement n'est plus utilisé (gardé dans les données pour compatibilité).
- **Fusionner deux exercices** (fiche exercice → « Fusionner avec un autre exercice… ») : pour les doublons ; historique, programme, objectifs et notes passent sur l'exercice gardé, avec « Annuler ».
- Bibliothèque personnalisable. L'historique est rattaché à l'**id** de l'exercice, donc le renommer ne casse rien.
- **Muscles sur deux niveaux** (`js/data/muscles.js`, logique `js/domain/muscles.js`) : des **groupes** au quotidien (Pectoraux, Dos, Épaules, Biceps, Triceps, Avant-bras, Abdominaux, Quadriceps, Ischio-jambiers, Fessiers, Adducteurs, Mollets) et leurs **parties** si on veut préciser (ex. Pectoraux : haut / milieu / bas ; Triceps : longue, latérale, médiale ; Biceps : longue, courte, brachial ; Dos : grand dorsal, trapèzes-rhomboïdes, lombaires ; Épaules : avant, côté, arrière ; Fessiers : grand, moyen ; Abdominaux : grand droit, obliques).
- Chaque exercice : **principal** (1 ou 2) et **secondaires** (`exercise.muscles`), et un **type de mouvement** polyarticulaire / isolation (`exercise.mechanic`). Le champ historique `muscleGroup` reste le libellé du groupe principal, tenu à jour : les anciens exercices restent valides sans migration.
- Choix des muscles (fiche exercice) : un seul écran ; chaque ligne (groupe « tout » ou partie) a un bouton qui défile — → **Principal** (vert plein) → *Secondaire* (contour vert) ; seuls les groupes choisis sont affichés, « + Autre muscle » en ajoute. Rarement utile : les exercices de la banque arrivent déjà renseignés.
- **Catalogue d'exercices** (appelé « banque » dans le code ; dans l'interface : « Catalogue », et « X suggestions » sur les tuiles de muscle) (`js/data/exercise-bank.js`, ~130 exercices, logique `js/domain/bank.js`) : nom FR + EN, matériel, type, muscles principal / secondaires, description. Les exercices du programme de départ y ont le **même id** : ils sont reconnus et complétés (muscles, type, description) sans rien écraser. Ajouter un exercice de la banque crée un exercice de bibliothèque **avec le même id** (identique pour les 3 utilisateurs).
- **Banque commune** (table Supabase `bank`, `js/core/bank-store.js`) : chacun peut partager un exercice personnel depuis sa fiche (« Partager dans la banque commune ») ; visible par tous les connectés, modifiable par son auteur seulement, copie locale pour le hors-ligne. Ne remplace jamais une entrée de la banque intégrée.
- **Bibliothèque par muscle** (`js/ui/exercise-browser.js`) : tuiles par groupe (« 5 à toi · 13 dans la banque ») → dans un groupe, sections par partie (haut / milieu / bas…), mes exercices d'abord (blanc), ceux de la banque ensuite (gris, bouton « + »), polyarticulaires avant isolations ; filtres type et matériel ; « Sollicitent aussi ce muscle » replié. La recherche (FR ou EN, sans accents) court-circuite les groupes. La fenêtre « Ajouter un exercice » des séances propose « Mes exercices » (rapide) ou « Par muscle + banque ».
- Chaque exercice a des notes permanentes et un marqueur « douleur / à éviter » avec commentaire.

### Démarrer une séance (plus de planning imposé)
- On configure ses séances dans l'onglet **Programme** (ajouter, modifier, supprimer des exercices). Pour s'entraîner : Accueil → « Commencer une séance » → **jour** (Aujourd'hui par défaut, Hier, ou Autre jour) → **séance** parmi celles configurées (avec « dernière fois il y a X j »), ou séance libre. Rien n'est présélectionné : on choisit toujours explicitement (retour du 2026-11-11 : un collègue avait démarré la séance proposée par erreur).
- La semaine de l'accueil montre les séances faites (et les sorties de course) ; toucher un jour passé permet d'y ajouter une séance.
- L'ancien planning (jour par défaut de chaque séance, exceptions, « en retard », intervertir / décaler / sauter) n'est **plus affiché**. Ses données (`state.schedule`, logique `js/domain/planning.js`) restent stockées et synchronisées pour compatibilité, et pourraient resservir.

### Séance
- Une séance est une **copie** du modèle : la modifier ne change pas le programme, sauf avec « Définitivement » ou « Mettre à jour le programme » (proposé dans le résumé de fin).
- **Un exercice (ou un superset) par écran.** Boutons fixes en bas : « Précédent », et « Suivant » avec le nom de l'exercice suivant. L'indicateur « Exercice X sur N » ouvre la liste des exercices. Le balayage horizontal est désactivable.
- En cours de séance, on peut réordonner, sauter ou reprendre, ajouter, retirer, grouper ou dégrouper en superset, ajouter ou supprimer des séries, et changer la date.
- **Remplacer un exercice** : « Juste aujourd'hui » ou « Définitivement ». Si des séries sont déjà validées, elles restent attachées à l'exercice d'origine, et le remplaçant prend la suite sur le même écran, dans le même « couloir » du superset.
- **Superset** : les séries s'alternent (A1, B1, A2…) et le repos se lance après le tour complet (réglable).
- Les messages « Annuler » s'affichent **en haut**, sous la barre de titre (jamais sur les boutons du bas ni sur les feuilles) ; toucher ailleurs, ouvrir une feuille ou changer d'écran les ferme.
- Tout reste modifiable jusqu'à la fin de la séance. Après coup, on corrige depuis l'historique, avec un marquage « modifiée après coup ».
- La séance reprend automatiquement si on quitte l'app.
- Résumé de fin : durée, volume, records battus, et une note de séance (sommeil, fatigue, douleur, humeur de 1 à 5, plus un texte libre).

### Saisie
- Champs : charge, reps, repos pris (enregistré automatiquement si le chrono est actif, ignoré au-delà de 15 min, modifiable), RPE (optionnel, désactivé par défaut, purement informatif) et note.
- Types de série : échauffement, normale, dégressive, échec. Les échauffements sont exclus du volume.
- **Dégressives** : plusieurs paliers dans la même série. La charge proposée pour chaque palier (−20 % par défaut) n'est qu'une proposition, toujours modifiable à la main. Le chrono démarre après le dernier palier. Le volume compte tous les paliers ; les records et la progression ne comptent que le premier.
  Si une série est validée moins de 20 s après la précédente avec une charge au moins 15 % plus basse, l'app propose « C'était une dégressive ? → Regrouper ».
- **Échauffement** : bouton « Échauffement » sous les séries (à 50, 70 et 85 % de la charge de travail). Plus de carte « Échauffement proposé » (2026-11-11 : trop de place).
- Calculateur de disques pour les exercices à la barre (poids de la barre et disques disponibles réglables).
- Chrono de repos : −15 s, +15 s, Passer, alerte visuelle et bip en fin de repos. La vibration n'est pas supportée sur iOS. **Désactivable** (Réglages → Saisie → Chrono de repos) pour ceux qui utilisent leur propre chrono ; le réglage suit le compte.
- Bouton « Comme la dernière fois ». Les séries suivantes reprennent la charge réellement validée.

### Progression (tout est dans `js/domain/progression.js`)
- **Augmenter** : si toutes les séries de travail ont atteint le **haut** de la plage (double progression), on ajoute l'incrément et on repart au bas de la plage.
- **Stabiliser** : sinon, même charge, avec un objectif de +1 rep par série.
- **Récup / volume** : charge −10 % (réglable), reps au haut de la plage et une série de plus.
- **Plus de « Forme du jour »** (retirée le 2026-11-11, choix d'Antoine) : faire fluctuer toutes les suggestions selon l'état du jour brouillait les repères. Un jour sans énergie, on choisit « Récup / volume » exercice par exercice. Le questionnaire de fin reste informatif. (`session.form` des anciennes séances est conservé.)
- **Désactivables** (Réglages → Saisie → Suggestions de progression, suit le compte) : coupées, la carte de l'exercice ne montre que « Dernière fois », et les séries reprennent exactement la dernière fois (aucun doublon).
- **Affichage** (retour du 2026-11-11 : un collègue a pris la suggestion pour ce qu'il avait fait ; puis : informations en double) : **une seule carte par exercice** : « Dernière fois · date » (toutes les séries, en petit) puis la **consigne** (Augmenter / Stabiliser / Récup, avec ses chiffres et sa raison en une ligne). Le mode se change derrière « Changer › ». Dans la série en cours, une petite ligne « dernière fois : 60 kg × 12 » (même série, logique `setComparison`), seulement si les suggestions sont activées ; les séries à venir portent la mention « objectif ».
- Les suggestions préremplissent les séries et restent indicatives. Les échauffements et les paliers de dégressive sont ignorés.
- **Référence = même contexte** : un exercice peut être fait en force dans une séance et en volume dans une autre (ex. développé décliné barre). La suggestion se base sur la dernière fois dans la **même séance modèle**, sinon avec la **même plage de reps**, sinon la dernière fois tout court.

### Progrès (dashboard), objectifs et stats
- Onglet **Progrès** (`js/screens/progress.js`, calculs purs dans `js/domain/dashboard.js`) :
  - **Cette semaine** : séances, volume (comparé à la semaine dernière au même stade), records battus (une ligne par exercice) ;
  - **Par séance** : pour la séance choisie, chaque exercice avec sa dernière charge × reps et l'évolution sur 4 semaines (calculée sur le 1RM estimé, affichée en kg) ;
  - **Courbe** : un exercice au choix ; toucher une ligne du tableau l'affiche ;
  - **Objectifs** en bas de l'onglet.
- **Cohérence force / volume** : tendances et courbes sont calculées **séance par séance** (une courbe par séance modèle, la plus fréquente en couleur d'accent, les autres en gris tirets). Le 1RM estimé permet de comparer les deux.
- Records : charge max, meilleur 1RM estimé (Epley), meilleur volume.
- Graphique par exercice (onglet Progrès et fiche exercice) : charge max, 1RM estimé ou volume, une courbe par séance.
- Objectifs de type charge × reps ou 1RM estimé, avec date cible optionnelle. Affichage : barre d'avancement, valeur actuelle et écart restant.

### Course à pied (module optionnel, désactivable)
- Sortie : date, distance, durée et note ; l'allure est calculée. Pas de GPS.
- Historique, courbe d'allure ou de distance, et sorties visibles dans la semaine et le calendrier.
- Plans-types indicatifs et modifiables : débutant (marche / course) et intermédiaire (facile + qualité).

## 5. Conventions de saisie (décisions d'Antoine)
- Poids de corps (Réglages, optionnel) : ajouté à la charge des exercices « poids du corps + lest » dans l'onglet Progrès (volume, 1RM, courbes). Sans lui, la tendance de ces exercices se fait sur les reps.
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
- 2026-11-08 : environnement de test en ligne : dépôt `antoinem13/carnet-muscu-test`, GitHub Pages sur `main` (= branche `sync-supabase`), remote Git local `test`.
- 2026-11-08 : synchro plus réactive (retour d'Antoine : il fallait appuyer sur « Synchroniser ») : vérification toutes les 15 s au lieu de 60 s, et à chaque retour dans la fenêtre. Requêtes sans cache navigateur.
- 2026-11-08 : « Confirm email » reste désactivé en production : l'e-mail intégré de Supabase (gratuit) est limité à 2 envois/heure et ne livre qu'aux membres de l'équipe Supabase, les amis ne pourraient pas confirmer. Mot de passe oublié : suppression du compte, puis recréation.
- 2026-11-08 : étape 1 validée par Antoine sur iPhone et Mac : synchro automatique dans les deux sens sur l'environnement de test.
- 2026-11-08 : retours salle (1) : chrono de repos désactivable ; le message « Annuler » ne masque plus la feuille suivante (suppressions enchaînées) ; suggestion de charge basée sur la même séance (force et volume du même exercice ne se mélangent plus).
- 2026-11-08 : onglet « Progrès » à la place de « Objectifs » (choix d'Antoine : courbes par exercice, tableau par séance, résumé de la semaine ; pas d'alertes de stagnation pour l'instant). Suivi séance par séance pour ne pas mélanger force et volume.
- 2026-11-08 : banque d'exercices : choix « intégrée + ajouts partagés » (banque FR/EN rédigée dans l'app, plus une table Supabase commune pour les ajouts des 3 utilisateurs).
- 2026-11-08 : message « Annuler » déplacé en haut de l'écran (retour d'Antoine : il survolait le bas) ; repère TEST intégré à l'en-tête (la pastille fixe rendait l'en-tête flou).
- 2026-11-08 : correction de la mise à jour bloquée (retour d'Antoine : l'app restait sur l'ancienne version). Cause : `addAll` servait les fichiers depuis la mémoire HTTP du navigateur (GitHub Pages : max-age=600) ; reproduit puis corrigé (`cache: 'reload'`, rechargement automatique à l'ouverture). Le bug existe aussi en production : il sera corrigé par la mise en production.
- 2026-11-08 : analyse de l'export d'Antoine (7 séances) → incréments par matériel et par exercice, poids de corps pour tractions/dips, détection des dégressives saisies à part, repos > 15 min ignoré, fusion d'exercices, fond opaque sous la Dynamic Island. Les plages de reps de son programme (tout en 3 × 8-12 par défaut) sont à ajuster par Antoine dans l'app.
- 2026-11-08 : muscles sur deux niveaux (groupes + parties, principal / secondaires) et type de mouvement, base de la banque d'exercices et de la recherche par filtres. Modèle 3D écarté (dépendance lourde, licence, lenteur) au profit d'une silhouette 2D cliquable, à tenter plus tard.
- 2026-11-08 : banque d'exercices (~130, FR/EN, muscles, type, description) et banque commune ; bibliothèque refaite par groupe puis par partie (retour d'Antoine : la saisie des muscles demandait trop de clics) ; saisie des muscles simplifiée en un écran.
- 2026-11-11 : fin du planning imposé (retour d'Antoine : un collègue a démarré la mauvaise séance, proposée d'office). L'accueil devient « Commencer une séance » : choix du jour puis de la séance, rien de présélectionné. Planning retiré de l'accueil, du Programme et des Réglages (données conservées, non affichées).
- 2026-11-11 : « banque » renommée « Catalogue » dans l'interface (« 6 à toi · 12 suggestions », « Partager dans le catalogue ») : le mot « banque » ne parlait pas aux collègues.
- 2026-11-11 : suggestions de progression désactivables (comme le chrono) et comparaison « Dernière fois / Objectif » sur chaque série (un collègue a confondu la suggestion avec sa séance précédente). Par défaut, les suggestions restent activées.
- 2026-11-11 : jeu de test intégré à la version de test (4 semaines de séances fictives, ajout / retrait en un bouton), à la demande d'Antoine pour voir les suggestions et l'onglet Progrès sans s'entraîner.
- 2026-11-11 : écran d'exercice simplifié (retour d'Antoine) : « Forme du jour » supprimée, une seule carte « Dernière fois + consigne du jour » (mode changeable derrière « Changer »), rappel discret de la dernière fois dans la série, carte d'échauffement remplacée par le bouton « Échauffement ».
