/**
 * État applicatif en mémoire + persistance « write-through » dans IndexedDB.
 *
 * Toutes les données (quelques centaines de séances au plus) tiennent en
 * mémoire : on les charge au démarrage, les calculs (stats, suggestions)
 * sont synchrones, et CHAQUE modification est immédiatement écrite en base
 * (principe « jamais de perte de données »).
 */
import { db, COLLECTIONS } from './db.js';
import { DEFAULT_SETTINGS } from '../data/defaults.js';
import { clone } from './util.js';

export const SCHEMA_VERSION = 1;

export const state = {
  settings: { ...DEFAULT_SETTINGS },
  meta: { onboarded: false, activeSessionId: null, schemaVersion: SCHEMA_VERSION },
  schedule: { default: {}, weeks: {} },
  exercises: [],
  templates: [],
  sessions: [],
  goals: [],
  runs: [],
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify() { for (const fn of listeners) fn(); }

let onError = (e) => console.error(e);
export function setErrorHandler(fn) { onError = fn; }

/** Chargement initial depuis IndexedDB. */
export async function loadAll() {
  const [settings, meta, schedule] = await Promise.all([
    db.get('kv', 'settings'), db.get('kv', 'meta'), db.get('kv', 'schedule'),
  ]);
  if (settings) state.settings = { ...DEFAULT_SETTINGS, ...settings.value };
  if (meta) state.meta = { ...state.meta, ...meta.value };
  if (schedule) state.schedule = { default: {}, weeks: {}, ...schedule.value };
  for (const name of COLLECTIONS) state[name] = await db.getAll(name);
  sortTemplates();
}

function sortTemplates() {
  state.templates.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* ------------------------------------------------------------ Lecture -- */

export const getExercise = (id) => state.exercises.find((e) => e.id === id);
export const getTemplate = (id) => state.templates.find((t) => t.id === id);
export const getSession = (id) => state.sessions.find((s) => s.id === id);
export const getGoal = (id) => state.goals.find((g) => g.id === id);
export const getRun = (id) => state.runs.find((r) => r.id === id);
export const exerciseName = (id) => getExercise(id)?.name || 'Exercice supprimé';
export const activeSession = () => (state.meta.activeSessionId ? getSession(state.meta.activeSessionId) : null);
/** Séances terminées, de la plus récente à la plus ancienne. */
export const finishedSessions = () => state.sessions
  .filter((s) => s.status === 'done')
  .sort((a, b) => (b.date + (b.startedAt || '')).localeCompare(a.date + (a.startedAt || '')));

/* ------------------------------------------------------------ Écriture -- */

function persist(promise) {
  promise.catch((e) => onError(e));
  return promise;
}

/** Enregistre (ajout ou remplacement) un document d'une collection. */
export function saveDoc(collection, doc, { silent = false } = {}) {
  const arr = state[collection];
  const i = arr.findIndex((d) => d.id === doc.id);
  if (i >= 0) arr[i] = doc; else arr.push(doc);
  if (collection === 'templates') sortTemplates();
  persist(db.put(collection, clone(doc)));
  if (!silent) notify();
  return doc;
}

export function deleteDoc(collection, id, { silent = false } = {}) {
  state[collection] = state[collection].filter((d) => d.id !== id);
  persist(db.delete(collection, id));
  if (!silent) notify();
}

export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist(db.put('kv', { key: 'settings', value: clone(state.settings) }));
  notify();
}

export function saveMeta(patch) {
  state.meta = { ...state.meta, ...patch };
  persist(db.put('kv', { key: 'meta', value: clone(state.meta) }));
}

export function saveSchedule(silent = false) {
  persist(db.put('kv', { key: 'schedule', value: clone(state.schedule) }));
  if (!silent) notify();
}

/** Remplace l'intégralité des données (restauration d'une sauvegarde). */
export async function replaceEverything(data) {
  state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  state.meta = { ...state.meta, ...(data.meta || {}), schemaVersion: SCHEMA_VERSION };
  state.schedule = { default: {}, weeks: {}, ...(data.schedule || {}) };
  await db.put('kv', { key: 'settings', value: clone(state.settings) });
  await db.put('kv', { key: 'meta', value: clone(state.meta) });
  await db.put('kv', { key: 'schedule', value: clone(state.schedule) });
  for (const name of COLLECTIONS) {
    state[name] = clone(data[name] || []);
    await db.replaceAll(name, state[name]);
  }
  sortTemplates();
  notify();
}
