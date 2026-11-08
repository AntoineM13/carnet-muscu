/**
 * MOTEUR DE SYNCHRONISATION (local d'abord)
 * =========================================
 * L'app fonctionne toujours en local (IndexedDB). Ce moteur :
 *  - ENVOIE les documents modifiés localement (« en attente ») ;
 *  - RÉCUPÈRE les documents modifiés ailleurs depuis la dernière fois.
 *
 * Il ne dépend ni du navigateur ni de Supabase : tout passe par deux
 * adaptateurs injectés, ce qui le rend testable sous Node.
 *
 *   api   = { pull(cursor, limit) -> rows[], push(rows) }
 *           row = { collection, id, data, deleted, updated_at }
 *   local = { get(collection, id) -> data|undefined,
 *             keys() -> [[collection, id], …],
 *             apply(collection, id, data|null) }
 *
 * État persistant (sauvegardé par l'appelant via onState) :
 *   { pending: { 'collection/id': n }, cursor: { t, c, i } | null, initialDone }
 *
 * Règles de conflit :
 *  - synchronisation normale : une modification locale encore en attente
 *    l'emporte (elle sera envoyée juste après) ;
 *  - première synchronisation d'un appareil : le SERVEUR l'emporte pour les
 *    documents qui existent des deux côtés, et les documents présents
 *    uniquement en local sont envoyés. Un téléphone neuf ne peut donc pas
 *    écraser l'historique du compte.
 */

export const keyOf = (collection, id) => `${collection}/${id}`;
const splitKey = (k) => { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; };

export function emptySyncState() {
  return { pending: {}, cursor: null, initialDone: false };
}

export function createSyncEngine({ api, local, state = emptySyncState(), onState = () => {}, pageSize = 500, batchSize = 200 }) {
  let seq = 0;
  let running = null;

  const save = () => onState(state);

  /** Marque un document comme modifié localement. */
  function markDirty(collection, id) {
    state.pending[keyOf(collection, id)] = ++seq + Date.now();
    save();
  }

  /** Envoie tout ce qui est en attente. */
  async function push() {
    const snapshot = { ...state.pending };
    const keys = Object.keys(snapshot);
    for (let i = 0; i < keys.length; i += batchSize) {
      const chunk = keys.slice(i, i + batchSize);
      const rows = chunk.map((k) => {
        const [collection, id] = splitKey(k);
        const data = local.get(collection, id);
        return data === undefined
          ? { collection, id, data: null, deleted: true }
          : { collection, id, data, deleted: false };
      });
      await api.push(rows);
      // Ne retire que ce qui n'a pas été re-modifié pendant l'envoi.
      for (const k of chunk) if (state.pending[k] === snapshot[k]) delete state.pending[k];
      save();
    }
    return keys.length;
  }

  /**
   * Récupère les changements distants.
   * @param {boolean} serverWins true lors de la première synchronisation
   * @returns {{ applied:number, seen:Set<string> }}
   */
  async function pull(serverWins = false) {
    let applied = 0;
    const seen = new Set();
    for (;;) {
      const rows = await api.pull(state.cursor, pageSize);
      for (const r of rows) {
        const k = keyOf(r.collection, r.id);
        seen.add(k);
        if (!serverWins && state.pending[k] !== undefined) continue; // modif locale prioritaire
        local.apply(r.collection, r.id, r.deleted ? null : r.data);
        if (serverWins) delete state.pending[k];
        applied += 1;
      }
      if (rows.length) {
        const last = rows[rows.length - 1];
        state.cursor = { t: last.updated_at, c: last.collection, i: last.id };
        save();
      }
      if (rows.length < pageSize) break;
    }
    return { applied, seen };
  }

  async function initialSync() {
    state.cursor = null;
    const { applied, seen } = await pull(true);
    // Documents présents uniquement sur cet appareil : à envoyer.
    for (const [c, id] of local.keys()) {
      const k = keyOf(c, id);
      if (!seen.has(k)) state.pending[k] = ++seq + Date.now();
    }
    state.initialDone = true;
    save();
    const pushed = await push();
    return { applied, pushed, hadRemoteData: seen.size > 0 };
  }

  /** Lance une synchronisation (une seule à la fois). */
  function run() {
    if (running) return running;
    running = (async () => {
      try {
        if (!state.initialDone) return await initialSync();
        const pushed = await push();
        const { applied } = await pull(false);
        return { applied, pushed, hadRemoteData: applied > 0 };
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    markDirty,
    run,
    get state() { return state; },
    pendingCount: () => Object.keys(state.pending).length,
    isRunning: () => !!running,
  };
}
