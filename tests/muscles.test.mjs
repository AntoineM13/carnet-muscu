import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseMuscles, mainGroup, setMuscles, worksMuscle, musclesSummary, groupsOf, groupIdFromLabel } from '../js/domain/muscles.js';
import { MUSCLE_GROUPS } from '../js/data/defaults.js';

test('muscles : ancien exercice (groupe seul) toujours lisible', () => {
  const e = { muscleGroup: 'Dos' };
  assert.deepEqual(exerciseMuscles(e), { primary: ['dos'], secondary: [] });
  assert.equal(mainGroup(e), 'dos');
  assert.equal(groupIdFromLabel('Inconnu'), 'autre');
  // Les anciens libellés restent des groupes valides.
  for (const g of ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Avant-bras', 'Quadriceps', 'Ischio-jambiers', 'Fessiers', 'Mollets', 'Abdominaux', 'Autre']) assert.ok(MUSCLE_GROUPS.includes(g), g);
});

test('muscles : principal / secondaires, groupe historique tenu à jour', () => {
  const e = { muscleGroup: 'Autre' };
  setMuscles(e, { primary: ['pec-bas'], secondary: ['triceps', 'epaule-avant', 'pec-bas'] });
  assert.equal(e.muscleGroup, 'Pectoraux');
  assert.deepEqual(e.muscles.secondary, ['triceps', 'epaule-avant']);
  assert.deepEqual(groupsOf(e), ['pectoraux', 'triceps', 'epaules']);
  assert.equal(musclesSummary(e), 'Pectoraux (bas) · aussi : Triceps, Épaule avant');
  setMuscles(e, { primary: ['a', 'b', 'c'].map(() => 'quadriceps').concat(['fessiers', 'ischio']), secondary: [] });
  assert.equal(e.muscles.primary.length, 2);
});

test('muscles : recherche par groupe ou par partie', () => {
  const curlMarteau = { muscles: { primary: ['brachial'], secondary: ['avant-bras'] } };
  const curl = { muscles: { primary: ['biceps'], secondary: [] } }; // sans précision
  assert.ok(worksMuscle(curlMarteau, 'biceps'));
  assert.ok(worksMuscle(curlMarteau, 'brachial', 'primary'));
  assert.ok(!worksMuscle(curlMarteau, 'biceps-longue'));
  assert.ok(worksMuscle(curl, 'biceps-longue')); // groupe seul : on ne l'exclut pas
  assert.ok(worksMuscle(curlMarteau, 'avant-bras'));
  assert.ok(!worksMuscle(curlMarteau, 'avant-bras', 'primary'));
});
