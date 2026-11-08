/**
 * Tests du moteur de synchronisation, avec un faux serveur en mémoire.
 * Lancer : node --test tests/*.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine, emptySyncState } from '../js/core/sync-engine.js';

/** Faux serveur : table docs d'un utilisateur, horodatage croissant. */
function fakeServer() {
  const rows = new Map(); let clock = 0;
  const ts = () => `2026-11-08T10:00:00.${String(++clock).padStart(6, '0')}+00:00`;
  return {
    rows,
    api: {
      async push(batch) { const t = ts(); for (const r of batch) rows.set(`${r.collection}/${r.id}`, { ...r, updated_at: t }); },
      async pull(cursor, limit) {
        const all = [...rows.values()].sort((a, b) => (a.updated_at + a.collection + a.id).localeCompare(b.updated_at + b.collection + b.id));
        const after = cursor ? all.filter((r) => (r.updated_at + r.collection + r.id) > (cursor.t + cursor.c + cursor.i)) : all;
        return after.slice(0, limit).map((r) => structuredClone(r));
      },
    },
  };
}

/** Faux appareil : collections locales en mémoire. */
function fakeDevice(server, initial = {}) {
  const data = new Map(Object.entries(initial));
  const local = {
    get: (c, id) => (data.has(`${c}/${id}`) ? structuredClone(data.get(`${c}/${id}`)) : undefined),
    keys: () => [...data.keys()].map((k) => k.split('/')),
    apply: (c, id, d) => { if (d == null) data.delete(`${c}/${id}`); else data.set(`${c}/${id}`, d); },
  };
  const engine = createSyncEngine({ api: server.api, local, state: emptySyncState(), pageSize: 2, batchSize: 2 });
  const edit = (k, v) => { if (v === undefined) data.delete(k); else data.set(k, v); const [c, id] = k.split('/'); engine.markDirty(c, id); };
  return { data, engine, edit };
}

test('sync : premier appareil envoie tout son historique', async () => {
  const srv = fakeServer();
  const a = fakeDevice(srv, { 'sessions/s1': { n: 1 }, 'sessions/s2': { n: 2 }, 'kv/settings': { x: 1 } });
  const res = await a.engine.run();
  assert.equal(res.hadRemoteData, false);
  assert.equal(srv.rows.size, 3);
  assert.equal(a.engine.pendingCount(), 0);
});

test('sync : nouvel appareil récupère les données, le serveur gagne', async () => {
  const srv = fakeServer();
  const a = fakeDevice(srv, { 'templates/t1': { name: 'modifié' }, 'sessions/s1': { n: 1 } });
  await a.engine.run();
  // Téléphone neuf avec le programme de départ (même id, contenu d'origine) + une donnée locale
  const b = fakeDevice(srv, { 'templates/t1': { name: 'origine' }, 'runs/r1': { km: 5 } });
  const res = await b.engine.run();
  assert.equal(res.hadRemoteData, true);
  assert.deepEqual(b.data.get('templates/t1'), { name: 'modifié' });
  assert.deepEqual(b.data.get('sessions/s1'), { n: 1 });
  assert.ok(srv.rows.has('runs/r1'), 'la donnée locale est envoyée');
});

test('sync : modifications et suppressions se propagent entre appareils', async () => {
  const srv = fakeServer();
  const a = fakeDevice(srv, { 'sessions/s1': { n: 1 } });
  await a.engine.run();
  const b = fakeDevice(srv);
  await b.engine.run();
  a.edit('sessions/s2', { n: 2 });
  a.edit('sessions/s1', undefined); // suppression
  await a.engine.run();
  await b.engine.run();
  assert.equal(b.data.has('sessions/s1'), false);
  assert.deepEqual(b.data.get('sessions/s2'), { n: 2 });
});

test('sync : une modification locale en attente n’est pas écrasée', async () => {
  const srv = fakeServer();
  const a = fakeDevice(srv, { 'goals/g1': { v: 1 } });
  await a.engine.run();
  const b = fakeDevice(srv);
  await b.engine.run();
  a.edit('goals/g1', { v: 'A' });
  await a.engine.run();
  b.edit('goals/g1', { v: 'B' }); // modifiée hors ligne sur B
  await b.engine.run();            // B envoie d'abord, puis reçoit
  assert.deepEqual(b.data.get('goals/g1'), { v: 'B' });
  await a.engine.run();
  assert.deepEqual(a.data.get('goals/g1'), { v: 'B' }, 'dernier envoi gagnant');
});

test('sync : pagination avec horodatages identiques', async () => {
  const srv = fakeServer();
  const init = {}; for (let i = 0; i < 7; i++) init[`sessions/s${i}`] = { i };
  const a = fakeDevice(srv, init);
  await a.engine.run();
  const b = fakeDevice(srv);
  await b.engine.run();
  assert.equal(b.data.size, 7);
});

test('sync : échec réseau -> les modifications restent en attente', async () => {
  const srv = fakeServer();
  const a = fakeDevice(srv, {});
  await a.engine.run();
  const realPush = srv.api.push;
  srv.api.push = async () => { throw Object.assign(new Error('offline'), { offline: true }); };
  a.edit('runs/r1', { km: 3 });
  await assert.rejects(a.engine.run());
  assert.equal(a.engine.pendingCount(), 1);
  srv.api.push = realPush;
  await a.engine.run();
  assert.equal(a.engine.pendingCount(), 0);
  assert.ok(srv.rows.has('runs/r1'));
});
