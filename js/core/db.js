/**
 * Accès bas niveau à IndexedDB (promesses minimalistes).
 *
 * Tables :
 *  - kv        : documents uniques par clé ('settings', 'meta', 'schedule')
 *  - exercises : bibliothèque d'exercices
 *  - templates : séances modèles (programme)
 *  - sessions  : séances réalisées ou en cours
 *  - goals     : objectifs
 *  - runs      : sorties de course à pied
 */

import { IS_TEST_ENV, dbNameFor } from './env.js';

const DB_NAME = dbNameFor(IS_TEST_ENV);
const DB_VERSION = 1;
export const COLLECTIONS = ['exercises', 'templates', 'sessions', 'goals', 'runs'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      for (const name of COLLECTIONS) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  getAll: (storeName) => tx(storeName, 'readonly', (s) => wrap(s.getAll())),
  get: (storeName, key) => tx(storeName, 'readonly', (s) => wrap(s.get(key))),
  put: (storeName, value) => tx(storeName, 'readwrite', (s) => { s.put(value); }),
  delete: (storeName, key) => tx(storeName, 'readwrite', (s) => { s.delete(key); }),
  clear: (storeName) => tx(storeName, 'readwrite', (s) => { s.clear(); }),
  /** Remplace tout le contenu d'une table (import). */
  replaceAll: (storeName, values) => tx(storeName, 'readwrite', (s) => {
    s.clear();
    for (const v of values) s.put(v);
  }),
};
