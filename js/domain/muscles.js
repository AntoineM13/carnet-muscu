/**
 * Muscles d'un exercice : fonctions pures autour de js/data/muscles.js.
 *
 * Modèle (champs optionnels, rétrocompatibles) :
 *   exercise.muscleGroup : libellé du groupe principal (champ historique, toujours tenu à jour)
 *   exercise.muscles     : { primary: [id], secondary: [id] }  (id de groupe ou de partie)
 *   exercise.mechanic    : 'poly' | 'iso' | null
 * Un exercice sans `muscles` est décrit par son seul `muscleGroup`.
 */
import { MUSCLE_TREE } from '../data/muscles.js';

const groupById = new Map(MUSCLE_TREE.map((g) => [g.id, g]));
const partById = new Map(MUSCLE_TREE.flatMap((g) => (g.parts || []).map((p) => [p.id, { ...p, group: g.id }])));
const groupByLabel = new Map(MUSCLE_TREE.map((g) => [g.label, g]));

export const isGroup = (id) => groupById.has(id);
export const isPart = (id) => partById.has(id);

/** Groupe d'un identifiant (groupe ou partie). */
export function groupOf(id) {
  if (groupById.has(id)) return id;
  return partById.get(id)?.group || null;
}

/** Libellé lisible : « Triceps », ou « Triceps (longue portion) » pour une partie. */
export function muscleLabel(id) {
  if (groupById.has(id)) return groupById.get(id).label;
  return partById.get(id)?.long || id;
}

/** Libellé court d'une partie dans son groupe : « Longue portion ». */
export function partLabel(id) {
  return partById.get(id)?.label || muscleLabel(id);
}

/** Identifiant du groupe correspondant au champ historique `muscleGroup`. */
export function groupIdFromLabel(label) {
  return groupByLabel.get(label)?.id || 'autre';
}

/** Muscles d'un exercice, en tenant compte des anciens exercices (groupe seul). */
export function exerciseMuscles(e) {
  const primary = e?.muscles?.primary?.length ? e.muscles.primary : [groupIdFromLabel(e?.muscleGroup)];
  const secondary = (e?.muscles?.secondary || []).filter((id) => !primary.includes(id));
  return { primary, secondary };
}

/** Groupe principal d'un exercice (identifiant). */
export function mainGroup(e) {
  return groupOf(exerciseMuscles(e).primary[0]) || 'autre';
}

/** Tous les groupes touchés (principaux d'abord), sans doublon. */
export function groupsOf(e) {
  const { primary, secondary } = exerciseMuscles(e);
  return [...new Set([...primary, ...secondary].map(groupOf).filter(Boolean))];
}

/**
 * L'exercice travaille-t-il ce muscle ?
 * Un groupe englobe ses parties ; une partie demandée correspond aussi à un
 * exercice décrit seulement par son groupe (on ne sait pas, on ne l'exclut pas).
 * @param {'primary'|'any'} level
 */
export function worksMuscle(e, id, level = 'any') {
  const { primary, secondary } = exerciseMuscles(e);
  const list = level === 'primary' ? primary : [...primary, ...secondary];
  if (isGroup(id)) return list.some((m) => groupOf(m) === id);
  return list.some((m) => m === id || (isGroup(m) && m === groupOf(id)));
}

/**
 * Applique une nouvelle sélection de muscles et tient à jour `muscleGroup`.
 * Principaux : 2 au maximum. Un muscle ne peut pas être à la fois principal et secondaire.
 */
export function setMuscles(e, { primary, secondary }) {
  const p = [...new Set(primary)].slice(0, 2);
  const s = [...new Set(secondary)].filter((id) => !p.includes(id));
  e.muscles = { primary: p, secondary: s };
  const g = groupOf(p[0]);
  if (g) e.muscleGroup = groupById.get(g).label;
  return e;
}

/** Résumé court : « Pectoraux (bas) · aussi : Triceps, Épaule avant ». */
export function musclesSummary(e) {
  const { primary, secondary } = exerciseMuscles(e);
  const fmt = (id) => (isPart(id) ? `${groupById.get(groupOf(id)).label} (${partLabel(id).toLowerCase()})` : muscleLabel(id));
  const main = primary.map(fmt).join(', ');
  return secondary.length ? `${main} · aussi : ${secondary.map(muscleLabel).join(', ')}` : main;
}
