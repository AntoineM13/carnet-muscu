/**
 * OBJECTIFS : vue d'ensemble et édition.
 */
import { h } from '../core/h.js';
import { state, saveDoc, deleteDoc, exerciseName, getGoal } from '../core/store.js';
import { fmtNum, fmtDateShort, todayISO, clone } from '../core/util.js';
import { newGoal, goalProgress, goalLabel } from '../domain/goals.js';
import { icon } from '../ui/icons.js';
import { screenHead, emptyState, segmented, stepper, field } from '../ui/components.js';
import { go, rerender } from '../core/router.js';
import { openSheet, toast } from '../ui/overlay.js';
import { pickExercise } from '../ui/pickers.js';

/** Section « Objectifs » de l'onglet Progrès. */
export function goalsSection() {
  const items = state.goals.map((g) => ({ g, p: goalProgress(g, state.sessions, fmtNum) }));
  syncAchieved(items);
  const active = items.filter((x) => !x.p.achieved).sort((a, b) => (a.g.deadline || '9').localeCompare(b.g.deadline || '9'));
  const done = items.filter((x) => x.p.achieved);
  return h('section.section', null,
    h('div.section-head', null,
      h('h2', null, 'Objectifs', items.length ? h('span.small.faint', null, `  ${active.length} en cours · ${done.length} atteint${done.length > 1 ? 's' : ''}`) : null),
      h('button.link', { onclick: () => createGoal() }, 'Ajouter')),
    items.length
      ? [
        active.length ? h('div.stack', null, active.map(goalCard)) : h('p.muted', null, 'Tous tes objectifs sont atteints.'),
        done.length ? [h('div.eyebrow.list-group-title', { style: { marginTop: '14px' } }, 'Atteints'), h('div.stack', null, done.map(goalCard))] : null,
      ]
      : emptyState('target', 'Fixe un objectif sur un exercice : une charge × reps (ex. 30 kg × 8) ou un 1RM estimé.',
        h('button.btn.primary', { onclick: () => createGoal() }, icon('plus', 'sm'), 'Nouvel objectif')));
}

/** Enregistre la date d'atteinte la première fois (et l'efface si l'historique a été corrigé). */
function syncAchieved(items) {
  for (const { g, p } of items) {
    const want = p.achieved ? (g.achievedAt || p.achievedDate) : null;
    if (want !== g.achievedAt) { g.achievedAt = want; saveDoc('goals', g, { silent: true }); }
  }
}

export function goalCard({ g, p }) {
  return h(`button.goal-card${p.achieved ? '.achieved' : ''}`, { onclick: () => openGoalSheet(g.id) },
    h('div.row-flex', null,
      h('div.grow', null,
        h('div.goal-ex.ellipsis', null, exerciseName(g.exerciseId)),
        h('div.goal-target.num', null, goalLabel(g, fmtNum))),
      p.achieved ? h('span.badge.accent', null, icon('check', 'sm'), 'Atteint') : h('span.goal-pct.num', null, `${Math.floor(p.pct)} %`)),
    h('div.progress', { style: { margin: '12px 0 8px' } }, h('span', { style: { width: `${p.pct}%` } })),
    h('div.row-flex.small', null,
      h('span.grow.muted', null, 'Actuel : ', h('span.num', { style: { color: 'var(--text)' } }, p.current)),
      h('span.muted', null, p.achieved ? fmtDateShort(g.achievedAt || p.achievedDate) : p.remaining)),
    g.deadline && !p.achieved ? h('div.tiny', { style: { marginTop: '6px', color: p.daysLeft < 0 ? 'var(--warn)' : 'var(--text-3)' } },
      p.daysLeft < 0 ? `Échéance dépassée (${fmtDateShort(g.deadline)})` : `Échéance ${fmtDateShort(g.deadline)} · ${p.daysLeft} j`) : null);
}

export async function createGoal(exerciseId = null) {
  const exId = exerciseId || await pickExercise({ title: 'Objectif sur…' });
  if (!exId) return;
  const g = newGoal(exId);
  openGoalSheet(null, g);
}

/** Édition d'un objectif (existant par id, ou brouillon). */
export function openGoalSheet(goalId, draft = null) {
  const g = draft || clone(getGoal(goalId));
  if (!g) return;
  const isNew = !!draft;
  openSheet({
    title: isNew ? 'Nouvel objectif' : 'Objectif',
    render: (api) => {
      const p = goalProgress(g, state.sessions, fmtNum);
      return [
        h('p.sheet-sub', null, exerciseName(g.exerciseId)),
        segmented([{ value: 'charge_reps', label: 'Charge × reps' }, { value: 'e1rm', label: '1RM estimé' }], g.kind, (v) => { g.kind = v; api.refresh(); }),
        h('div', { style: { height: '16px' } }),
        g.kind === 'charge_reps'
          ? h('div.field-row', null,
            stepper({ label: 'Charge (kg)', value: g.load, step: 2.5, min: -100, onChange: (v) => { g.load = v; } }),
            stepper({ label: 'Reps', value: g.reps, step: 1, min: 1, onChange: (v) => { g.reps = v ?? 1; } }))
          : stepper({ label: '1RM estimé (kg)', value: g.target1RM, step: 2.5, min: 0, onChange: (v) => { g.target1RM = v; } }),
        h('div', { style: { height: '14px' } }),
        field('Date cible (optionnelle)', h('input.input', { type: 'date', value: g.deadline || '', min: todayISO(), onchange: (e) => { g.deadline = e.target.value || null; } })),
        !isNew && h('p.small.muted', { style: { marginTop: '12px' } }, `Actuel : ${p.current} · ${p.remaining}`),
        h('div.sheet-actions', null,
          h('button.btn.primary.block.lg', {
            onclick: () => {
              if (g.kind === 'charge_reps' && g.load == null) { toast('Indique la charge visée.'); return; }
              if (g.kind === 'e1rm' && !g.target1RM) { toast('Indique le 1RM visé.'); return; }
              saveDoc('goals', g); api.close(); rerender();
            },
          }, isNew ? 'Créer l’objectif' : 'Enregistrer'),
          !isNew && h('button.btn.ghost.block', { onclick: () => { api.close(); go(`/exercise/${g.exerciseId}`); } }, icon('chart', 'sm'), 'Voir la progression'),
          !isNew && h('button.btn.danger.block', {
            onclick: () => {
              const snap = clone(getGoal(g.id));
              deleteDoc('goals', g.id); api.close();
              toast('Objectif supprimé', { undo: () => saveDoc('goals', snap) });
            },
          }, icon('trash', 'sm'), 'Supprimer')),
      ];
    },
  });
}
