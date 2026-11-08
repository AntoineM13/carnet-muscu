/**
 * SÉANCE EN COURS : création et opérations (fonctions pures sur l'objet séance).
 *
 * Une séance est une COPIE du modèle : la modifier ne touche jamais le
 * programme, sauf action explicite (« Définitivement », « Mettre à jour le programme »).
 *
 * Structure :
 *  session = { id, date, startedAt, endedAt, status: 'active'|'done', templateId,
 *              plannedItemId, form, currentStep, editedAfterFinish, note, rest, items: [item] }
 *  item    = { id, exerciseId, slotId, alternatives, groupId, skipped, mode,
 *              target: { sets, repMin, repMax, restSec, increment }, sets: [set] }
 *  set     = { id, type, done, doneAt, restTakenSec, rpe, note, stages: [{ load, reps }] }
 *
 * Navigation : un « step » (écran) = un exercice seul, ou tous les exercices
 * d'un superset (items consécutifs partageant le même groupId).
 */
import { uid, clone } from '../core/util.js';
import { prefillSets } from './progression.js';
import { proposeDropLoad } from './tools.js';

export function newSet(load = null, reps = null, type = 'normale') {
  return { id: uid('set'), type, done: false, doneAt: null, restTakenSec: null, rpe: null, note: '', stages: [{ load, reps }] };
}

export function targetFrom(src, settings) {
  return {
    sets: src?.sets ?? settings.defaultSets,
    repMin: src?.repMin ?? settings.defaultRepMin,
    repMax: src?.repMax ?? settings.defaultRepMax,
    restSec: src?.restSec ?? settings.defaultRestSec,
    increment: src?.increment ?? settings.defaultIncrement,
  };
}

/** Crée un item de séance avec ses séries préremplies. */
export function newItem({ exerciseId, target, slotId = null, alternatives = [], groupId = null, ctx }) {
  const exercise = ctx.getExercise(exerciseId);
  const values = ctx.prefill
    ? ctx.prefill(exerciseId, target)
    : prefillSets(exerciseId, target.sets, ctx.sessions, {
      exercise, target, form: ctx.form || 'normal', settings: ctx.settings, mode: ctx.mode || null,
      templateId: ctx.session?.templateId || null, excludeSessionId: ctx.session?.id || null,
    });
  return {
    id: uid('it'), exerciseId, slotId, alternatives, groupId, skipped: false, mode: null,
    target: { ...target },
    sets: values.map((v) => newSet(v.load, v.reps)),
  };
}

/** Dernière alternative choisie pour un emplacement (pour la reproposer). */
function lastChoiceForSlot(slot, sessions) {
  const all = [slot.exerciseId, ...(slot.alternatives || [])];
  const past = sessions
    .filter((s) => s.status === 'done')
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((s) => s.items)
    .find((it) => it.slotId === slot.id && all.includes(it.exerciseId));
  return past?.exerciseId || slot.exerciseId;
}

/**
 * Crée une séance à partir d'un modèle (ou vide si template = null).
 * ctx = { getExercise, sessions, settings, prefill? }
 */
export function createSession({ template = null, date, plannedItemId = null, form = 'normal', ctx }) {
  const session = {
    id: uid('ses'), date, startedAt: new Date().toISOString(), endedAt: null,
    status: 'active', templateId: template?.id || null, templateName: template?.name || 'Séance libre',
    plannedItemId, form, currentStep: 0, editedAfterFinish: false,
    note: { sommeil: null, fatigue: null, douleur: null, humeur: null, texte: '' },
    rest: null, items: [],
  };
  for (const block of template?.blocks || []) {
    const groupId = block.kind === 'superset' && block.slots.length > 1 ? uid('grp') : null;
    for (const slot of block.slots) {
      if (!ctx.getExercise(slot.exerciseId)) continue;
      const exerciseId = lastChoiceForSlot(slot, ctx.sessions);
      session.items.push(newItem({
        exerciseId, target: targetFrom(slot, ctx.settings), slotId: slot.id,
        alternatives: [slot.exerciseId, ...(slot.alternatives || [])].filter((id) => ctx.getExercise(id)),
        groupId, ctx: { ...ctx, session },
      }));
    }
  }
  return session;
}

/* -------------------------------------------------------------- Steps -- */

/** Découpe la séance en écrans : [{ index, items: [item], isSuperset }]. */
export function steps(session) {
  const out = [];
  for (const it of session.items) {
    const last = out[out.length - 1];
    if (last && it.groupId && last.items[0].groupId === it.groupId) last.items.push(it);
    else out.push({ index: out.length, items: [it] });
  }
  for (const s of out) s.isSuperset = lanes(s).length > 1;
  return out;
}

/**
 * « Couloirs » d'un écran : un couloir = une position (A, B…) dans le superset.
 * Un exercice remplacé en cours de route et son remplaçant partagent le même
 * couloir (le remplaçant reprend au tour suivant).
 */
export function lanes(step) {
  const out = [];
  for (const it of step.items) {
    const key = it.lane || it.id;
    let l = out.find((x) => x.key === key);
    if (!l) { l = { key, items: [] }; out.push(l); }
    l.items.push(it);
  }
  return out;
}

/** Lettre (A, B…) d'un item dans son écran ('' hors superset). */
export function laneLetter(step, item) {
  if (!step.isSuperset) return '';
  const i = lanes(step).findIndex((l) => l.items.includes(item));
  return 'ABCDEFGH'[i] || '';
}

export function itemStatus(item) {
  if (item.skipped) return 'skipped';
  const done = item.sets.filter((s) => s.done).length;
  if (item.sets.length && done === item.sets.length) return 'done';
  return done ? 'progress' : 'todo';
}

export function stepStatus(step) {
  const st = step.items.map(itemStatus);
  if (st.every((s) => s === 'skipped')) return 'skipped';
  const live = st.filter((s) => s !== 'skipped');
  if (live.every((s) => s === 'done')) return 'done';
  if (live.some((s) => s === 'done' || s === 'progress')) return 'progress';
  return 'todo';
}

/**
 * Séries d'un écran dans l'ordre d'exécution. Superset : A1, B1, A2, B2…
 * (échauffements d'abord, exercice par exercice).
 * @returns [{ item, set, letter, label, round }]
 */
export function orderedSets(step) {
  const letters = 'ABCDEFGH';
  const out = [];
  const ls = lanes(step);
  ls.forEach((lane, k) => lane.items.forEach((item) => {
    item.sets.filter((s) => s.type === 'echauffement').forEach((set, i) => {
      out.push({ item, set, letter: step.isSuperset ? letters[k] : '', label: 'É', round: -1, warm: i });
    });
  }));
  // Séries de travail de chaque couloir, numérotées en continu (même après un remplacement).
  const works = ls.map((lane) => lane.items.flatMap((item) => item.sets.filter((s) => s.type !== 'echauffement').map((set) => ({ item, set }))));
  const rounds = Math.max(0, ...works.map((w) => w.length));
  for (let r = 0; r < rounds; r++) {
    ls.forEach((lane, k) => {
      const e = works[k][r];
      if (!e) return;
      const letter = step.isSuperset ? letters[k] : '';
      out.push({ item: e.item, set: e.set, letter, label: `${letter}${r + 1}`, round: r });
    });
  }
  return out;
}

/** Première série non validée de l'écran (hors exercices sautés). */
export function currentEntry(step) {
  return orderedSets(step).find((e) => !e.set.done && !e.item.skipped) || null;
}

/* -------------------------------------------------------- Opérations -- */

export function findItem(session, itemId) { return session.items.find((i) => i.id === itemId); }
export function findSet(session, setId) {
  for (const item of session.items) {
    const set = item.sets.find((s) => s.id === setId);
    if (set) return { item, set };
  }
  return {};
}

/**
 * Valide une série. Retourne la durée de repos à lancer (0 = pas de chrono).
 * Le repos réellement pris par la série précédente est enregistré ici.
 */
export function validateSet(session, setId, { now = Date.now(), supersetRestAfterRound = true } = {}) {
  const { item, set } = findSet(session, setId);
  if (!set) return 0;
  closeRest(session, now);
  set.done = true;
  set.doneAt = new Date(now).toISOString();
  if (set.type === 'echauffement') return 0;
  // Superset : repos seulement après le dernier exercice du tour.
  const step = steps(session).find((s) => s.items.includes(item));
  if (step?.isSuperset && supersetRestAfterRound) {
    const entries = orderedSets(step);
    const me = entries.find((e) => e.set === set);
    const lastOfRound = entries.filter((e) => e.round === me.round && !e.item.skipped).pop();
    if (lastOfRound.set !== set) return 0;
    const lastItem = step.items[step.items.length - 1];
    return lastItem.target.restSec || item.target.restSec;
  }
  return item.target.restSec;
}

/** Démarre le chrono de repos après une série. */
export function startRest(session, setId, durationSec, now = Date.now()) {
  if (!durationSec) return;
  session.rest = { setId, startedAt: now, endsAt: now + durationSec * 1000, durationSec };
}

/** Arrête le chrono et enregistre le repos réellement pris. */
export function closeRest(session, now = Date.now()) {
  if (!session.rest) return;
  const { set } = findSet(session, session.rest.setId);
  if (set) set.restTakenSec = Math.round((now - session.rest.startedAt) / 1000);
  session.rest = null;
}

export function adjustRest(session, deltaSec) {
  if (!session.rest) return;
  session.rest.endsAt = Math.max(Date.now(), session.rest.endsAt + deltaSec * 1000);
  session.rest.durationSec = Math.round((session.rest.endsAt - session.rest.startedAt) / 1000);
}

export function unvalidateSet(session, setId) {
  const { set } = findSet(session, setId);
  if (!set) return;
  set.done = false; set.doneAt = null;
  if (session.rest?.setId === setId) session.rest = null;
}

/** Ajoute une série (copie des valeurs de la dernière série de travail). */
export function addSet(item) {
  const works = item.sets.filter((s) => s.type !== 'echauffement');
  const last = works[works.length - 1];
  const src = last?.stages[0] || { load: null, reps: null };
  const s = newSet(src.load, src.reps, 'normale');
  item.sets.push(s);
  return s;
}

export function removeSet(item, setId) {
  item.sets = item.sets.filter((s) => s.id !== setId);
}

/** Ajoute un palier de dégressive (charge PROPOSÉE, librement modifiable). */
export function addStage(set, { dropPct = 20, increment = 2.5 } = {}) {
  const prev = set.stages[set.stages.length - 1];
  set.stages.push({ load: proposeDropLoad(prev.load, dropPct, increment), reps: prev.reps });
  if (set.type === 'normale') set.type = 'degressive';
}

export function removeStage(set, index) {
  if (index <= 0 || set.stages.length <= 1) return;
  set.stages.splice(index, 1);
  if (set.stages.length === 1 && set.type === 'degressive') set.type = 'normale';
}

/** Insère des séries d'échauffement en tête de l'exercice. */
export function addWarmups(item, list) {
  const sets = list.map((w) => newSet(w.load, w.reps, 'echauffement'));
  const firstWork = item.sets.findIndex((s) => s.type !== 'echauffement');
  item.sets.splice(firstWork < 0 ? item.sets.length : firstWork, 0, ...sets);
}

/** Déplace un écran (exercice ou superset entier) d'un cran. */
export function moveStep(session, stepIndex, dir) {
  const st = steps(session);
  const j = stepIndex + dir;
  if (j < 0 || j >= st.length) return false;
  const order = st.map((s) => s.items);
  [order[stepIndex], order[j]] = [order[j], order[stepIndex]];
  session.items = order.flat();
  return true;
}

/** Déplace un écran à une position donnée. */
export function moveStepTo(session, from, to) {
  const order = steps(session).map((s) => s.items);
  const [m] = order.splice(from, 1);
  order.splice(to, 0, m);
  session.items = order.flat();
}

export function removeItem(session, itemId) {
  session.items = session.items.filter((i) => i.id !== itemId);
  normalizeGroups(session);
}

/** Un groupe d'un seul exercice n'est plus un superset. */
export function normalizeGroups(session) {
  const counts = {};
  for (const it of session.items) if (it.groupId) counts[it.groupId] = (counts[it.groupId] || 0) + 1;
  for (const it of session.items) if (it.groupId && counts[it.groupId] < 2) it.groupId = null;
}

/** Regroupe un écran avec le suivant en superset. */
export function groupWithNext(session, stepIndex) {
  const st = steps(session);
  if (stepIndex + 1 >= st.length) return false;
  const gid = st[stepIndex].items[0].groupId || uid('grp');
  for (const it of [...st[stepIndex].items, ...st[stepIndex + 1].items]) it.groupId = gid;
  return true;
}

export function ungroup(session, stepIndex) {
  const st = steps(session);
  for (const it of st[stepIndex]?.items || []) it.groupId = null;
}

/** Ajoute un exercice comme nouvel écran après `afterStep`. Retourne l'index du nouvel écran. */
export function addItemAfter(session, item, afterStep) {
  const st = steps(session);
  const order = st.map((s) => s.items);
  const at = Math.min(afterStep + 1, order.length);
  order.splice(at, 0, [item]);
  session.items = order.flat();
  return at;
}

/**
 * Remplace l'exercice d'un item. Si des séries sont déjà validées, elles
 * restent attachées à l'exercice d'origine (l'item est scindé) : l'historique
 * reste rattaché à l'exercice réellement effectué.
 * @returns le nouvel item actif
 */
export function replaceExercise(session, itemId, newExerciseId, ctx) {
  const item = findItem(session, itemId);
  if (!item) return null;
  const doneSets = item.sets.filter((s) => s.done);
  const fresh = newItem({
    exerciseId: newExerciseId, target: item.target, slotId: item.slotId,
    alternatives: item.alternatives, groupId: item.groupId, ctx,
  });
  if (!doneSets.length) {
    item.exerciseId = newExerciseId;
    item.sets = fresh.sets;
    return item;
  }
  const remaining = item.sets.filter((s) => !s.done).length;
  item.sets = doneSets;
  item.replacedBy = newExerciseId;
  fresh.sets = fresh.sets.slice(0, Math.max(1, remaining));
  // Même écran, même position (couloir) : le remplaçant prend la suite.
  fresh.lane = item.lane || item.id;
  if (!item.groupId) item.groupId = uid('grp');
  fresh.groupId = item.groupId;
  fresh.slotId = item.slotId;
  item.slotId = null;
  const idx = session.items.indexOf(item);
  session.items.splice(idx + 1, 0, fresh);
  return fresh;
}

/** Termine la séance : retire les séries non validées, marque les exercices vides comme sautés. */
export function finishSession(session, now = Date.now()) {
  closeRest(session, now);
  for (const it of session.items) {
    // Nombre de séries prévues au moment de terminer (structure voulue, validées ou non).
    it.plannedSets = it.sets.filter((s) => s.type !== 'echauffement').length;
    it.sets = it.sets.filter((s) => s.done);
    if (!it.sets.length) it.skipped = true;
  }
  session.status = 'done';
  session.endedAt = new Date(now).toISOString();
  session.rest = null;
}

/**
 * Applique de nouvelles valeurs suggérées aux séries NON validées et NON
 * modifiées à la main d'un exercice (changement de mode ou de forme du jour).
 * Ajuste aussi le nombre de séries (ex. une de plus en mode Récup).
 */
export function applySuggestion(item, values) {
  const works = item.sets.filter((s) => s.type !== 'echauffement');
  const free = (s) => !s.done && !s.touched && s.stages.length === 1;
  works.forEach((s, i) => {
    const v = values[i];
    if (v && free(s)) s.stages[0] = { load: v.load, reps: v.reps };
  });
  // Nombre de séries : on ajoute ou on retire uniquement des séries libres.
  for (let i = works.length; i < values.length; i++) item.sets.push(newSet(values[i].load, values[i].reps));
  if (values.length < works.length) {
    const extra = works.slice(values.length).filter(free);
    item.sets = item.sets.filter((s) => !extra.includes(s));
  }
}

/* ------------------------------------------- Retour vers le programme -- */

/**
 * Construit des blocs de modèle à partir de la structure de la séance
 * (ordre, supersets, nombre de séries, exercices ajoutés/remplacés).
 * Les exercices sautés AUJOURD'HUI restent dans le programme.
 */
export function blocksFromSession(session, template, settings) {
  const slotById = {};
  for (const b of template?.blocks || []) for (const sl of b.slots) slotById[sl.id] = sl;
  return steps(session).map((step) => ({
    id: uid('blk'),
    kind: step.items.filter((it) => !it.replacedBy).length > 1 ? 'superset' : 'single',
    slots: step.items.filter((it) => !it.replacedBy).map((it) => {
      const orig = it.slotId ? slotById[it.slotId] : null;
      const alts = orig ? [orig.exerciseId, ...(orig.alternatives || [])] : [];
      const isAlt = orig && alts.includes(it.exerciseId);
      const workCount = it.plannedSets ?? it.sets.filter((s) => s.type !== 'echauffement').length;
      return {
        id: orig?.id || uid('slot'),
        exerciseId: isAlt ? orig.exerciseId : it.exerciseId,
        alternatives: isAlt ? [...(orig.alternatives || [])] : [],
        ...targetFrom(it.target, settings),
        sets: it.skipped ? (orig?.sets ?? it.target.sets) : (workCount || it.target.sets),
      };
    }),
  }));
}

/** Signature simple d'une structure, pour détecter une différence avec le modèle. */
export function structureSignature(blocks) {
  return JSON.stringify(blocks.map((b) => [b.kind, b.slots.map((s) => [s.exerciseId, s.sets])]));
}

export { clone };
