/**
 * Tests des modules métier (sans navigateur).
 * Lancer : node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { weekKey, weekDates, weekday, addDays, parseNum, roundTo } from '../js/core/util.js';
import * as P from '../js/domain/planning.js';
import * as S from '../js/domain/session.js';
import { sessionSummary, e1rm, personalRecords } from '../js/domain/stats.js';
import { warmupSets, plateBreakdown, proposeDropLoad } from '../js/domain/tools.js';
import { SEED_TEMPLATES, SEED_EXERCISES, SEED_DEFAULT_SCHEDULE } from '../js/data/seed-program.js';
import { DEFAULT_SETTINGS } from '../js/data/defaults.js';

test('dates : semaine ISO du lundi au dimanche', () => {
  assert.equal(weekday('2026-09-28'), 1); // lundi
  assert.equal(weekday('2026-09-27'), 7); // dimanche
  assert.equal(weekKey('2026-09-27'), '2026-W39');
  assert.equal(weekKey('2026-09-28'), '2026-W40');
  assert.deepEqual(weekDates('2026-09-30')[0], '2026-09-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekKey('2027-01-01'), '2026-W53');
});

test('nombres : virgule française et arrondi', () => {
  assert.equal(parseNum('22,5'), 22.5);
  assert.equal(parseNum(''), null);
  assert.equal(roundTo(23.4, 2.5), 22.5);
});

const mkSchedule = () => ({ default: { ...SEED_DEFAULT_SCHEDULE }, weeks: {} });

test('planning : génération de la semaine et proposition', () => {
  const sch = mkSchedule();
  const wed = '2026-09-30';
  const w = P.ensureWeek(sch, wed);
  assert.equal(w.items.length, 4);
  assert.equal(P.nextProposal(sch, wed).item.templateId, 'tpl-pec-dos');
  // Lundi : rien aujourd'hui -> prochaine prévue = mercredi
  assert.equal(P.nextProposal(sch, '2026-09-28').reason, 'next');
  // Jeudi : Pec/Dos non faite mercredi -> en retard
  const p = P.nextProposal(sch, '2026-10-01');
  assert.equal(p.reason, 'late');
  assert.equal(P.dayInfo(sch, wed, '2026-10-01').state, 'late');
});

test('planning : intervertir / décaler / sauter', () => {
  let sch = mkSchedule();
  // Mettre Jambes (vendredi) le mercredi, en intervertissant
  let a = P.analyzePlace(sch, 'tpl-jambes', '2026-09-30');
  assert.deepEqual(a.options, ['swap', 'shift', 'skip']);
  P.placeTemplate(sch, 'tpl-jambes', '2026-09-30', 'swap');
  const w = P.ensureWeek(sch, '2026-09-30');
  const on = (d) => w.items.filter((i) => i.plannedDate === d && P.isActive(i)).map((i) => i.templateId);
  assert.deepEqual(on('2026-09-30'), ['tpl-jambes']);
  assert.deepEqual(on('2026-10-02'), ['tpl-pec-dos']);

  // Décaler : Pec/Dos mercredi remplacée par Jambes -> prochain jour libre = jeudi
  sch = mkSchedule();
  P.placeTemplate(sch, 'tpl-jambes', '2026-09-30', 'shift');
  const w2 = P.ensureWeek(sch, '2026-09-30');
  assert.equal(w2.items.find((i) => i.templateId === 'tpl-pec-dos').plannedDate, '2026-10-01');
  assert.equal(w2.items.find((i) => i.templateId === 'tpl-pec-dos').status, 'moved');

  // Sauter
  sch = mkSchedule();
  P.placeTemplate(sch, 'tpl-jambes', '2026-09-30', 'skip');
  const w3 = P.ensureWeek(sch, '2026-09-30');
  assert.equal(w3.items.find((i) => i.templateId === 'tpl-pec-dos').status, 'skipped');

  // Repos sur un jour prévu -> décaler
  sch = mkSchedule();
  P.placeTemplate(sch, null, '2026-10-04', 'shift');
  const w4 = P.ensureWeek(sch, '2026-10-04');
  assert.equal(w4.items.find((i) => i.templateId === 'tpl-bras-epaules').status, 'moved');
  assert.equal(w4.items.find((i) => i.templateId === 'tpl-bras-epaules').plannedDate, null);
});

test('planning par défaut : intervertir', () => {
  const sch = mkSchedule();
  P.setDefault(sch, 3, 'tpl-jambes', 'swap');
  assert.equal(sch.default[3], 'tpl-jambes');
  assert.equal(sch.default[5], 'tpl-pec-dos');
});

const exMap = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
const ctx = (sessions = []) => ({ getExercise: (id) => exMap.get(id), sessions, settings: DEFAULT_SETTINGS });

test('séance : superset alterné et repos après le tour', () => {
  const tpl = SEED_TEMPLATES.find((t) => t.id === 'tpl-bras-epaules');
  const s = S.createSession({ template: tpl, date: '2026-10-04', ctx: ctx() });
  const st = S.steps(s);
  assert.equal(st.length, 4);
  assert.ok(st[0].isSuperset);
  const order = S.orderedSets(st[0]).map((e) => e.label);
  assert.deepEqual(order, ['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  const [a1, b1] = S.orderedSets(st[0]);
  a1.set.stages[0] = { load: 12, reps: 10 };
  assert.equal(S.validateSet(s, a1.set.id), 0);
  assert.equal(S.validateSet(s, b1.set.id), 90);
});

test('séance : dégressive, stats et records', () => {
  const tpl = SEED_TEMPLATES[0];
  const s1 = S.createSession({ template: tpl, date: '2026-09-30', ctx: ctx() });
  const it = s1.items[0];
  it.sets.forEach((set) => { set.stages[0] = { load: 60, reps: 10 }; S.validateSet(s1, set.id); });
  S.addStage(it.sets[2], { dropPct: 20, increment: 2.5 });
  assert.equal(it.sets[2].stages[1].load, 47.5);
  assert.equal(it.sets[2].type, 'degressive');
  it.sets[2].stages[1].reps = 6;
  S.finishSession(s1);
  const sum = sessionSummary(s1, [s1]);
  assert.equal(sum.volume, 60 * 10 * 3 + 47.5 * 6);
  assert.equal(sum.sets, 3);

  const s2 = S.createSession({ template: tpl, date: '2026-10-07', ctx: ctx([s1]) });
  s2.startedAt = new Date(Date.now() + 1000).toISOString();
  // préremplissage depuis la dernière fois
  assert.equal(s2.items[0].sets[0].stages[0].load, 60);
  s2.items[0].sets.forEach((set) => { set.stages[0] = { load: 62.5, reps: 8 }; S.validateSet(s2, set.id); });
  S.finishSession(s2);
  const sum2 = sessionSummary(s2, [s1, s2]);
  assert.ok(sum2.records.some((r) => r.kind === 'Charge max' && r.value === 62.5));
  const pr = personalRecords(tpl.blocks[0].slots[0].exerciseId, [s1, s2]);
  assert.equal(pr.maxLoad.value, 62.5);
  assert.equal(Math.round(e1rm(60, 10)), 80);
});

test('séance : remplacement après séries validées -> scission', () => {
  const s = S.createSession({ template: SEED_TEMPLATES[0], date: '2026-09-30', ctx: ctx() });
  const it = s.items[0];
  it.sets[0].stages[0] = { load: 50, reps: 10 };
  S.validateSet(s, it.sets[0].id);
  const fresh = S.replaceExercise(s, it.id, 'ex-dev-incline', ctx());
  assert.notEqual(fresh, it);
  assert.equal(it.sets.length, 1);
  assert.equal(fresh.sets.length, 2);
  assert.equal(s.items[1].exerciseId, 'ex-dev-incline');
  // Même écran, numérotation continue : 1 (ancien), 2 et 3 (remplaçant)
  const st = S.steps(s)[0];
  assert.equal(S.steps(s).length, 5);
  assert.deepEqual(S.orderedSets(st).map((e) => e.label), ['1', '2', '3']);
  assert.equal(st.isSuperset, false);
});

test('séance : remplacement dans un superset -> même couloir', () => {
  const tpl = SEED_TEMPLATES.find((t) => t.id === 'tpl-bras-epaules');
  const s = S.createSession({ template: tpl, date: '2026-10-04', ctx: ctx() });
  const [a1, b1] = S.orderedSets(S.steps(s)[0]);
  a1.set.stages[0] = { load: 12, reps: 10 }; b1.set.stages[0] = { load: 20, reps: 9 };
  S.validateSet(s, a1.set.id); S.validateSet(s, b1.set.id);
  S.replaceExercise(s, b1.item.id, 'ex-curl-marteau', ctx());
  const st = S.steps(s)[0];
  assert.deepEqual(S.orderedSets(st).map((e) => e.label), ['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  assert.equal(S.orderedSets(st)[3].item.exerciseId, 'ex-curl-marteau');
  const blocks = S.blocksFromSession(s, tpl, DEFAULT_SETTINGS);
  assert.equal(blocks[0].slots.length, 2);
});

test('outils : échauffement, disques, dégressive', () => {
  assert.deepEqual(warmupSets(100, DEFAULT_SETTINGS.warmupSteps, { minLoad: 20 }).map((w) => w.load), [50, 70, 85]);
  assert.deepEqual(plateBreakdown(100, 20).perSide, [25, 15]);
  assert.equal(plateBreakdown(101, 20).remainder, 1);
  assert.equal(proposeDropLoad(26, 20, 2), 20);
});

/* ------------------------------------------------ Étape 2 : progression -- */
import { suggest, autoMode } from '../js/domain/progression.js';
import { goalProgress } from '../js/domain/goals.js';

function doneSession(date, exerciseId, sets, extra = []) {
  return {
    id: `s-${date}`, date, startedAt: `${date}T10:00:00.000Z`, status: 'done', items: [{
      id: 'it', exerciseId, target: { sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 2.5 },
      sets: [...extra, ...sets.map(([load, reps], i) => ({ id: `x${i}`, type: 'normale', done: true, stages: [{ load, reps }] }))],
    }],
  };
}
const T = { sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 2.5 };

test('progression : augmenter quand toutes les séries atteignent le haut de la plage', () => {
  const s = [doneSession('2026-09-20', 'ex-a', [[60, 12], [60, 12], [60, 12]])];
  const sug = suggest({ exerciseId: 'ex-a', target: T, sessions: s, settings: DEFAULT_SETTINGS });
  assert.equal(sug.mode, 'augmenter');
  assert.deepEqual(sug.sets[0], { load: 62.5, reps: 8 });
});

test('progression : stabiliser sinon (battre les reps)', () => {
  const s = [doneSession('2026-09-20', 'ex-a', [[60, 12], [60, 10], [60, 9]])];
  const sug = suggest({ exerciseId: 'ex-a', target: T, sessions: s, settings: DEFAULT_SETTINGS });
  assert.equal(sug.mode, 'stabiliser');
  assert.deepEqual(sug.sets.map((x) => x.reps), [12, 11, 10]);
  assert.equal(sug.sets[0].load, 60);
});

test('progression : forme KO -> récup (−10 %, reps hautes, +1 série)', () => {
  const s = [doneSession('2026-09-20', 'ex-a', [[60, 12], [60, 12], [60, 12]])];
  const sug = suggest({ exerciseId: 'ex-a', target: T, sessions: s, settings: DEFAULT_SETTINGS, form: 'ko' });
  assert.equal(sug.mode, 'recup');
  assert.equal(sug.sets.length, 4);
  assert.deepEqual(sug.sets[0], { load: 55, reps: 12 });
});

test('progression : paliers dégressifs et échauffements ignorés', () => {
  const s = [doneSession('2026-09-20', 'ex-a', [[60, 12], [60, 12], [60, 12]], [{ id: 'w', type: 'echauffement', done: true, stages: [{ load: 30, reps: 5 }] }])];
  s[0].items[0].sets[3].stages.push({ load: 45, reps: 4 });
  s[0].items[0].sets[3].type = 'degressive';
  assert.equal(autoMode({ sets: s[0].items[0].sets.filter((x) => x.type !== 'echauffement') }, T), 'augmenter');
  assert.equal(suggest({ exerciseId: 'ex-a', target: T, sessions: s, settings: DEFAULT_SETTINGS }).mode, 'augmenter');
});

test('objectifs : charge × reps et 1RM', () => {
  const s = [doneSession('2026-09-20', 'ex-a', [[28, 8], [30, 6], [26, 10]])];
  const p = goalProgress({ exerciseId: 'ex-a', kind: 'charge_reps', load: 30, reps: 8 }, s);
  assert.equal(p.achieved, false);
  assert.equal(p.remaining, 'Il manque 2 reps à 30 kg');
  const p2 = goalProgress({ exerciseId: 'ex-a', kind: 'charge_reps', load: 28, reps: 8 }, s);
  assert.equal(p2.achieved, true);
  const p3 = goalProgress({ exerciseId: 'ex-a', kind: 'e1rm', target1RM: 40 }, s);
  assert.ok(p3.pct > 80 && p3.pct < 100);
});

/* ------------------------------------------------ Étape 3 : course -- */
import { paceSec, fmtPace, parseDuration, planWeekIndex } from '../js/domain/runs.js';
import { RUN_PLANS } from '../js/data/run-plans.js';

test('course : allure et durée', () => {
  assert.equal(parseDuration('28:30'), 1710);
  assert.equal(parseDuration('30'), 1800);
  assert.equal(parseDuration('1:02:30'), 3750);
  assert.equal(fmtPace(paceSec({ distanceKm: 5, durationSec: 1710 })), '5:42 /km');
  assert.equal(planWeekIndex(RUN_PLANS[0], '2026-09-21', '2026-10-06'), 2);
});
