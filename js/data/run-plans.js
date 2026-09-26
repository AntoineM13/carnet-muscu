/**
 * PLANS-TYPES DE COURSE À PIED (indicatifs, modifiables dans l'app).
 * Chaque plan : des semaines, chaque semaine : 1 à 2 sorties décrites en texte libre.
 * Ces plans ne remplacent pas l'avis d'un professionnel : ils servent de repère.
 */
export const RUN_PLANS = [
  {
    id: 'plan-debutant',
    name: 'Débutant · marche / course',
    level: 'Débutant',
    description: 'Alternance marche / course progressive sur 8 semaines, jusqu’à 25-30 min de course continue. 2 sorties par semaine.',
    weeks: [
      { sessions: ['8 × (1 min course + 2 min marche)', '8 × (1 min course + 2 min marche)'] },
      { sessions: ['6 × (2 min course + 2 min marche)', '6 × (2 min course + 2 min marche)'] },
      { sessions: ['5 × (3 min course + 2 min marche)', '5 × (3 min course + 1 min 30 marche)'] },
      { sessions: ['4 × (5 min course + 2 min marche)', '4 × (5 min course + 1 min 30 marche)'] },
      { sessions: ['3 × (8 min course + 2 min marche)', '3 × (8 min course + 1 min marche)'] },
      { sessions: ['2 × (12 min course + 2 min marche)', '15 min course + 2 min marche + 8 min course'] },
      { sessions: ['20 min de course continue', '2 × (12 min course + 1 min marche)'] },
      { sessions: ['25 min de course continue', '25 à 30 min de course continue'] },
    ],
  },
  {
    id: 'plan-intermediaire',
    name: 'Intermédiaire · facile + qualité',
    level: 'Intermédiaire',
    description: '1 sortie facile (aisance respiratoire) + 1 sortie de qualité, en alternant fractionné et tempo. Cycle de 4 semaines à répéter.',
    weeks: [
      { sessions: ['Facile : 35 min en aisance', 'Fractionné : 15 min échauffement, 8 × 400 m vite / 1 min 30 récup, 10 min retour au calme'] },
      { sessions: ['Facile : 40 min en aisance', 'Tempo : 15 min échauffement, 15 min allure soutenue, 10 min retour au calme'] },
      { sessions: ['Facile : 40 min en aisance', 'Fractionné : 15 min échauffement, 5 × 1000 m / 2 min récup, 10 min retour au calme'] },
      { sessions: ['Facile : 30 min (semaine plus légère)', 'Tempo : 15 min échauffement, 2 × 10 min soutenu / 3 min récup, 10 min retour au calme'] },
    ],
  },
];
