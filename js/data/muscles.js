/**
 * MUSCLES : deux niveaux.
 *  - GROUPES : ce que l'on voit au quotidien (listes, filtres, programme).
 *  - PARTIES : le détail, quand on veut « descendre » (ex. Triceps → longue portion).
 *
 * Un exercice indique ses muscles PRINCIPAUX (1 ou 2) et SECONDAIRES, par
 * identifiant de groupe (« Pectoraux », sans précision) ou de partie
 * (« Haut des pectoraux »). Le libellé `label` d'un groupe est aussi la valeur
 * historique `muscleGroup` des exercices : ne jamais le renommer sans migration.
 *
 * Un groupe sans `parts` est indivisible (ex. Quadriceps).
 */
export const MUSCLE_TREE = [
  { id: 'pectoraux', label: 'Pectoraux', parts: [
    { id: 'pec-haut', label: 'Haut', long: 'Haut des pectoraux' },
    { id: 'pec-milieu', label: 'Milieu', long: 'Milieu des pectoraux' },
    { id: 'pec-bas', label: 'Bas', long: 'Bas des pectoraux' },
  ] },
  { id: 'dos', label: 'Dos', parts: [
    { id: 'dos-largeur', label: 'Grand dorsal (largeur)', long: 'Grand dorsal' },
    { id: 'dos-epaisseur', label: 'Trapèzes, rhomboïdes (épaisseur)', long: 'Milieu du dos' },
    { id: 'lombaires', label: 'Lombaires', long: 'Lombaires' },
  ] },
  { id: 'epaules', label: 'Épaules', parts: [
    { id: 'epaule-avant', label: 'Avant', long: 'Épaule avant' },
    { id: 'epaule-cote', label: 'Côté', long: 'Épaule côté' },
    { id: 'epaule-arriere', label: 'Arrière', long: 'Épaule arrière' },
  ] },
  { id: 'biceps', label: 'Biceps', parts: [
    { id: 'biceps-longue', label: 'Longue portion', long: 'Biceps (longue portion)' },
    { id: 'biceps-courte', label: 'Courte portion', long: 'Biceps (courte portion)' },
    { id: 'brachial', label: 'Brachial', long: 'Brachial' },
  ] },
  { id: 'triceps', label: 'Triceps', parts: [
    { id: 'triceps-longue', label: 'Longue portion', long: 'Triceps (longue portion)' },
    { id: 'triceps-laterale', label: 'Portion latérale', long: 'Triceps (portion latérale)' },
    { id: 'triceps-mediale', label: 'Portion médiale', long: 'Triceps (portion médiale)' },
  ] },
  { id: 'avant-bras', label: 'Avant-bras' },
  { id: 'abdominaux', label: 'Abdominaux', parts: [
    { id: 'grand-droit', label: 'Grand droit', long: 'Abdominaux (grand droit)' },
    { id: 'obliques', label: 'Obliques', long: 'Obliques' },
  ] },
  { id: 'quadriceps', label: 'Quadriceps' },
  { id: 'ischio', label: 'Ischio-jambiers' },
  { id: 'fessiers', label: 'Fessiers', parts: [
    { id: 'grand-fessier', label: 'Grand fessier', long: 'Grand fessier' },
    { id: 'moyen-fessier', label: 'Moyen fessier (abducteurs)', long: 'Moyen fessier' },
  ] },
  { id: 'adducteurs', label: 'Adducteurs' },
  { id: 'mollets', label: 'Mollets' },
  { id: 'autre', label: 'Autre' },
];

/** Types de mouvement. */
export const MECHANICS = [
  { value: 'poly', label: 'Polyarticulaire', help: 'Plusieurs articulations, mouvement de base (développé, squat, tirage…)' },
  { value: 'iso', label: 'Isolation', help: 'Une articulation, cible un muscle (curl, extension, élévation…)' },
];
