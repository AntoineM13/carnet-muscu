/**
 * BANQUE D'EXERCICES : fonctions pures.
 *
 * Deux sources, même format d'entrée (voir js/data/exercise-bank.js) :
 *  - la banque intégrée (EXERCISE_BANK), identique pour tous ;
 *  - la banque commune (ajouts des utilisateurs, table Supabase `bank`).
 *
 * Un exercice de la bibliothèque est « lié » à une entrée de banque quand il a
 * le même id (ou `bankId`). On complète alors ses infos manquantes (muscles,
 * type, description) sans jamais écraser ce que l'utilisateur a saisi.
 */
import { EXERCISE_BANK } from '../data/exercise-bank.js';
import { MUSCLE_TREE } from '../data/muscles.js';
import { groupOf, exerciseMuscles, worksMuscle } from './muscles.js';
import { norm } from '../core/util.js';

/** Index des entrées : intégrées d'abord, puis communes (sans écraser un id intégré). */
export function buildBankIndex(shared = []) {
  const map = new Map(EXERCISE_BANK.map((b) => [b.id, { ...b, source: 'app' }]));
  for (const b of shared) if (b?.id && b.fr && !map.has(b.id)) map.set(b.id, { ...b, source: 'commune' });
  return map;
}

/** Entrée de banque liée à un exercice (même id ou bankId). */
export function bankEntryFor(e, index) {
  return index.get(e?.bankId) || index.get(e?.id) || null;
}

/** Vue complète d'un exercice : ses champs, complétés par sa banque. */
export function enrichExercise(e, index) {
  const b = bankEntryFor(e, index);
  if (!b) return e;
  return {
    ...e,
    muscles: e.muscles?.primary?.length ? e.muscles : { primary: b.p, secondary: b.s || [] },
    mechanic: e.mechanic ?? b.mech ?? null,
    description: e.description || b.d || '',
    en: b.en,
    inBank: b.source,
  };
}

/** Libellé du groupe principal d'une entrée. */
function groupLabelOf(id) {
  return MUSCLE_TREE.find((g) => g.id === groupOf(id))?.label || 'Autre';
}

/** Nouvel exercice de bibliothèque créé depuis une entrée de banque (même id). */
export function exerciseFromBank(b) {
  return {
    id: b.id, bankId: b.id, name: b.fr, standard: b.en || '',
    muscleGroup: groupLabelOf(b.p?.[0]), equipment: b.eq || 'autre',
    loadMode: b.lest || b.eq === 'pdc' ? 'lest' : 'charge', unilateral: !!b.uni,
    muscles: { primary: [...(b.p || [])], secondary: [...(b.s || [])] }, mechanic: b.mech || null,
    description: b.d || '', notes: '', pain: { active: false, comment: '' }, archived: false,
  };
}

/** Entrée de banque commune proposée à partir d'un exercice personnel. */
export function bankEntryFromExercise(e) {
  const { primary, secondary } = exerciseMuscles(e);
  return {
    id: e.id, fr: e.name, en: e.standard || '', eq: e.equipment || 'autre', mech: e.mechanic || null,
    p: primary, s: secondary, d: (e.description || '').trim(),
    ...(e.unilateral ? { uni: true } : {}), ...(e.loadMode === 'lest' ? { lest: true } : {}),
  };
}

/** Vue « exercice » d'une entrée de banque (pour les fonctions de muscles). */
const asExercise = (b) => ({ muscles: { primary: b.p || [], secondary: b.s || [] }, muscleGroup: groupLabelOf(b.p?.[0]) });

/**
 * Recherche / filtres, sur des éléments { kind:'mine'|'bank', ex, entry }.
 * Ne garde que les entrées de banque pas encore dans la bibliothèque.
 * @param {object} f { q, group, part, mechanic, equipment, level:'primary'|'any' }
 */
export function catalog(exercises, index, f = {}) {
  const mine = exercises.filter((e) => !e.archived).map((e) => {
    const ex = enrichExercise(e, index);
    return { kind: 'mine', id: e.id, name: e.name, ex, mech: ex.mechanic, eq: e.equipment, search: `${e.name} ${e.standard || ''} ${ex.en || ''}` };
  });
  const owned = new Set(exercises.flatMap((e) => [e.id, e.bankId].filter(Boolean)));
  const bank = [...index.values()].filter((b) => !owned.has(b.id)).map((b) => ({
    kind: 'bank', id: b.id, name: b.fr, ex: asExercise(b), entry: b, mech: b.mech, eq: b.eq, search: `${b.fr} ${b.en || ''}`,
  }));
  const q = norm(f.q || '');
  const target = f.part || f.group || null;
  return [...mine, ...bank].filter((it) => {
    if (q && !q.split(/\s+/).every((w) => norm(it.search).includes(w))) return false;
    if (target && !worksMuscle(it.ex, target, f.level || 'primary')) return false;
    if (f.mechanic && it.mech !== f.mechanic) return false;
    if (f.equipment && it.eq !== f.equipment) return false;
    return true;
  });
}

/** Tri : mes exercices d'abord, puis polyarticulaires, puis par nom. */
export function sortCatalog(items) {
  const rank = (it) => (it.kind === 'mine' ? 0 : 2) + (it.mech === 'poly' ? 0 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr'));
}

/**
 * Découpe les exercices d'un groupe en sections par partie de muscle
 * (selon leur muscle PRINCIPAL). Les exercices décrits par le groupe seul
 * vont dans « Sans précision ». Les exercices qui ne travaillent ce groupe
 * qu'en secondaire sont à part (`also`).
 */
export function sectionsForGroup(groupId, items) {
  const g = MUSCLE_TREE.find((x) => x.id === groupId);
  const parts = g?.parts || [];
  const sections = parts.map((p) => ({ id: p.id, label: p.long || p.label, items: [] }));
  const generic = { id: groupId, label: parts.length ? 'Sans précision' : g?.label || '', items: [] };
  const also = [];
  for (const it of items) {
    const { primary } = exerciseMuscles(it.ex);
    const here = primary.filter((m) => groupOf(m) === groupId);
    if (!here.length) { if (worksMuscle(it.ex, groupId, 'any')) also.push(it); continue; }
    let placed = false;
    for (const m of here) {
      const sec = sections.find((s) => s.id === m);
      if (sec) { sec.items.push(it); placed = true; }
    }
    if (!placed) generic.items.push(it);
  }
  const out = [...sections, generic].filter((s) => s.items.length).map((s) => ({ ...s, items: sortCatalog(s.items) }));
  return { sections: out, also: sortCatalog(also) };
}

/** Nombre d'exercices (à moi / dans la banque) par groupe principal. */
export function countsByGroup(items) {
  const counts = {};
  for (const it of items) {
    const gs = new Set(exerciseMuscles(it.ex).primary.map(groupOf));
    for (const g of gs) {
      counts[g] ||= { mine: 0, bank: 0 };
      counts[g][it.kind === 'mine' ? 'mine' : 'bank'] += 1;
    }
  }
  return counts;
}
