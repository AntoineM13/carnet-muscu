/**
 * Sections additionnelles de l'accueil (modules optionnels, ex. course à pied).
 * Retourne une liste de nœuds à afficher sous « Cette semaine ».
 */
import { runsHomeCard } from './runs.js';

export function homeExtras(today) {
  return [runsHomeCard(today)];
}
