/**
 * Section « Progression » de la fiche exercice : records personnels,
 * graphique (charge max / volume / 1RM estimé) et objectifs liés.
 */
import { h } from '../core/h.js';
import { state } from '../core/store.js';
import { fmtNum, fmtInt, fmtDateShort } from '../core/util.js';
import { exerciseHistory, personalRecords, e1rm } from '../domain/stats.js';
import { goalProgress } from '../domain/goals.js';
import { lineChart, segmented } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { rerender } from '../core/router.js';
import { goalCard, createGoal } from './goals.js';

let metric = 'load';
const METRICS = [
  { value: 'load', label: 'Charge max' },
  { value: 'e1rm', label: '1RM estimé' },
  { value: 'volume', label: 'Volume' },
];

export function exerciseProgressSection(e) {
  const hist = exerciseHistory(e.id, state.sessions);
  const pr = personalRecords(e.id, state.sessions);
  const goals = state.goals.filter((g) => g.exerciseId === e.id);
  const points = hist.slice(-24).map((x) => ({
    x: fmtDateShort(x.date),
    y: metric === 'load' ? x.stats.topLoad : metric === 'e1rm' ? x.stats.bestE1RM : x.stats.volume,
  })).filter((p) => p.y != null);
  // Ligne d'objectif sur le graphique (premier objectif de l'exercice).
  const g0 = goals[0];
  let goalLine = null;
  if (g0 && metric === 'e1rm') goalLine = g0.kind === 'e1rm' ? g0.target1RM : e1rm(g0.load, g0.reps);
  if (g0 && metric === 'load' && g0.kind === 'charge_reps') goalLine = g0.load;

  return [
    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Records')),
      h('div.kv', null,
        recCell('Charge max', pr.maxLoad && `${fmtNum(pr.maxLoad.value)}`, pr.maxLoad && `× ${pr.maxLoad.reps} · ${fmtDateShort(pr.maxLoad.date)}`),
        recCell('1RM estimé', pr.bestE1RM && fmtNum(pr.bestE1RM.value, 1), pr.bestE1RM && fmtDateShort(pr.bestE1RM.date)),
        recCell('Volume', pr.bestVolume && fmtInt(pr.bestVolume.value), pr.bestVolume && fmtDateShort(pr.bestVolume.date)))),
    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Progression')),
      segmented(METRICS, metric, (v) => { metric = v; rerender(); }),
      h('div.card', { style: { marginTop: '10px', padding: '12px 8px 6px' } },
        points.length >= 1 ? lineChart(points, { target: goalLine, fmtY: (v) => (metric === 'volume' ? fmtInt(v) : fmtNum(v, 1)) })
          : h('p.muted.small.center', { style: { padding: '28px 0' } }, 'Le graphique apparaîtra après ta première séance.'),
        goalLine != null && points.length ? h('p.tiny.faint', { style: { padding: '0 8px 6px' } }, 'Pointillés : objectif') : null)),
    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Objectifs'),
        h('button.link', { onclick: () => createGoal(e.id) }, 'Ajouter')),
      goals.length ? h('div.stack', null, goals.map((g) => goalCard({ g, p: goalProgress(g, state.sessions, fmtNum) })))
        : h('button.btn.ghost.block', { onclick: () => createGoal(e.id) }, icon('target', 'sm'), 'Fixer un objectif')),
  ];
}

function recCell(k, v, sub) {
  return h('div.cell', null, h('div.k', null, k),
    h('div.v', null, v ?? '—', v ? h('small', null, ' kg') : null),
    sub ? h('div.tiny.faint', { style: { marginTop: '2px' } }, sub) : null);
}
