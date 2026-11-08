import test from 'node:test';
import assert from 'node:assert/strict';
import { isTestPath, dbNameFor } from '../js/core/env.js';

test('env : la production garde le nom de base historique', () => {
  assert.equal(isTestPath('/carnet-muscu/'), false);
  assert.equal(isTestPath('/carnet-muscu/index.html'), false);
  assert.equal(isTestPath('/'), false);
  assert.equal(dbNameFor(false), 'carnet-muscu');
});

test('env : la version de test a sa propre base', () => {
  assert.equal(isTestPath('/carnet-muscu-test/'), true);
  assert.equal(isTestPath('/carnet-muscu-test'), true);
  assert.equal(isTestPath('/carnet-muscu-test/index.html'), true);
  assert.equal(isTestPath('/carnet-muscu-testing/'), false);
  assert.equal(dbNameFor(true), 'carnet-muscu-test');
});
