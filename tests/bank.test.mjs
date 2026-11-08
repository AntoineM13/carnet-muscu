import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_BANK } from '../js/data/exercise-bank.js';
import { SEED_EXERCISES } from '../js/data/seed-program.js';
import { EQUIPMENTS } from '../js/data/defaults.js';
import { isGroup, isPart } from '../js/domain/muscles.js';
import { buildBankIndex, enrichExercise, exerciseFromBank, catalog, sectionsForGroup, countsByGroup, bankEntryFromExercise } from '../js/domain/bank.js';

test('banque : données valides (ids uniques, muscles connus, matériel, type, description)', () => {
  const ids = new Set();
  const eqs = new Set(EQUIPMENTS.map((q) => q.value));
  for (const b of EXERCISE_BANK) {
    assert.ok(!ids.has(b.id), `id en double : ${b.id}`); ids.add(b.id);
    assert.ok(b.fr && b.en && b.d, `champs manquants : ${b.id}`);
    assert.ok(eqs.has(b.eq), `matériel inconnu : ${b.id}`);
    assert.ok(['poly', 'iso'].includes(b.mech), `type inconnu : ${b.id}`);
    assert.ok(b.p.length >= 1 && b.p.length <= 2, `principaux : ${b.id}`);
    for (const m of [...b.p, ...b.s]) assert.ok(isGroup(m) || isPart(m), `muscle inconnu ${m} : ${b.id}`);
  }
  assert.ok(EXERCISE_BANK.length >= 120);
});

test('banque : tous les exercices du programme de départ y sont (même id)', () => {
  const index = buildBankIndex();
  for (const e of SEED_EXERCISES) assert.ok(index.has(e.id), e.id);
});

test('banque : un exercice lié est complété sans écraser la saisie', () => {
  const index = buildBankIndex();
  const e = { id: 'ex-dev-decline-barre', name: 'Mon décliné', muscleGroup: 'Pectoraux' };
  const v = enrichExercise(e, index);
  assert.deepEqual(v.muscles.primary, ['pec-bas']);
  assert.equal(v.mechanic, 'poly');
  assert.equal(v.name, 'Mon décliné');
  const perso = enrichExercise({ ...e, muscles: { primary: ['pec-milieu'], secondary: [] }, mechanic: 'iso' }, index);
  assert.deepEqual(perso.muscles.primary, ['pec-milieu']);
  assert.equal(perso.mechanic, 'iso');
});

test('banque : ajout depuis la banque = même id, poids du corps reconnu', () => {
  const b = EXERCISE_BANK.find((x) => x.id === 'ex-traction');
  const e = exerciseFromBank(b);
  assert.equal(e.id, 'ex-traction');
  assert.equal(e.loadMode, 'lest');
  assert.equal(e.muscleGroup, 'Dos');
  const r = exerciseFromBank(EXERCISE_BANK.find((x) => x.id === 'ex-kickback'));
  assert.equal(r.unilateral, true);
});

test('banque : recherche FR/EN, filtres, sections par partie', () => {
  const index = buildBankIndex();
  const mine = [{ id: 'ex-dev-decline-barre', name: 'Développé décliné barre', equipment: 'barre', muscleGroup: 'Pectoraux' }];
  // Recherche en anglais, sans accents.
  assert.ok(catalog(mine, index, { q: 'skull' }).some((i) => i.id === 'ex-skull-crusher'));
  assert.ok(catalog(mine, index, { q: 'developpe decline' }).some((i) => i.id === 'ex-dev-decline-barre' && i.kind === 'mine'));
  // L'exercice déjà dans ma bibliothèque n'apparaît pas une 2e fois côté banque.
  assert.equal(catalog(mine, index, {}).filter((i) => i.id === 'ex-dev-decline-barre').length, 1);
  const iso = catalog(mine, index, { group: 'epaules', mechanic: 'iso' });
  assert.ok(iso.length && iso.every((i) => i.mech === 'iso'));
  const pecs = catalog(mine, index, { group: 'pectoraux', level: 'any' });
  const { sections, also } = sectionsForGroup('pectoraux', pecs);
  assert.deepEqual(sections.map((s) => s.id).slice(0, 3), ['pec-haut', 'pec-milieu', 'pec-bas']);
  assert.equal(sections.find((s) => s.id === 'pec-bas').items[0].id, 'ex-dev-decline-barre'); // mes exercices d'abord
  assert.ok(also.some((i) => i.id === 'ex-pompes') === false); // pompes : pectoraux en principal
  const triceps = sectionsForGroup('triceps', catalog([], index, { group: 'triceps', level: 'any' }));
  assert.ok(triceps.also.some((i) => i.id === 'ex-dev-couche-barre')); // triceps en secondaire
  const counts = countsByGroup(catalog(mine, index, {}));
  assert.equal(counts.pectoraux.mine, 1);
});

test('banque commune : fusion avec la banque intégrée, export d’un exercice perso', () => {
  const shared = [{ id: 'ex-perso', fr: 'Pin squat haut', eq: 'barre', mech: 'poly', p: ['quadriceps'], s: [] }, { id: 'ex-traction', fr: 'pirate' }];
  const index = buildBankIndex(shared);
  assert.equal(index.get('ex-perso').source, 'commune');
  assert.equal(index.get('ex-traction').fr, 'Tractions pronation'); // la banque intégrée n'est jamais écrasée
  const entry = bankEntryFromExercise({ id: 'ex-x', name: 'Mon exo', standard: 'My move', equipment: 'poulie', mechanic: 'iso', muscleGroup: 'Biceps', unilateral: true });
  assert.deepEqual(entry.p, ['biceps']);
  assert.equal(entry.uni, true);
});
