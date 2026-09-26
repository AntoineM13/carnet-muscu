/**
 * Opérations sur le programme (séances modèles) et la bibliothèque.
 * Fonctions pures : elles modifient l'objet passé, l'appelant sauvegarde.
 */
import { uid } from '../core/util.js';

export function newTemplate(name, order = 0) {
  return { id: uid('tpl'), name, order, blocks: [] };
}

export function newSlot(exerciseId, settings) {
  return {
    id: uid('slot'), exerciseId, alternatives: [],
    sets: settings.defaultSets, repMin: settings.defaultRepMin, repMax: settings.defaultRepMax,
    restSec: settings.defaultRestSec, increment: settings.defaultIncrement,
  };
}

export function addExerciseBlock(template, exerciseId, settings) {
  template.blocks.push({ id: uid('blk'), kind: 'single', slots: [newSlot(exerciseId, settings)] });
}

export function moveBlock(template, index, dir) {
  const j = index + dir;
  if (j < 0 || j >= template.blocks.length) return;
  [template.blocks[index], template.blocks[j]] = [template.blocks[j], template.blocks[index]];
}

/** Regroupe un bloc avec le suivant en superset. */
export function groupWithNext(template, index) {
  const a = template.blocks[index]; const b = template.blocks[index + 1];
  if (!a || !b) return;
  a.slots.push(...b.slots);
  a.kind = 'superset';
  template.blocks.splice(index + 1, 1);
}

/** Sépare un superset en exercices simples. */
export function ungroup(template, index) {
  const blk = template.blocks[index];
  if (!blk || blk.slots.length < 2) return;
  const singles = blk.slots.map((s) => ({ id: uid('blk'), kind: 'single', slots: [s] }));
  template.blocks.splice(index, 1, ...singles);
}

export function removeSlot(template, blockIndex, slotIndex) {
  const blk = template.blocks[blockIndex];
  if (!blk) return;
  blk.slots.splice(slotIndex, 1);
  if (!blk.slots.length) template.blocks.splice(blockIndex, 1);
  else if (blk.slots.length === 1) blk.kind = 'single';
}

export function moveSlot(template, blockIndex, slotIndex, dir) {
  const slots = template.blocks[blockIndex]?.slots;
  const j = slotIndex + dir;
  if (!slots || j < 0 || j >= slots.length) return;
  [slots[slotIndex], slots[j]] = [slots[j], slots[slotIndex]];
}

export function findSlot(template, slotId) {
  for (let b = 0; b < template.blocks.length; b++) {
    const s = template.blocks[b].slots.findIndex((x) => x.id === slotId);
    if (s >= 0) return { block: template.blocks[b], blockIndex: b, slot: template.blocks[b].slots[s], slotIndex: s };
  }
  return null;
}

/** Tous les ids d'exercices utilisés par un modèle (alternatives comprises). */
export function templateExerciseIds(template) {
  return template.blocks.flatMap((b) => b.slots.flatMap((s) => [s.exerciseId, ...(s.alternatives || [])]));
}

export function newExercise(fields = {}) {
  return {
    id: uid('ex'), name: fields.name || 'Nouvel exercice', standard: fields.standard || '',
    muscleGroup: fields.muscleGroup || 'Autre', equipment: fields.equipment || 'machine',
    loadMode: fields.loadMode || 'charge', unilateral: !!fields.unilateral,
    notes: '', pain: { active: false, comment: '' }, archived: false,
  };
}

/** Complète un exercice venant du seed ou d'un import avec les champs manquants. */
export function normalizeExercise(e) {
  return {
    notes: '', pain: { active: false, comment: '' }, archived: false,
    standard: '', unilateral: false, loadMode: 'charge', equipment: 'machine', muscleGroup: 'Autre',
    ...e,
  };
}
