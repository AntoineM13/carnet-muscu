/**
 * ÉDITEUR DE SÉANCE MODÈLE : blocs, supersets, alternatives, réglages par
 * exercice (séries, reps, repos, incrément). Sauvegarde à chaque action.
 */
import { h } from '../core/h.js';
import { state, getTemplate, getExercise, exerciseName } from '../core/store.js';
import { clone, fmtNum } from '../core/util.js';
import * as Prog from '../domain/program.js';
import { saveTemplate, deleteTemplate, startSession } from '../core/actions.js';
import { icon } from '../ui/icons.js';
import { topbar, stepper, emptyState } from '../ui/components.js';
import { go, rerender } from '../core/router.js';
import { openSheet, toast, confirmAction } from '../ui/overlay.js';
import { pickExercise } from '../ui/pickers.js';

export function renderTemplateEdit({ id }) {
  const t = getTemplate(id);
  if (!t) { go('/program', { replace: true }); return { node: h('div'), tab: null }; }

  /** Modifie le modèle avec possibilité d'annuler. */
  const mutate = (fn, undoLabel) => {
    const snap = clone(t);
    fn();
    saveTemplate(t, { silent: true });
    rerender();
    if (undoLabel) toast(undoLabel, { undo: () => { Object.assign(t, snap); saveTemplate(t, { silent: true }); rerender(); } });
  };

  const addExercise = async () => {
    const exId = await pickExercise({ title: 'Ajouter un exercice' });
    if (exId) mutate(() => Prog.addExerciseBlock(t, exId, state.settings));
  };

  const node = h('main.screen.no-tabs', null,
    topbar(t.name, {
      backTo: '/program',
      actions: h('button.icon-btn', { 'aria-label': 'Options', onclick: () => templateMenu(t) }, icon('more')),
    }),
    h('div.field', null,
      h('label', null, 'Nom de la séance'),
      h('input.input', {
        type: 'text', value: t.name,
        onchange: (e) => { t.name = e.target.value.trim() || t.name; saveTemplate(t, { silent: true }); rerender(); },
      })),
    h('div.section-head', { style: { marginTop: '22px' } }, h('h2', null, 'Exercices'),
      h('span.small.faint', null, 'Relier deux exercices = superset')),
    t.blocks.length ? h('div.tpl-blocks', null, t.blocks.map((b, bi) => blockCard(t, b, bi, mutate))) : emptyState('dumbbell', 'Aucun exercice.'),
    h('button.btn.ghost.block', { style: { marginTop: '14px' }, onclick: addExercise }, icon('plus', 'sm'), 'Ajouter un exercice'),
    h('button.btn.primary.lg.block', {
      style: { marginTop: '24px' },
      disabled: !t.blocks.length,
      onclick: () => { startSession({ templateId: t.id }); go('/session'); },
    }, icon('play', 'sm'), 'Démarrer cette séance'));
  return { node, tab: null };
}

function blockCard(t, b, bi, mutate) {
  const isSS = b.kind === 'superset' && b.slots.length > 1;
  const last = bi === t.blocks.length - 1;
  return h('div', null,
    h(`div.tpl-block${isSS ? '.is-superset' : ''}`, null,
      isSS && h('div.tpl-block-head', null,
        h('span.badge.accent', null, icon('link', 'sm'), 'Superset'),
        h('span.grow'),
        h('button.link-btn.small', { onclick: () => mutate(() => Prog.ungroup(t, bi), 'Superset séparé') }, icon('unlink', 'sm'), 'Séparer')),
      b.slots.map((s, si) => slotRow(t, b, bi, s, si, mutate)),
      h('div.tpl-block-tools', null,
        h('button.icon-btn', { 'aria-label': 'Monter', disabled: bi === 0, onclick: () => mutate(() => Prog.moveBlock(t, bi, -1)) }, icon('up', 'sm')),
        h('button.icon-btn', { 'aria-label': 'Descendre', disabled: last, onclick: () => mutate(() => Prog.moveBlock(t, bi, 1)) }, icon('down', 'sm')),
        h('span.grow'),
        h('button.icon-btn', {
          'aria-label': 'Supprimer le bloc',
          onclick: () => mutate(() => t.blocks.splice(bi, 1), `${isSS ? 'Superset' : exerciseName(b.slots[0].exerciseId)} supprimé`),
        }, icon('trash', 'sm')))),
    !last && h('button.tpl-link', {
      onclick: () => mutate(() => Prog.groupWithNext(t, bi), 'Exercices reliés en superset'),
      'aria-label': 'Relier au suivant en superset',
    }, icon('link', 'sm'), 'Relier au suivant'));
}

function slotRow(t, b, bi, s, si, mutate) {
  const ex = getExercise(s.exerciseId);
  const letters = 'ABCDEFGH';
  return h('button.tpl-slot', { onclick: () => openSlotSheet(t, s.id, mutate) },
    b.slots.length > 1 ? h('span.slot-letter', null, letters[si]) : null,
    h('div.grow', null,
      h('div.title', null, ex?.name || 'Exercice supprimé',
        ex?.pain?.active ? h('span.badge.warn', { style: { marginLeft: '8px' } }, icon('alert', 'sm'), 'Douleur') : null),
      h('div.sub.num', null, `${s.sets} × ${s.repMin}-${s.repMax} · repos ${s.restSec} s · +${fmtNum(Prog.effectiveIncrement(getExercise(s.exerciseId), state.settings))} kg`),
      s.alternatives?.length ? h('div.sub', null, 'ou ', s.alternatives.map(exerciseName).join(' · ')) : null),
    h('span.chev', null, icon('chevron', 'sm')));
}

/** Feuille de réglage d'un exercice du programme. */
function openSlotSheet(t, slotId, mutate) {
  openSheet({
    title: 'Exercice du programme',
    render: (api) => {
      const found = Prog.findSlot(t, slotId);
      if (!found) { api.close(); return []; }
      const { slot: s, blockIndex, slotIndex, block } = found;
      const upd = (fn) => { fn(); saveTemplate(t, { silent: true }); rerender(); };
      return [
        h('button.option', {
          onclick: async () => {
            const id = await pickExercise({ title: 'Remplacer par', exclude: [s.exerciseId] });
            if (id) { upd(() => { s.exerciseId = id; s.alternatives = (s.alternatives || []).filter((a) => a !== id); }); api.refresh(); }
          },
        }, h('div.grow', null, h('div.t', null, exerciseName(s.exerciseId)), h('div.d', null, 'Toucher pour remplacer')), icon('swap')),
        h('div.slot-grid', null,
          stepper({ label: 'Séries', value: s.sets, step: 1, min: 1, max: 12, onChange: (v) => upd(() => { s.sets = v ?? 1; }) }),
          stepper({ label: 'Repos (s)', value: s.restSec, step: 15, min: 0, max: 600, onChange: (v) => upd(() => { s.restSec = v ?? 0; }) }),
          stepper({ label: 'Reps min', value: s.repMin, step: 1, min: 1, max: 100, onChange: (v) => upd(() => { s.repMin = v ?? 1; if (s.repMax < s.repMin) s.repMax = s.repMin; }) }),
          stepper({ label: 'Reps max', value: s.repMax, step: 1, min: 1, max: 100, onChange: (v) => upd(() => { s.repMax = Math.max(v ?? 1, s.repMin); }) })),
        h('p.tiny.faint', { style: { marginTop: '8px' } }, `Augmentation proposée : +${fmtNum(Prog.effectiveIncrement(getExercise(s.exerciseId), state.settings))} kg (selon le matériel, modifiable dans la fiche de l’exercice ou les Réglages).`),
        h('div.eyebrow', { style: { margin: '20px 0 8px' } }, 'Alternatives'),
        h('p.small.muted', { style: { marginBottom: '10px' } }, 'Proposées au moment de la séance (ex. bûcheron / rowing banc).'),
        h('div.chips', null,
          (s.alternatives || []).map((a) => h('button.chip', {
            onclick: () => { upd(() => { s.alternatives = s.alternatives.filter((x) => x !== a); }); api.refresh(); },
          }, exerciseName(a), icon('close', 'sm'))),
          h('button.chip', {
            onclick: async () => {
              const id = await pickExercise({ title: 'Ajouter une alternative', exclude: [s.exerciseId, ...(s.alternatives || [])] });
              if (id) { upd(() => { s.alternatives = [...(s.alternatives || []), id]; }); api.refresh(); }
            },
          }, icon('plus', 'sm'), 'Ajouter')),
        block.slots.length > 1 && h('div.row-flex', { style: { marginTop: '20px' } },
          h('button.btn.ghost.grow', { disabled: slotIndex === 0, onclick: () => { upd(() => Prog.moveSlot(t, blockIndex, slotIndex, -1)); api.refresh(); } }, icon('up', 'sm'), 'Avant'),
          h('button.btn.ghost.grow', { disabled: slotIndex === block.slots.length - 1, onclick: () => { upd(() => Prog.moveSlot(t, blockIndex, slotIndex, 1)); api.refresh(); } }, icon('down', 'sm'), 'Après')),
        h('div.sheet-actions', null,
          h('button.btn.ghost.block', { onclick: () => { api.close(); go(`/exercise/${s.exerciseId}`); } }, icon('note', 'sm'), 'Fiche de l’exercice (notes, douleur)'),
          h('button.btn.danger.block', {
            onclick: () => { api.close(); mutate(() => Prog.removeSlot(t, blockIndex, slotIndex), `${exerciseName(s.exerciseId)} retiré`); },
          }, icon('trash', 'sm'), 'Retirer de la séance')),
      ];
    },
  });
}

function templateMenu(t) {
  openSheet({
    title: t.name,
    render: (api) => [
      h('button.option', {
        onclick: () => {
          const copy = { ...clone(t), id: Prog.newTemplate('').id, name: `${t.name} (copie)`, order: state.templates.length };
          saveTemplate(copy, { silent: true }); api.close(); go(`/program/t/${copy.id}`);
        },
      }, icon('program'), h('div.grow', null, h('div.t', null, 'Dupliquer'))),
      h('button.option', {
        onclick: () => {
          state.templates.forEach((x, k) => { x.order = k; });
          const i = state.templates.indexOf(t);
          if (i > 0) { const o = state.templates[i - 1]; [o.order, t.order] = [i, i - 1]; }
          state.templates.forEach((x) => saveTemplate(x, { silent: true }));
          api.close(); rerender();
        },
      }, icon('up'), h('div.grow', null, h('div.t', null, 'Monter dans la liste'))),
      h('button.option.danger', {
        onclick: async () => {
          api.close();
          const ok = await confirmAction({ title: `Supprimer « ${t.name} » ?`, message: 'L’historique des séances déjà faites est conservé. Tu pourras annuler.' });
          if (ok) { go('/program'); deleteTemplate(t); }
        },
      }, icon('trash'), h('div.grow', null, h('div.t', null, 'Supprimer la séance'))),
    ],
  });
}
