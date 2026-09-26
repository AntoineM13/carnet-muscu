/**
 * COURSE À PIED (module optionnel) : saisie des sorties, allure, historique,
 * courbe, plans-types indicatifs. Pas de GPS.
 */
import { h } from '../core/h.js';
import { state, saveDoc, deleteDoc, getRun, saveSettings } from '../core/store.js';
import { todayISO, fmtDateShort, fmtNum, parseNum, clone, fmtDateLong } from '../core/util.js';
import { newRun, paceSec, fmtPace, parseDuration, fmtRunDuration, runsInWeek, planWeekIndex } from '../domain/runs.js';
import { RUN_PLANS } from '../data/run-plans.js';
import { icon } from '../ui/icons.js';
import { topbar, lineChart, segmented, field, emptyState } from '../ui/components.js';
import { go, rerender } from '../core/router.js';
import { openSheet, toast, choose } from '../ui/overlay.js';

let chartMetric = 'pace';

export const runPlans = () => state.settings.runPlans || RUN_PLANS;
export const activePlan = () => runPlans().find((p) => p.id === state.settings.activeRunPlanId) || null;

export function renderRuns() {
  const today = todayISO();
  const runs = [...state.runs].sort((a, b) => b.date.localeCompare(a.date));
  const week = runsInWeek(state.runs, today);
  const km = week.reduce((a, r) => a + (r.distanceKm || 0), 0);
  const target = state.settings.runsPerWeek || 2;
  const chron = [...runs].reverse().slice(-20);
  const points = chron.map((r) => ({
    x: fmtDateShort(r.date),
    y: chartMetric === 'pace' ? (paceSec(r) ? paceSec(r) / 60 : null) : r.distanceKm,
  })).filter((p) => p.y != null);

  const node = h('main.screen.no-tabs', null,
    topbar('Course à pied', {
      backTo: '/',
      actions: h('button.icon-btn.accent', { 'aria-label': 'Nouvelle sortie', onclick: () => openRunSheet() }, icon('plus')),
    }),
    h('div.kv', null,
      h('div.cell', null, h('div.k', null, 'Semaine'), h('div.v', null, `${week.length}`, h('small', null, ` / ${target}`))),
      h('div.cell', null, h('div.k', null, 'Distance'), h('div.v', null, fmtNum(km, 1), h('small', null, ' km'))),
      h('div.cell', null, h('div.k', null, 'Total'), h('div.v', null, runs.length, h('small', null, ' sorties')))),
    h('button.btn.primary.block.lg', { style: { marginTop: '14px' }, onclick: () => openRunSheet() }, icon('plus', 'sm'), 'Ajouter une sortie'),
    planSection(today),
    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Évolution')),
      segmented([{ value: 'pace', label: 'Allure (min/km)' }, { value: 'dist', label: 'Distance (km)' }], chartMetric, (v) => { chartMetric = v; rerender(); }),
      h('div.card', { style: { marginTop: '10px', padding: '12px 8px 6px' } },
        points.length ? lineChart(points, { fmtY: (v) => (chartMetric === 'pace' ? fmtPace(v * 60).replace(' /km', '') : fmtNum(v, 1)) })
          : h('p.muted.small.center', { style: { padding: '28px 0' } }, 'La courbe apparaîtra après ta première sortie.'),
        chartMetric === 'pace' && points.length ? h('p.tiny.faint', { style: { padding: '0 8px 6px' } }, 'Plus bas = plus rapide') : null)),
    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Historique')),
      runs.length ? h('div.list', null, runs.map(runRow)) : emptyState('run', 'Aucune sortie enregistrée.')));
  return { node, tab: null };
}

export function runRow(r) {
  return h('button.list-row', { onclick: () => openRunSheet(r.id) },
    h('div.hist-date', null, h('span.num', null, r.date.slice(8)), h('span', null, fmtDateShort(r.date).split(' ')[1])),
    h('div.grow', null,
      h('div.title.num', null, `${fmtNum(r.distanceKm || 0, 2)} km · ${fmtRunDuration(r.durationSec) || '–'}`),
      h('div.sub.num', null, fmtPace(paceSec(r)), r.note ? h('span.faint', null, ` · ${r.note}`) : null)),
    h('span.chev', null, icon('chevron', 'sm')));
}

/* --------------------------------------------------------- Saisie -- */
export function openRunSheet(runId = null, date = todayISO()) {
  const r = runId ? clone(getRun(runId)) : newRun(date);
  const isNew = !runId;
  let durTxt = fmtRunDuration(r.durationSec);
  openSheet({
    title: isNew ? 'Nouvelle sortie' : 'Sortie',
    render: (api) => {
      const paceEl = h('div.run-pace.num', null, fmtPace(paceSec(r)));
      const upd = () => { paceEl.textContent = fmtPace(paceSec(r)); };
      return [
        field('Date', h('input.input', { type: 'date', value: r.date, max: todayISO(), onchange: (e) => { if (e.target.value) r.date = e.target.value; } })),
        h('div.field-row', { style: { marginTop: '12px' } },
          field('Distance (km)', h('input.input.num', {
            type: 'text', inputmode: 'decimal', placeholder: 'ex. 5,2', value: r.distanceKm == null ? '' : fmtNum(r.distanceKm, 2),
            oninput: (e) => { r.distanceKm = parseNum(e.target.value); upd(); },
          })),
          field('Durée (min ou h:mm:ss)', h('input.input.num', {
            type: 'text', inputmode: 'numeric', placeholder: 'ex. 28:30', value: durTxt,
            oninput: (e) => { durTxt = e.target.value; r.durationSec = parseDuration(e.target.value); upd(); },
          }))),
        h('div.run-pace-wrap', null, h('span.eyebrow', null, 'Allure'), paceEl),
        field('Note', h('input.input', { type: 'text', value: r.note || '', placeholder: 'Sensations, parcours, type de séance…', onchange: (e) => { r.note = e.target.value; } })),
        h('div.sheet-actions', null,
          h('button.btn.primary.block.lg', {
            onclick: () => {
              if (!r.distanceKm || !r.durationSec) { toast('Indique la distance et la durée.'); return; }
              saveDoc('runs', r); api.close(); rerender();
            },
          }, isNew ? 'Enregistrer la sortie' : 'Enregistrer'),
          !isNew && h('button.btn.danger.block', {
            onclick: () => {
              const snap = clone(getRun(r.id)); deleteDoc('runs', r.id); api.close();
              toast('Sortie supprimée', { undo: () => saveDoc('runs', snap) });
            },
          }, icon('trash', 'sm'), 'Supprimer')),
      ];
    },
  });
}

/* ------------------------------------------------------------ Plan -- */
function planSection(today) {
  const plan = activePlan();
  if (!plan) {
    return h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Plan indicatif')),
      h('div.card.stack', null,
        h('p.small.muted', null, 'Des plans-types pour te donner un repère (1 à 2 sorties par semaine). Ils sont indicatifs et modifiables : écoute tes sensations.'),
        h('button.btn.ghost.block', { onclick: pickPlan }, 'Choisir un plan')));
  }
  const wi = planWeekIndex(plan, state.settings.runPlanStart, today);
  const wk = plan.weeks[wi];
  return h('section.section', null,
    h('div.section-head', null, h('h2', null, 'Plan indicatif'), h('button.link', { onclick: () => planMenu(plan) }, 'Gérer')),
    h('div.card', null,
      h('div.row-flex', null, h('div.grow', null, h('div.title', null, plan.name), h('div.small.muted', null, `Semaine ${wi + 1} sur ${plan.weeks.length}`))),
      h('div.stack', { style: { marginTop: '12px', gap: '8px' } },
        wk.sessions.map((s, i) => h('div.plan-session', null, h('span.slot-letter', null, i + 1), h('span.grow', null, s)))),
      h('p.tiny.faint', { style: { marginTop: '10px' } }, 'Plan indicatif, à adapter à ta forme. Il ne remplace pas l’avis d’un professionnel.')));
}

async function pickPlan() {
  const v = await choose({
    title: 'Plans-types',
    subtitle: 'Indicatifs. Tu pourras modifier chaque semaine.',
    options: runPlans().map((p) => ({ value: p.id, label: p.name, help: p.description, on: p.id === state.settings.activeRunPlanId })),
  });
  if (v) { saveSettings({ activeRunPlanId: v, runPlanStart: todayISO(), runPlans: clone(runPlans()) }); rerender(); }
}

async function planMenu(plan) {
  const v = await choose({
    title: plan.name,
    options: [
      { value: 'edit', label: 'Modifier les semaines', icon: 'edit' },
      { value: 'restart', label: 'Recommencer à la semaine 1', icon: 'undo' },
      { value: 'change', label: 'Changer de plan', icon: 'swap' },
      { value: 'stop', label: 'Arrêter le plan', icon: 'close' },
    ],
  });
  if (v === 'edit') editPlan(plan.id);
  if (v === 'restart') saveSettings({ runPlanStart: todayISO() });
  if (v === 'change') pickPlan();
  if (v === 'stop') saveSettings({ activeRunPlanId: null });
}

function editPlan(planId) {
  const plans = clone(runPlans());
  const plan = plans.find((p) => p.id === planId);
  openSheet({
    title: 'Modifier le plan',
    onClose: () => { saveSettings({ runPlans: plans }); rerender(); },
    render: (api) => [
      h('p.sheet-sub', null, 'Une ligne par sortie.'),
      ...plan.weeks.map((w, i) => h('div.field', { style: { marginBottom: '12px' } },
        h('label', null, `Semaine ${i + 1}`),
        h('textarea.textarea', { style: { minHeight: '70px' }, oninput: (e) => { w.sessions = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); } }, w.sessions.join('\n')))),
      h('div.row-flex', null,
        h('button.btn.ghost.grow', { onclick: () => { plan.weeks.push({ sessions: ['Sortie facile 30 min'] }); api.refresh(); } }, icon('plus', 'sm'), 'Semaine'),
        plan.weeks.length > 1 && h('button.btn.ghost.grow', { onclick: () => { plan.weeks.pop(); api.refresh(); } }, icon('minus', 'sm'), 'Semaine')),
      h('div.sheet-actions', null, h('button.btn.primary.block', { onclick: () => api.close() }, 'Terminé')),
    ],
  });
}

/* ------------------------------------------ Intégrations (accueil…) -- */

/** Carte « Course » de l'accueil. */
export function runsHomeCard(today) {
  if (!state.settings.runsEnabled) return null;
  const week = runsInWeek(state.runs, today);
  const target = state.settings.runsPerWeek || 2;
  const plan = activePlan();
  const wk = plan ? plan.weeks[planWeekIndex(plan, state.settings.runPlanStart, today)] : null;
  const nextTxt = wk && week.length < wk.sessions.length ? wk.sessions[week.length] : null;
  return h('section.section', null,
    h('div.section-head', null, h('h2', null, 'Course à pied'), h('button.link', { onclick: () => go('/runs') }, 'Voir tout')),
    h('div.card.run-card', null,
      h('div.row-flex', null,
        h('span.lead.accent', null, icon('run', 'sm')),
        h('div.grow', null,
          h('div.title', null, `${week.length} / ${target} sortie${target > 1 ? 's' : ''} cette semaine`),
          nextTxt ? h('div.small.muted', null, `Plan : ${nextTxt}`) : h('div.small.muted', null, week.length ? `${fmtNum(week.reduce((a, r) => a + (r.distanceKm || 0), 0), 1)} km` : 'Pas encore de sortie')),
        h('button.btn.sm.ghost', { onclick: () => openRunSheet() }, icon('plus', 'sm'), 'Sortie'))));
}

export { fmtDateLong };
