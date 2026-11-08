/**
 * Actions applicatives : relient le métier (domain/) à l'état persistant (store).
 * Les écrans appellent ces fonctions plutôt que de manipuler le store directement.
 */
import {
  state, saveDoc, deleteDoc, saveMeta, saveSchedule, saveSettings, getTemplate, getExercise, getSession, notify,
} from './store.js';
import { clone, todayISO } from './util.js';
import { SEED_EXERCISES, SEED_TEMPLATES, SEED_DEFAULT_SCHEDULE } from '../data/seed-program.js';
import { normalizeExercise, templateExerciseIds } from '../domain/program.js';
import * as Plan from '../domain/planning.js';
import * as Ses from '../domain/session.js';
import { toast } from '../ui/overlay.js';

/* ---------------------------------------------------------- Démarrage -- */

export function loadSeed() {
  for (const e of SEED_EXERCISES) saveDoc('exercises', normalizeExercise(clone(e)), { silent: true });
  SEED_TEMPLATES.forEach((t, i) => saveDoc('templates', { ...clone(t), order: i }, { silent: true }));
  state.schedule = { default: clone(SEED_DEFAULT_SCHEDULE), weeks: {} };
  // Première semaine : on ne planifie qu'à partir d'aujourd'hui (pas de « retard » fictif).
  Plan.regenerateWeek(state.schedule, todayISO());
  saveSchedule(true);
  finishOnboarding();
}

export function finishOnboarding() {
  saveMeta({ onboarded: true });
  notify();
}

/* ------------------------------------------------------------ Contexte -- */

/** Hook de préremplissage : remplacé à l'étape 2 par les suggestions de progression. */
let prefillHook = null;
export function setPrefillHook(fn) { prefillHook = fn; }

export function sessionCtx(session = null) {
  return {
    getExercise, sessions: state.sessions, settings: state.settings, form: session?.form || 'normal', session,
    prefill: prefillHook ? (exerciseId, target) => prefillHook(exerciseId, target, session) : null,
  };
}

/* -------------------------------------------------------------- Séances -- */

/**
 * Démarre une séance. templateId null = séance libre.
 * Rattache la séance à l'item de planning correspondant s'il existe.
 */
export function startSession({ templateId = null, date = todayISO(), plannedItemId = null, form = 'normal' }) {
  const template = templateId ? getTemplate(templateId) : null;
  if (template && !plannedItemId) plannedItemId = Plan.itemForStart(state.schedule, template.id, date)?.id || null;
  const session = Ses.createSession({ template, date, plannedItemId, form, ctx: { ...sessionCtx(), form } });
  saveDoc('sessions', session, { silent: true });
  saveMeta({ activeSessionId: session.id });
  saveSchedule(true);
  return session;
}

/** Enregistre une séance (appelé après CHAQUE modification). */
export function persistSession(session, { silent = true } = {}) {
  if (session.status === 'done') session.editedAfterFinish = true;
  saveDoc('sessions', session, { silent });
}

export function finishActive(session) {
  Ses.finishSession(session);
  saveDoc('sessions', session, { silent: true });
  Plan.markDone(state.schedule, session);
  saveSchedule(true);
  saveMeta({ activeSessionId: null });
  notify();
}

/** Rouvre une séance tout juste terminée (depuis le résumé). */
export function reopenSession(session) {
  session.status = 'active';
  session.endedAt = null;
  Plan.unmarkDone(state.schedule, session.id);
  saveSchedule(true);
  saveDoc('sessions', session, { silent: true });
  saveMeta({ activeSessionId: session.id });
}

/** Supprime une séance (en cours ou terminée), avec annulation possible. */
export function deleteSession(session, label = 'Séance supprimée') {
  const snapshot = clone(session);
  const wasActive = state.meta.activeSessionId === session.id;
  const linked = clone(state.schedule);
  Plan.unmarkDone(state.schedule, session.id);
  saveSchedule(true);
  if (wasActive) saveMeta({ activeSessionId: null });
  deleteDoc('sessions', session.id);
  toast(label, {
    undo: () => {
      saveDoc('sessions', snapshot, { silent: true });
      state.schedule = linked; saveSchedule(true);
      if (wasActive) saveMeta({ activeSessionId: snapshot.id });
      notify();
    },
  });
}

/* ------------------------------------------------------------ Programme -- */

export function saveTemplate(t, opts) { saveDoc('templates', t, opts); }

export function deleteTemplate(t) {
  const snapshot = clone(t);
  const schedSnap = clone(state.schedule);
  for (const [wd, id] of Object.entries(state.schedule.default)) if (id === t.id) delete state.schedule.default[wd];
  for (const w of Object.values(state.schedule.weeks)) w.items = w.items.filter((it) => it.templateId !== t.id || it.status === 'done');
  saveSchedule(true);
  deleteDoc('templates', t.id);
  toast(`« ${t.name} » supprimée`, {
    undo: () => { saveDoc('templates', snapshot, { silent: true }); state.schedule = schedSnap; saveSchedule(); },
  });
}

export function saveExercise(e, opts) { saveDoc('exercises', e, opts); }

/** Un exercice utilisé (programme ou historique) est archivé plutôt que supprimé. */
export function removeExercise(e) {
  const used = state.templates.some((t) => templateExerciseIds(t).includes(e.id))
    || state.sessions.some((s) => s.items.some((it) => it.exerciseId === e.id));
  const snapshot = clone(e);
  if (used) {
    saveDoc('exercises', { ...e, archived: true });
    for (const t of state.templates) {
      let changed = false;
      for (const b of t.blocks) {
        for (const s of b.slots) {
          if (s.alternatives?.includes(e.id)) { s.alternatives = s.alternatives.filter((a) => a !== e.id); changed = true; }
        }
      }
      if (changed) saveDoc('templates', t, { silent: true });
    }
  } else {
    deleteDoc('exercises', e.id);
  }
  toast(used ? `« ${e.name} » archivé (historique conservé)` : `« ${e.name} » supprimé`, {
    undo: () => saveDoc('exercises', snapshot),
  });
}

/* ------------------------------------------------------------- Planning -- */

/** Applique une modification au planning puis sauvegarde (avec annulation). */
export function editSchedule(fn, label) {
  const snap = clone(state.schedule);
  fn(state.schedule);
  saveSchedule();
  if (label) toast(label, { undo: () => { state.schedule = snap; saveSchedule(); } });
}

export { saveSettings, getSession };
