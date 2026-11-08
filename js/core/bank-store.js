/**
 * Banque d'exercices côté app : banque intégrée + banque commune (Supabase).
 * La banque commune est gardée en copie locale (IndexedDB, clé `bankShared`)
 * pour rester disponible hors ligne ; elle se met à jour quand on est connecté.
 */
import { db } from './db.js';
import { notify } from './store.js';
import { buildBankIndex, bankEntryFromExercise } from '../domain/bank.js';

let shared = [];
let index = buildBankIndex([]);
let client = null;

/** Index courant (intégrée + commune). */
export const bankIndex = () => index;
export const sharedCount = () => shared.length;

function setShared(list) {
  shared = list;
  index = buildBankIndex(shared);
}

/** Démarrage : copie locale d'abord (hors ligne), puis le serveur si connecté. */
export async function initBank(supabaseClient) {
  client = supabaseClient;
  try { setShared((await db.get('kv', 'bankShared'))?.value || []); } catch { /* première fois */ }
}

let lastRefresh = 0;
/** Rafraîchit au plus toutes les 5 minutes (appelé à l'ouverture de la bibliothèque). */
export function refreshSharedBankSoon() {
  if (Date.now() - lastRefresh > 5 * 60 * 1000) refreshSharedBank();
}

/** Récupère la banque commune (sans effet si non connecté ou hors ligne). */
export async function refreshSharedBank() {
  lastRefresh = Date.now();
  if (!client || !(await client.getUser())) return false;
  try {
    const rows = await client.listBank();
    const list = rows.map((r) => ({ ...r.data, id: r.id, author: r.created_by }));
    const changed = JSON.stringify(list) !== JSON.stringify(shared);
    setShared(list);
    await db.put('kv', { key: 'bankShared', value: list });
    if (changed) notify();
    return true;
  } catch { return false; }
}

/** Partage un exercice personnel dans la banque commune. */
export async function shareToBank(exercise) {
  if (!client || !(await client.getUser())) throw new Error('Connecte-toi (Réglages → Compte) pour partager dans la banque commune.');
  const entry = bankEntryFromExercise(exercise);
  const { id, ...data } = entry;
  await client.upsertBank(id, data);
  await refreshSharedBank();
  return entry;
}

/** Ma propre entrée partagée pour cet exercice (pour afficher « Partagé »). */
export function sharedEntry(id) {
  return shared.find((b) => b.id === id) || null;
}
