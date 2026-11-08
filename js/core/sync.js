/**
 * SYNCHRONISATION EN LIGNE : branchement du moteur (sync-engine.js) sur
 * l'état local (store.js) et sur Supabase (supabase.js).
 *
 * Fonctionnement :
 *  - sans compte connecté, rien ne change : l'app reste 100 % locale ;
 *  - une fois connecté, chaque modification locale est envoyée quelques
 *    secondes plus tard, et les changements faits sur un autre appareil
 *    sont récupérés à l'ouverture, au retour dans l'app, au retour du réseau et toutes les 15 s.
 */
import { db } from './db.js';
import { setChangeHook, getLocalDoc, listLocalKeys, applyRemoteDoc, notify, saveMeta, state } from './store.js';
import { createSyncEngine, emptySyncState } from './sync-engine.js';
import { createSupabaseClient } from './supabase.js';
import { SYNC_CONFIG } from '../data/sync-config.js';

const kvGet = async (key) => (await db.get('kv', key))?.value ?? null;
const kvPut = (key, value) => db.put('kv', { key, value });

export const syncStatus = {
  enabled: SYNC_CONFIG.enabled,
  user: null,          // { id, email } si connecté
  state: 'off',        // off | idle | syncing | offline | error
  lastSync: null,      // ISO
  error: null,
  pending: 0,
};

const statusListeners = new Set();
export function onSyncStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(patch) {
  Object.assign(syncStatus, patch);
  for (const fn of statusListeners) fn(syncStatus);
}

let client = null;
let engine = null;
let timer = null;
let interval = null;

function newEngine(initialState) {
  return createSyncEngine({
    api: {
      pull: (cursor, limit) => client.pullDocs(cursor, limit),
      push: (rows) => client.pushDocs(rows),
    },
    local: {
      get: getLocalDoc,
      keys: listLocalKeys,
      apply: applyRemoteDoc,
    },
    state: initialState,
    onState: (s) => { kvPut('sync', s).catch(() => {}); setStatus({ pending: Object.keys(s.pending).length }); },
  });
}

/** Démarrage : à appeler après le chargement des données locales. */
export async function initSync() {
  if (!SYNC_CONFIG.enabled) return;
  client = createSupabaseClient({
    url: SYNC_CONFIG.url,
    key: SYNC_CONFIG.publishableKey,
    loadSession: () => kvGet('auth'),
    saveSession: (s) => kvPut('auth', s),
  });
  const user = await client.getUser();
  engine = newEngine((await kvGet('sync')) || emptySyncState());
  setChangeHook((collection, id) => {
    if (!syncStatus.user) return;
    engine.markDirty(collection, id);
    schedule();
  });
  // Retour du réseau, retour dans l'app (téléphone) ou dans la fenêtre (ordinateur).
  window.addEventListener('online', () => syncNow());
  window.addEventListener('focus', () => syncNow());
  window.addEventListener('pageshow', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  if (user) {
    setStatus({ user, state: 'idle', lastSync: await kvGet('lastSync'), pending: engine.pendingCount() });
    startInterval();
    syncNow();
  }
}

function startInterval() {
  clearInterval(interval);
  interval = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, SYNC_CONFIG.intervalMs);
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), SYNC_CONFIG.debounceMs);
}

/** Redessine l'écran sans voler le focus d'un champ en cours de saisie. */
function refreshUi() {
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
    el.addEventListener('blur', () => setTimeout(notify, 0), { once: true });
  } else notify();
}

/** Lance une synchronisation (sans effet si non connecté). */
export async function syncNow() {
  if (!engine || !syncStatus.user) return null;
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return null; }
  setStatus({ state: 'syncing', error: null });
  try {
    const res = await engine.run();
    const lastSync = new Date().toISOString();
    kvPut('lastSync', lastSync).catch(() => {});
    setStatus({ state: 'idle', lastSync, pending: engine.pendingCount() });
    // Modifications faites pendant l'envoi : on les envoie juste après.
    if (engine.pendingCount()) schedule();
    if (res?.applied) refreshUi();
    return res;
  } catch (e) {
    if (e.status === 401) {
      setStatus({ state: 'error', error: e.message, user: null });
    } else {
      setStatus({ state: e.offline ? 'offline' : 'error', error: e.offline ? null : e.message });
    }
    return null;
  }
}

/**
 * Connexion ou création de compte, puis première synchronisation.
 * @returns {{ hadRemoteData:boolean }}
 */
export async function signIn(email, password, { create = false } = {}) {
  const user = create ? await client.signUp(email, password) : await client.signIn(email, password);
  // Nouveau compte sur cet appareil : on repart d'un état de synchro vierge.
  engine = newEngine(emptySyncState());
  await kvPut('sync', engine.state);
  setStatus({ user, state: 'idle', error: null });
  startInterval();
  const res = await syncNow();
  if (res?.hadRemoteData && !state.meta.onboarded) saveMeta({ onboarded: true });
  refreshUi();
  return { hadRemoteData: !!res?.hadRemoteData, ok: !!res };
}

/** Déconnexion : les données restent sur l'appareil. */
export async function signOut() {
  clearInterval(interval);
  clearTimeout(timer);
  await client.signOut();
  await kvPut('sync', emptySyncState());
  engine = newEngine(emptySyncState());
  setStatus({ user: null, state: 'off', error: null, pending: 0 });
}

/** Libellé court de l'état, pour l'interface. */
export function syncLabel(s = syncStatus) {
  if (!s.user) return null;
  if (s.state === 'syncing') return 'Synchronisation…';
  if (s.state === 'offline') return s.pending ? `Hors ligne · ${s.pending} en attente` : 'Hors ligne';
  if (s.state === 'error') return 'Erreur de synchronisation';
  if (s.pending) return `${s.pending} modification${s.pending > 1 ? 's' : ''} en attente`;
  if (!s.lastSync) return 'Connecté';
  const min = Math.round((Date.now() - new Date(s.lastSync)) / 60000);
  return min < 1 ? 'Synchronisé à l’instant' : min < 60 ? `Synchronisé il y a ${min} min` : 'Synchronisé';
}
