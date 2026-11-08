import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseSeriesByTemplate, weekSummary, templateTrends } from '../js/domain/dashboard.js';

let n = 0;
function ses(date, templateId, exerciseId, sets, { templateName = templateId, status = 'done', target = { sets: 3, repMin: 8, repMax: 12 } } = {}) {
  n += 1;
  return {
    id: `s${n}`, date, startedAt: `${date}T10:00:00.000Z`, status, templateId, templateName,
    items: [{ id: `it${n}`, exerciseId, target, sets: sets.map(([load, reps], i) => ({ id: `x${n}-${i}`, type: 'normale', done: true, stages: [{ load, reps }] })) }],
  };
}

const history = [
  ses('2026-10-07', 't-force', 'decl', [[80, 5], [80, 5]], { templateName: 'Pec/Dos' }),
  ses('2026-10-10', 't-vol', 'decl', [[60, 10], [60, 9]], { templateName: 'Dos/Pec' }),
  ses('2026-10-14', 't-force', 'decl', [[82.5, 5], [82.5, 4]], { templateName: 'Pec/Dos' }),
  ses('2026-11-04', 't-force', 'decl', [[85, 5], [85, 5]], { templateName: 'Pec/Dos' }),
  ses('2026-11-07', 't-vol', 'decl', [[60, 12], [60, 12]], { templateName: 'Dos/Pec' }),
];

test('dashboard : une courbe par séance, jamais mélangées', () => {
  const series = exerciseSeriesByTemplate('decl', history, 'load');
  assert.equal(series.length, 2);
  assert.equal(series[0].name, 'Pec/Dos');
  assert.deepEqual(series[0].points.map((p) => p.value), [80, 82.5, 85]);
  assert.deepEqual(series[1].points.map((p) => p.value), [60, 60]);
  const e1 = exerciseSeriesByTemplate('decl', history, 'e1rm');
  assert.ok(Math.abs(e1[1].points[0].value - 80) < 0.01); // 60 × (1 + 10/30)
});

test('dashboard : séances libres regroupées à part', () => {
  const s = [...history, ses('2026-11-08', null, 'decl', [[70, 8]], { templateName: 'Séance libre' })];
  const series = exerciseSeriesByTemplate('decl', s, 'load');
  assert.equal(series.length, 3);
  assert.equal(series.find((x) => x.templateId === null).name, 'Séance libre');
});

test('dashboard : tendance sur 4 semaines, calculée dans la séance seulement', () => {
  const tForce = { id: 't-force', blocks: [{ slots: [{ id: 'sl1', exerciseId: 'decl', alternatives: [] }, { id: 'sl2', exerciseId: 'jamais', alternatives: [] }] }] };
  const [row, never] = templateTrends(tForce, history, '2026-11-08');
  assert.equal(row.current.topLoad, 85);
  assert.equal(row.ref.date, '2026-10-07'); // dernière fois il y a au moins 28 jours
  assert.equal(row.deltaLoad, 5);
  assert.equal(row.trend, 'up');
  assert.equal(never.current, null);
  assert.equal(never.trend, null);
  const tVol = { id: 't-vol', blocks: [{ slots: [{ id: 'sl3', exerciseId: 'decl', alternatives: [] }] }] };
  const [vol] = templateTrends(tVol, history, '2026-11-08');
  assert.equal(vol.deltaLoad, 0);
  assert.equal(vol.trend, 'up'); // même charge, plus de reps : 1RM estimé en hausse
});

test('dashboard : alternative réellement faite affichée à la place de l’exercice principal', () => {
  const s = [ses('2026-11-01', 't-x', 'alt', [[30, 10]])];
  const t = { id: 't-x', blocks: [{ slots: [{ id: 'a', exerciseId: 'main', alternatives: ['alt'] }] }] };
  assert.deepEqual(templateTrends(t, s, '2026-11-08').map((r) => r.exerciseId), ['alt']);
});

test('dashboard : résumé de la semaine comparé au même stade la semaine dernière', () => {
  const s = [
    ses('2026-10-27', 't', 'a', [[100, 10]]),            // lundi S-1 : 1000
    ses('2026-10-31', 't', 'a', [[100, 10]]),            // samedi S-1 (après le même stade)
    ses('2026-11-02', 't', 'a', [[100, 10], [100, 10]]), // lundi S : 2000
    ses('2026-11-04', 't', 'a', [[50, 10]], { status: 'active' }),
  ];
  const w = weekSummary(s, '2026-11-04');
  assert.equal(w.start, '2026-11-02');
  assert.equal(w.count, 1);
  assert.equal(w.prevCount, 2);
  assert.equal(w.volume, 2000);
  assert.equal(w.prevVolumeToDate, 1000);
  assert.equal(w.volumeDeltaPct, 100);
  assert.equal(w.sets, 2);
  assert.equal(w.records.length, 1); // volume battu sur « a »
});
