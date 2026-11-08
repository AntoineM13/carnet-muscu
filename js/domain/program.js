/**
 * Opérations sur le programme (séances modèles) et la bibliothèque.
 * Fonctions pures : elles modifient l'objet passé, l'appelant sauvegarde.
 */
import { uid } from '../core/util.js';
import { DEFAULT_SETTINGS } from '../data/defaults.js';

/**
 * Incrément (kg) d'un exercice : la valeur de sa fiche si elle est fixée,
 * sinon celle de son matériel (Réglages), sinon l'incrément par défaut.
 */
export function effectiveIncrement(exercise, settings) {
  if (exercise?.increment != null) return exercise.increment;
  const byEq = { ...DEFAULT_SETTINGS.increments, ...(settings?.increments || {}) };
  return byEq[exercise?.equipment] ?? settings?.defaultIncrement ?? 2.5;
}

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

/**
 * FUSION de deux exercices (doublons, ou rattachement à la banque) :
 * tout ce qui pointe vers `fromId` pointe désormais vers `toId` :
 * historique des séances, programme (emplacements et alternatives),
 * objectifs. Notes et douleur de `fromId` sont reportées sur `toId`.
 * Fonction pure : modifie les objets passés et retourne ce qui a changé ;
 * l'appelant enregistre, puis supprime l'exercice `fromId`.
 * @returns {{ sessions:object[], templates:object[], goals:object[], target:object, historyCount:number }}
 */
export function mergeExercises({ sessions, templates, goals, from, to }) {
  const fromId = from.id; const toId = to.id;
  const changed = { sessions: [], templates: [], goals: [], target: to, historyCount: 0 };
  if (fromId === toId) return changed;
  const swapList = (list) => [...new Set((list || []).map((id) => (id === fromId ? toId : id)))];
  for (const s of sessions) {
    let touched = false;
    for (const it of s.items) {
      if (it.exerciseId === fromId) { it.exerciseId = toId; touched = true; }
      if (it.replacedBy === fromId) { it.replacedBy = toId; touched = true; }
      if (it.alternatives?.includes(fromId)) { it.alternatives = swapList(it.alternatives); touched = true; }
    }
    if (touched) { changed.sessions.push(s); if (s.status === 'done') changed.historyCount += 1; }
  }
  for (const t of templates) {
    let touched = false;
    for (const b of t.blocks || []) {
      for (const sl of b.slots || []) {
        if (sl.exerciseId === fromId) { sl.exerciseId = toId; touched = true; }
        if (sl.alternatives?.includes(fromId)) { sl.alternatives = swapList(sl.alternatives); touched = true; }
        if (sl.alternatives?.includes(sl.exerciseId)) { sl.alternatives = sl.alternatives.filter((a) => a !== sl.exerciseId); touched = true; }
      }
    }
    if (touched) changed.templates.push(t);
  }
  for (const g of goals) if (g.exerciseId === fromId) { g.exerciseId = toId; changed.goals.push(g); }
  const notes = [to.notes, from.notes].map((x) => (x || '').trim()).filter(Boolean);
  to.notes = [...new Set(notes)].join('\n');
  if (from.pain?.active && !to.pain?.active) to.pain = { ...from.pain };
  if (to.archived) to.archived = false;
  return changed;
}
