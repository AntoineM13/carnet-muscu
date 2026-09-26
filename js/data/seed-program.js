/**
 * PROGRAMME ET PLANNING DE DÉPART
 * ================================
 * Ce fichier ne contient QUE des données : il est chargé au premier lancement
 * si l'on choisit « Programme pré-rempli ». Il peut être édité librement
 * (ajouter un exercice, changer un nombre de séries, un jour…) sans toucher
 * à la logique de l'application.
 *
 * Règles :
 *  - Les `id` doivent rester STABLES : l'historique est rattaché à l'id de
 *    l'exercice, pas à son nom. Si vous partagez le programme avec un collègue,
 *    des id identiques garantissent que l'import ne casse pas son historique.
 *  - `name`      = l'intitulé affiché (le vôtre).
 *  - `standard`  = le nom standardisé proposé dans la bibliothèque.
 *  - `loadMode`  = 'charge' (kg sur la barre / par haltère / machine)
 *                  ou 'lest' (poids du corps : 0 = sans lest, négatif = assistance).
 *  - `unilateral`= true : les reps saisies s'entendent PAR CÔTÉ.
 *  - `equipment` = 'barre' | 'halteres' | 'machine' | 'poulie' | 'pdc' | 'autre'
 *                  (la barre active le calculateur de disques ;
 *                   'halteres' : charge saisie PAR HALTÈRE).
 *
 * Valeurs par défaut d'un emplacement (modifiables emplacement par emplacement) :
 * 3 séries, 8-12 reps, repos 90 s, incrément 2,5 kg.
 */

const D = { sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 2.5 };

export const SEED_VERSION = 1;

/** Bibliothèque d'exercices. */
export const SEED_EXERCISES = [
  // Pectoraux
  { id: 'ex-dev-decline-barre', name: 'Développé décliné barre', standard: 'Développé couché décliné à la barre', muscleGroup: 'Pectoraux', equipment: 'barre', loadMode: 'charge' },
  { id: 'ex-dev-incline-halteres', name: 'Développé incliné haltères', standard: 'Développé incliné aux haltères', muscleGroup: 'Pectoraux', equipment: 'halteres', loadMode: 'charge' },
  { id: 'ex-dev-incline', name: 'Développé incliné', standard: 'Développé incliné (barre ou machine)', muscleGroup: 'Pectoraux', equipment: 'barre', loadMode: 'charge' },
  { id: 'ex-ecarte-poulie', name: 'Écarté poulie', standard: 'Écarté à la poulie vis-à-vis', muscleGroup: 'Pectoraux', equipment: 'poulie', loadMode: 'charge' },
  { id: 'ex-dips', name: 'Dips', standard: 'Dips aux barres parallèles', muscleGroup: 'Pectoraux', equipment: 'pdc', loadMode: 'lest' },
  // Dos
  { id: 'ex-traction', name: 'Traction', standard: 'Tractions en pronation', muscleGroup: 'Dos', equipment: 'pdc', loadMode: 'lest' },
  { id: 'ex-bucheron', name: 'Bûcheron haltère', standard: "Rowing unilatéral à l'haltère", muscleGroup: 'Dos', equipment: 'halteres', loadMode: 'charge', unilateral: true },
  { id: 'ex-rowing-banc', name: 'Rowing banc', standard: 'Rowing buste appuyé sur banc incliné', muscleGroup: 'Dos', equipment: 'halteres', loadMode: 'charge' },
  { id: 'ex-tirage-une-main-poulie', name: 'Tirage dos une main poulie', standard: 'Tirage unilatéral à la poulie', muscleGroup: 'Dos', equipment: 'poulie', loadMode: 'charge', unilateral: true },
  // Jambes
  { id: 'ex-hack-squat', name: 'Hack squat', standard: 'Hack squat à la machine', muscleGroup: 'Quadriceps', equipment: 'machine', loadMode: 'charge' },
  { id: 'ex-squat-bulgare', name: 'Squat bulgare', standard: 'Fente bulgare', muscleGroup: 'Quadriceps', equipment: 'halteres', loadMode: 'charge', unilateral: true },
  { id: 'ex-leg-extension', name: 'Leg extension', standard: 'Extension des jambes à la machine', muscleGroup: 'Quadriceps', equipment: 'machine', loadMode: 'charge' },
  { id: 'ex-leg-curl', name: 'Leg curl', standard: 'Flexion des jambes à la machine', muscleGroup: 'Ischio-jambiers', equipment: 'machine', loadMode: 'charge' },
  { id: 'ex-mollets', name: 'Mollets', standard: 'Extension des mollets', muscleGroup: 'Mollets', equipment: 'machine', loadMode: 'charge' },
  // Bras
  { id: 'ex-curl-banc', name: 'Curl banc', standard: 'Curl incliné sur banc aux haltères', muscleGroup: 'Biceps', equipment: 'halteres', loadMode: 'charge' },
  { id: 'ex-skull-crusher', name: 'Skull crusher', standard: 'Barre au front', muscleGroup: 'Triceps', equipment: 'barre', loadMode: 'charge' },
  { id: 'ex-curl-pupitre-poulie', name: 'Curl pupitre poulie', standard: 'Curl pupitre à la poulie', muscleGroup: 'Biceps', equipment: 'poulie', loadMode: 'charge' },
  { id: 'ex-dips-machine', name: 'Dips machine assis', standard: 'Dips assis à la machine', muscleGroup: 'Triceps', equipment: 'machine', loadMode: 'charge' },
  { id: 'ex-curl-marteau', name: 'Curl marteau', standard: 'Curl marteau aux haltères', muscleGroup: 'Biceps', equipment: 'halteres', loadMode: 'charge' },
  { id: 'ex-pushdown-corde', name: 'Push down corde poulie', standard: 'Extension des triceps à la poulie haute, corde', muscleGroup: 'Triceps', equipment: 'poulie', loadMode: 'charge' },
  // Épaules
  { id: 'ex-elevations-laterales', name: 'Élévations latérales', standard: 'Élévations latérales aux haltères', muscleGroup: 'Épaules', equipment: 'halteres', loadMode: 'charge' },
  { id: 'ex-arriere-epaule', name: "Arrière d'épaule", standard: 'Oiseau (deltoïde postérieur)', muscleGroup: 'Épaules', equipment: 'halteres', loadMode: 'charge' },
];

/* Petits constructeurs pour garder les séances lisibles. */
const single = (id, exerciseId, opts = {}) => ({
  id, kind: 'single',
  slots: [{ id: `${id}-a`, exerciseId, alternatives: opts.alternatives || [], ...D, ...opts.params }],
});
const superset = (id, exA, exB, params = {}) => ({
  id, kind: 'superset',
  slots: [
    { id: `${id}-a`, exerciseId: exA, alternatives: [], ...D, ...params },
    { id: `${id}-b`, exerciseId: exB, alternatives: [], ...D, ...params },
  ],
});

/** Séances modèles (dans l'ordre d'affichage). */
export const SEED_TEMPLATES = [
  {
    id: 'tpl-pec-dos', name: 'Pec/Dos',
    blocks: [
      single('b-pd-1', 'ex-dev-decline-barre'),
      single('b-pd-2', 'ex-traction'),
      single('b-pd-3', 'ex-dev-incline-halteres'),
      single('b-pd-4', 'ex-bucheron'),
      single('b-pd-5', 'ex-ecarte-poulie'),
    ],
  },
  {
    id: 'tpl-jambes', name: 'Jambes',
    blocks: [
      single('b-j-1', 'ex-hack-squat'),
      single('b-j-2', 'ex-squat-bulgare'),
      single('b-j-3', 'ex-leg-extension'),
      single('b-j-4', 'ex-leg-curl'),
      single('b-j-5', 'ex-mollets'),
    ],
  },
  {
    id: 'tpl-dos-pec', name: 'Dos/Pec',
    blocks: [
      single('b-dp-1', 'ex-traction'),
      single('b-dp-2', 'ex-dips'),
      // Emplacement à alternatives : on choisit au moment de la séance.
      single('b-dp-3', 'ex-bucheron', { alternatives: ['ex-rowing-banc'] }),
      single('b-dp-4', 'ex-dev-incline'),
      single('b-dp-5', 'ex-tirage-une-main-poulie'),
    ],
  },
  {
    id: 'tpl-bras-epaules', name: 'Bras/Épaules',
    blocks: [
      superset('b-be-1', 'ex-curl-banc', 'ex-skull-crusher'),
      superset('b-be-2', 'ex-curl-pupitre-poulie', 'ex-dips-machine'),
      superset('b-be-3', 'ex-curl-marteau', 'ex-pushdown-corde'),
      superset('b-be-4', 'ex-elevations-laterales', 'ex-arriere-epaule'),
    ],
  },
];

/**
 * Planning par défaut : jour ISO (1 = lundi … 7 = dimanche) -> id de séance.
 * Un jour absent = repos.
 */
export const SEED_DEFAULT_SCHEDULE = {
  3: 'tpl-pec-dos',      // mercredi
  5: 'tpl-jambes',       // vendredi
  6: 'tpl-dos-pec',      // samedi
  7: 'tpl-bras-epaules', // dimanche
};
