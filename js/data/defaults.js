/**
 * Valeurs par défaut des réglages et listes de référence.
 * Les réglages de l'utilisateur sont fusionnés par-dessus ces valeurs
 * (une nouvelle clé ajoutée ici sera donc disponible sans migration).
 */

export const DEFAULT_SETTINGS = {
  // Saisie
  rpeEnabled: false,          // RPE optionnel, désactivé par défaut
  swipeEnabled: true,         // balayage horizontal entre exercices
  soundEnabled: true,         // bip discret en fin de repos
  // Valeurs par défaut d'un nouvel exercice dans le programme
  defaultSets: 3,
  defaultRepMin: 8,
  defaultRepMax: 12,
  defaultRestSec: 90,
  defaultIncrement: 2.5,
  // Supersets : lancer le repos après chaque tour complet (A1+B1)
  supersetRestAfterRound: true,
  // Progression
  recupPct: 10,               // mode « Récup / volume » : charge −10 %
  // Dégressives : PROPOSITION de réduction par palier (jamais imposée)
  dropPct: 20,
  // Échauffement : paliers en % de la charge de travail
  warmupSteps: [
    { pct: 50, reps: 10 },
    { pct: 70, reps: 6 },
    { pct: 85, reps: 3 },
  ],
  // Calculateur de disques
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  // Course à pied (module optionnel)
  runsEnabled: true,
  runsPerWeek: 2,
  runPlans: null,           // null = plans-types de js/data/run-plans.js
  activeRunPlanId: null,
  runPlanStart: null,
  // Sauvegarde
  lastExportAt: null,
  exportReminderDays: 7,
};

export const MUSCLE_GROUPS = [
  'Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Avant-bras',
  'Quadriceps', 'Ischio-jambiers', 'Fessiers', 'Mollets', 'Abdominaux', 'Autre',
];

export const EQUIPMENTS = [
  { value: 'barre', label: 'Barre' },
  { value: 'halteres', label: 'Haltères (charge par haltère)' },
  { value: 'machine', label: 'Machine' },
  { value: 'poulie', label: 'Poulie' },
  { value: 'pdc', label: 'Poids du corps' },
  { value: 'autre', label: 'Autre' },
];

/** Types de série. `counts` = compte dans les stats de volume. */
export const SET_TYPES = {
  echauffement: { label: 'Échauffement', short: 'É', counts: false },
  normale: { label: 'Normale', short: '', counts: true },
  degressive: { label: 'Dégressive', short: 'D', counts: true },
  echec: { label: 'Échec', short: 'X', counts: true },
};
