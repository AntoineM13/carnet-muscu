/**
 * PROGRÈS : tableau de bord (semaine, tendances par séance, courbes par
 * exercice) puis objectifs. Remplace l'ancien onglet « Objectifs ».
 * Calculs : js/domain/dashboard.js (séance par séance, force et volume
 * ne se mélangent pas).
 */
import { h } from '../core/h.js';
import { state, exerciseName, getExercise } from '../core/store.js';
import { fmtNum, fmtInt, fmtDateShort, todayISO } from '../core/util.js';
import { weekSummary, templateTrends } from '../domain/dashboard.js';
import { exerciseHistory } from '../domain/stats.js';
import { screenHead, emptyState } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { rerender } from '../core/router.js';
import { goalsSection } from './goals.js';
import { exerciseChart } from './exercise-progress.js';
import { pickExercise } from '../ui/pickers.js';

// Choix mémorisés pendant la session de l'app.
let selectedTemplateId = null;
let chartExerciseId = null;

export function renderProgress() {
  const today = todayISO();
  const hasHistory = state.sessions.some((s) => s.status === 'done');
  const node = h('main.screen', null,
    screenHead('Progrès', null),
    hasHistory
      ? [weekSection(today), templateSection(today), chartSection()]
      : emptyState('chart', 'Le suivi apparaîtra après ta première séance terminée.'),
    goalsSection());
  return { node, tab: 'goals' };
}

/* ------------------------------------------------------------ Semaine -- */
function weekSection(today) {
  const w = weekSummary(state.sessions, today, exerciseName);
  const d = w.volumeDeltaPct;
  const deltaTxt = d == null ? (w.prevVolumeToDate === 0 && w.volume > 0 ? 'Rien à ce stade la semaine dernière' : '')
    : `${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(d), 0)} % vs semaine dernière à ce stade`;
  // Un exercice = une ligne, même s'il bat plusieurs records.
  const byEx = new Map();
  for (const r of w.records) {
    if (!byEx.has(r.exerciseId)) byEx.set(r.exerciseId, { name: r.name, date: r.date, parts: [] });
    const e = byEx.get(r.exerciseId);
    e.parts.push(r.kind === 'Volume' ? `volume ${fmtInt(r.value)} kg` : `${r.kind.toLowerCase()} ${fmtNum(r.value, 1)} kg${r.reps ? ` × ${r.reps}` : ''}`);
    if (r.date > e.date) e.date = r.date;
  }
  const recs = [...byEx.values()];
  return h('section.section', null,
    h('div.section-head', null, h('h2', null, 'Cette semaine'), h('span.small.faint', null, `${fmtDateShort(w.start)} → ${fmtDateShort(w.end)}`)),
    h('div.kv', null,
      cell('Séances', String(w.count), w.prevCount ? `${w.prevCount} la semaine dernière` : null),
      cell('Volume', w.volume ? fmtInt(w.volume) : '0', null, 'kg'),
      cell('Records', String(recs.length), recs.length ? `exercice${recs.length > 1 ? 's' : ''}` : null)),
    deltaTxt && h('p.small', { style: { margin: '8px 2px 0', color: d != null && d < 0 ? 'var(--text-2)' : 'var(--accent)' } }, deltaTxt),
    recs.length ? h('div.list', { style: { marginTop: '10px' } }, recs.slice(0, 6).map((r) => h('div.list-row', null,
      h('span.lead.accent', null, icon('trophy', 'sm')),
      h('div.grow', null,
        h('div.title.ellipsis', null, r.name),
        h('div.sub.num', null, `${r.parts.join(' · ')} · ${fmtDateShort(r.date)}`.replace(/^./, (c) => c.toUpperCase())))))) : null);
}

function cell(k, v, sub, unit = null) {
  return h('div.cell', null, h('div.k', null, k),
    h('div.v.num', null, v, unit ? h('small', null, ` ${unit}`) : null),
    sub ? h('div.tiny.faint', { style: { marginTop: '2px' } }, sub) : null);
}

/* ---------------------------------------------------------- Par séance -- */
function templateSection(today) {
  const templates = state.templates.filter((t) => !t.archived);
  if (!templates.length) return null;
  if (!templates.some((t) => t.id === selectedTemplateId)) {
    const lastDone = [...state.sessions].filter((s) => s.status === 'done' && templates.some((t) => t.id === s.templateId))
      .sort((a, b) => (b.date + (b.startedAt || '')).localeCompare(a.date + (a.startedAt || '')))[0];
    selectedTemplateId = lastDone?.templateId || templates[0].id;
  }
  const t = templates.find((x) => x.id === selectedTemplateId);
  const rows = templateTrends(t, state.sessions, today);
  return h('section.section', null,
    h('div.section-head', null, h('h2', null, 'Par séance')),
    h('div.chips', { style: { marginBottom: '10px' } }, templates.map((x) => h(`button.chip${x.id === t.id ? '.on' : ''}`, {
      onclick: () => { selectedTemplateId = x.id; rerender(); },
    }, x.name))),
    h('p.tiny.faint', { style: { margin: '0 2px 8px' } }, 'Dernière fois dans cette séance, et évolution sur 4 semaines.'),
    h('div.list', null, rows.map((r) => trendRow(r))));
}

function trendRow(r) {
  const name = exerciseName(r.exerciseId);
  const cur = r.current;
  const sub = cur ? `${fmtNum(cur.topLoad)} kg × ${cur.topReps} · ${fmtDateShort(cur.date)}` : 'Pas encore fait dans cette séance';
  let badge = null;
  if (r.trend) {
    const cls = r.trend === 'up' ? '.accent' : r.trend === 'down' ? '.warn' : '.outline';
    const ic = r.trend === 'up' ? 'up' : r.trend === 'down' ? 'down' : null;
    const txt = r.deltaLoad ? `${r.deltaLoad > 0 ? '+' : '−'}${fmtNum(Math.abs(r.deltaLoad))} kg` : r.trend === 'flat' ? 'Stable' : (r.trend === 'up' ? 'Reps +' : 'Reps −');
    badge = h(`span.badge${cls}.num`, null, ic && icon(ic, 'sm'), txt);
  } else if (cur) badge = h('span.badge.outline', null, '1re fois');
  return h('button.list-row', {
    onclick: () => { chartExerciseId = r.exerciseId; rerender(); requestAnimationFrame(() => document.getElementById('progress-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
  },
  h('div.grow', null, h('div.title.ellipsis', null, name), h('div.sub.num', null, sub)),
  badge);
}

/* -------------------------------------------------------------- Courbe -- */
function chartSection() {
  const withHistory = new Set(state.sessions.filter((s) => s.status === 'done').flatMap((s) => s.items.map((it) => it.exerciseId)));
  if (!chartExerciseId || !getExercise(chartExerciseId) || !exerciseHistory(chartExerciseId, state.sessions).length) {
    // Par défaut : le premier exercice de la séance sélectionnée qui a un historique.
    const t = state.templates.find((x) => x.id === selectedTemplateId);
    const first = t?.blocks.flatMap((b) => b.slots).map((s) => s.exerciseId).find((id) => withHistory.has(id));
    chartExerciseId = first || [...withHistory][0] || null;
  }
  if (!chartExerciseId) return null;
  return h('section.section', { id: 'progress-chart' },
    h('div.section-head', null, h('h2', null, 'Courbe')),
    h('button.option', {
      onclick: async () => {
        const id = await pickExercise({ title: 'Courbe de…', highlight: [...withHistory] });
        if (id) { chartExerciseId = id; rerender(); }
      },
    }, h('div.grow', null, h('div.t', null, exerciseName(chartExerciseId)), h('div.d', null, 'Toucher pour changer d’exercice')), icon('swap')),
    h('div', { style: { height: '10px' } }),
    exerciseChart(getExercise(chartExerciseId)));
}
