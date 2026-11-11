import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoSessions, isDemoSession } from '../js/domain/demo.js';
import { SEED_TEMPLATES, SEED_EXERCISES } from '../js/data/seed-program.js';
import { DEFAULT_SETTINGS } from '../js/data/defaults.js';
import { suggest } from '../js/domain/progression.js';

const getExercise = (id) => SEED_EXERCISES.find((e) => e.id === id);
const today = '2026-11-11';
const demo = buildDemoSessions({ templates: SEED_TEMPLATES, getExercise, settings: DEFAULT_SETTINGS, today });

test('jeu de test : 4 semaines par séance, toutes avant aujourd\'hui, ids reconnaissables', () => {
  assert.equal(demo.length, SEED_TEMPLATES.length * 4);
  assert.ok(demo.every((s) => s.date < today && s.status === 'done' && isDemoSession(s)));
  assert.equal(new Set(demo.map((s) => s.id)).size, demo.length);
  assert.equal(new Set(demo.flatMap((s) => s.items.flatMap((it) => it.sets.map((x) => x.id)))).size, demo.flatMap((s) => s.items.flatMap((it) => it.sets)).length);
  assert.ok(!isDemoSession({ id: 'ses-abc' }));
});

test('jeu de test : des exercices à augmenter et d\'autres à stabiliser', () => {
  const modes = new Set();
  for (const tpl of SEED_TEMPLATES) for (const b of tpl.blocks) for (const slot of b.slots) {
    const ex = getExercise(slot.exerciseId);
    const target = demo.find((s) => s.templateId === tpl.id).items.find((it) => it.exerciseId === ex.id)?.target;
    if (!target) continue;
    const sug = suggest({ exerciseId: ex.id, target, settings: DEFAULT_SETTINGS, sessions: demo, exercise: ex, templateId: tpl.id });
    if (sug) modes.add(sug.mode);
  }
  assert.ok(modes.has('augmenter') && modes.has('stabiliser'), [...modes].join(','));
});
