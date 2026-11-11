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
import { suggest, autoMode, lastPerformance } from '../js/domain/progression.js';
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

/* --- Même exercice en force et en volume dans deux séances différentes --- */
function ctxSession(date, templateId, target, sets) {
  const s = doneSession(date, 'ex-a', sets);
  s.id = `s-${date}-${templateId}`; s.templateId = templateId; s.items[0].target = target;
  return s;
}
const FORCE = { sets: 3, repMin: 4, repMax: 6, restSec: 180, increment: 2.5 };
const VOLUME = { sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 2.5 };

test('progression : la séance force se base sur la dernière séance force, pas sur le volume', () => {
  const s = [
    ctxSession('2026-10-01', 't-force', FORCE, [[80, 5], [80, 5], [80, 4]]),
    ctxSession('2026-10-03', 't-volume', VOLUME, [[60, 12], [60, 12], [60, 12]]),
  ];
  const force = suggest({ exerciseId: 'ex-a', target: FORCE, sessions: s, settings: DEFAULT_SETTINGS, templateId: 't-force' });
  assert.equal(force.mode, 'stabiliser');
  assert.equal(force.sets[0].load, 80);
  assert.equal(force.last.context, 'seance');
  const volume = suggest({ exerciseId: 'ex-a', target: VOLUME, sessions: s, settings: DEFAULT_SETTINGS, templateId: 't-volume' });
  assert.equal(volume.mode, 'augmenter');
  assert.equal(volume.sets[0].load, 62.5);
});

test('progression : à défaut de la même séance, même plage de reps, sinon la dernière fois', () => {
  const s = [
    ctxSession('2026-10-01', 't-force', FORCE, [[80, 6], [80, 6], [80, 6]]),
    ctxSession('2026-10-03', 't-volume', VOLUME, [[60, 11], [60, 10], [60, 10]]),
  ];
  const libre = suggest({ exerciseId: 'ex-a', target: FORCE, sessions: s, settings: DEFAULT_SETTINGS, templateId: 't-autre' });
  assert.equal(libre.last.context, 'plage');
  assert.deepEqual(libre.sets[0], { load: 82.5, reps: 4 });
  const T2 = { sets: 3, repMin: 6, repMax: 8, restSec: 90, increment: 2.5 };
  const autre = lastPerformance('ex-a', s, { templateId: 't-autre', target: T2 });
  assert.equal(autre.context, 'autre');
  assert.equal(autre.date, '2026-10-03');
});

import { effectiveIncrement } from '../js/domain/program.js';
test('incrément : fiche exercice, sinon matériel (réglable), sinon défaut', () => {
  assert.equal(effectiveIncrement({ equipment: 'halteres' }, DEFAULT_SETTINGS), 2);
  assert.equal(effectiveIncrement({ equipment: 'poulie' }, DEFAULT_SETTINGS), 5);
  assert.equal(effectiveIncrement({ equipment: 'barre' }, DEFAULT_SETTINGS), 2.5);
  assert.equal(effectiveIncrement({ equipment: 'halteres', increment: 1 }, DEFAULT_SETTINGS), 1);
  assert.equal(effectiveIncrement({ equipment: 'machine' }, { ...DEFAULT_SETTINGS, increments: { machine: 4.5 } }), 4.5);
  // Ancien réglage sans « increments » : valeurs par défaut du matériel.
  assert.equal(effectiveIncrement({ equipment: 'halteres' }, { defaultIncrement: 2.5 }), 2);
  const t = S.targetFrom({ sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 2.5 }, DEFAULT_SETTINGS, { equipment: 'halteres' });
  assert.equal(t.increment, 2);
});

test('dégressive saisie à part : détectée puis regroupée', () => {
  const at = (sec) => new Date(Date.UTC(2026, 10, 8, 10, 0, sec)).toISOString();
  const mk = (id, load, reps, sec, type = 'normale') => ({ id, type, done: true, doneAt: at(sec), restTakenSec: null, stages: [{ load, reps }] });
  const session = { rest: null, items: [{ id: 'it', exerciseId: 'ext', target: {}, sets: [mk('a', 100, 10, 0), mk('b', 100, 10, 150), mk('c', 73, 10, 156)] }] };
  assert.equal(S.dropCandidate(session, 'b'), null);      // 150 s après : vraie série
  assert.equal(S.dropCandidate(session, 'c').id, 'b');    // 6 s après, −27 % : palier
  // Saisie groupée à la fin, charge à peine plus basse : pas de proposition.
  const s2 = { rest: null, items: [{ id: 'it', exerciseId: 'dc', target: {}, sets: [mk('x', 100, 5, 0), mk('y', 90, 7, 10)] }] };
  assert.equal(S.dropCandidate(s2, 'y'), null);
  assert.ok(S.mergeIntoDrop(session, 'b', 'c'));
  const sets = session.items[0].sets;
  assert.equal(sets.length, 2);
  assert.equal(sets[1].type, 'degressive');
  assert.deepEqual(sets[1].stages, [{ load: 100, reps: 10 }, { load: 73, reps: 10 }]);
});

test('repos : non enregistré au-delà de 15 min (app oubliée)', () => {
  const session = { rest: { setId: 'a', startedAt: 0 }, items: [{ id: 'it', sets: [{ id: 'a', stages: [{}] }] }] };
  S.closeRest(session, 16 * 60 * 1000);
  assert.equal(session.items[0].sets[0].restTakenSec, null);
  session.rest = { setId: 'a', startedAt: 0 };
  S.closeRest(session, 120 * 1000);
  assert.equal(session.items[0].sets[0].restTakenSec, 120);
});

import { mergeExercises } from '../js/domain/program.js';
test('fusion de deux exercices : historique, programme, objectifs et notes regroupés', () => {
  const from = { id: 'dup', name: 'Fentes bulgares', notes: 'banc bas' };
  const to = { id: 'keep', name: 'Squat bulgare', notes: '' };
  const sessions = [
    { id: 's1', status: 'done', items: [{ exerciseId: 'dup', alternatives: ['dup', 'other'], sets: [] }] },
    { id: 's2', status: 'done', items: [{ exerciseId: 'other', replacedBy: 'dup', sets: [] }] },
    { id: 's3', status: 'done', items: [{ exerciseId: 'other', sets: [] }] },
  ];
  const templates = [{ id: 't', blocks: [{ slots: [{ exerciseId: 'keep', alternatives: ['dup', 'x'] }, { exerciseId: 'dup', alternatives: [] }] }] }];
  const goals = [{ id: 'g', exerciseId: 'dup' }];
  const res = mergeExercises({ sessions, templates, goals, from, to });
  assert.equal(res.sessions.length, 2);
  assert.equal(res.historyCount, 2);
  assert.equal(sessions[0].items[0].exerciseId, 'keep');
  assert.deepEqual(sessions[0].items[0].alternatives, ['keep', 'other']);
  assert.equal(sessions[1].items[0].replacedBy, 'keep');
  assert.deepEqual(templates[0].blocks[0].slots[0].alternatives, ['x']); // plus d'alternative vers lui-même
  assert.equal(templates[0].blocks[0].slots[1].exerciseId, 'keep');
  assert.equal(goals[0].exerciseId, 'keep');
  assert.equal(to.notes, 'banc bas');
});

test('dayLabel : choix du jour de la séance', async () => {
  const { dayLabel } = await import('../js/core/util.js');
  assert.equal(dayLabel('2026-11-11', '2026-11-11'), "Aujourd'hui");
  assert.equal(dayLabel('2026-11-10', '2026-11-11'), 'Hier');
  assert.equal(dayLabel('2026-11-09', '2026-11-11'), 'Lun. 9 nov.');
});

test('setComparison : dernière fois et objectif côte à côte, par série', async () => {
  const { setComparison } = await import('../js/domain/progression.js');
  const st = (load, reps) => ({ type: 'normale', done: true, stages: [{ load, reps }] });
  const last = { sets: [st(60, 12), st(60, 10)] };
  assert.deepEqual(setComparison(last, [{ load: 62.5, reps: 8 }, { load: 60, reps: 11 }], 0), { last: { load: 60, reps: 12 }, target: { load: 62.5, reps: 8 }, trend: 'up' });
  assert.equal(setComparison(last, [{ load: 62.5, reps: 8 }, { load: 60, reps: 11 }], 1).trend, 'up');
  assert.equal(setComparison(last, [{ load: 54, reps: 12 }], 0).trend, 'down');
  const third = setComparison(last, null, 2);
  assert.equal(third.last, null); assert.equal(third.target, null);
  assert.equal(setComparison(null, [{ load: null, reps: null }], 0).target, null);
});

test('suggestions coupées : les séries reprennent la dernière fois', async () => {
  const { prefillSets } = await import('../js/domain/progression.js');
  const target = { sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 2.5 };
  const past = { id: 'p1', status: 'done', date: '2026-11-04', templateId: 't1', items: [{ exerciseId: 'ex1', target, sets: [
    { type: 'normale', done: true, stages: [{ load: 60, reps: 12 }] },
    { type: 'normale', done: true, stages: [{ load: 60, reps: 12 }] },
    { type: 'normale', done: true, stages: [{ load: 60, reps: 12 }] }] }] };
  const on = prefillSets('ex1', 3, [past], { target, templateId: 't1', settings: { ...DEFAULT_SETTINGS } });
  assert.equal(on[0].load, 62.5); // haut de plage atteint : on monte
  const off = prefillSets('ex1', 3, [past], { target, templateId: 't1', settings: { ...DEFAULT_SETTINGS, suggestionsEnabled: false } });
  assert.deepEqual(off, [{ load: 60, reps: 12 }, { load: 60, reps: 12 }, { load: 60, reps: 12 }]);
});

test('compactSets et comparisonRows : même écriture partout', async () => {
  const { compactSets, comparisonRows } = await import('../js/domain/progression.js');
  const st = (load, reps) => ({ type: 'normale', done: true, stages: [{ load, reps }] });
  const f = (n) => String(n).replace('.', ',');
  assert.equal(compactSets([st(40, 11), st(40, 11), st(40, 10)], f), '40 kg × 11 / 11 / 10');
  assert.equal(compactSets([st(40, 11), st(42.5, 9)], f), '40×11 · 42,5×9');
  assert.equal(compactSets([st(0, 12), st(0, 10)], f, { lest: true }), 'PDC × 12 / 10');
  assert.equal(compactSets([], f), '');
  const rows = comparisonRows({ sets: [st(40, 11), st(40, 10)] }, [{ load: 36, reps: 12 }, { load: 36, reps: 12 }, { load: 36, reps: 12 }]);
  assert.equal(rows.length, 3);
  assert.equal(rows[2].last, null);
  assert.equal(rows[0].trend, 'down');
});
