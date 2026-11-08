/**
 * BIBLIOTHÈQUE D'EXERCICES et FICHE EXERCICE (notes permanentes, douleur,
 * historique). L'historique est rattaché à l'id : renommer ne casse rien.
 */
import { h } from '../core/h.js';
import { state, getExercise } from '../core/store.js';
import { norm, fmtDateShort, fmtNum } from '../core/util.js';
import { MUSCLE_GROUPS, EQUIPMENTS } from '../data/defaults.js';
import { newExercise, effectiveIncrement } from '../domain/program.js';
import { exerciseHistory, formatSets } from '../domain/stats.js';
import { saveExercise, removeExercise, mergeExerciseInto } from '../core/actions.js';
import { icon } from '../ui/icons.js';
import { topbar, field, selectInput, switchRow, textarea, emptyState, stepper, segmented } from '../ui/components.js';
import { go, rerender } from '../core/router.js';
import { confirmAction, toast } from '../ui/overlay.js';
import { editMuscles } from '../ui/muscle-picker.js';
import { musclesSummary } from '../domain/muscles.js';
import { MECHANICS } from '../data/muscles.js';
import { pickExercise } from '../ui/pickers.js';
import { exerciseProgressSection } from './exercise-progress.js';

let query = '';

export function renderLibrary() {
  const list = state.exercises
    .filter((e) => !e.archived)
    .filter((e) => !query || norm(`${e.name} ${e.standard} ${e.muscleGroup}`).includes(norm(query)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const groups = {};
  for (const e of list) (groups[e.muscleGroup] ||= []).push(e);
  const archived = state.exercises.filter((e) => e.archived);

  const node = h('main.screen.no-tabs', null,
    topbar('Bibliothèque', {
      backTo: '/program',
      actions: h('button.icon-btn.accent', {
        'aria-label': 'Nouvel exercice',
        onclick: () => { const e = newExercise(); saveExercise(e, { silent: true }); go(`/exercise/${e.id}?new=1`); },
      }, icon('plus')),
    }),
    h('input.input', {
      type: 'search', placeholder: 'Rechercher un exercice', value: query,
      oninput: (e) => { query = e.target.value; const pos = e.target.selectionStart; rerender(); const el = document.querySelector('main input[type=search]'); el?.focus(); el?.setSelectionRange(pos, pos); },
    }),
    ...MUSCLE_GROUPS.filter((g) => groups[g]).map((g) => [
      h('div.eyebrow.list-group-title', null, g),
      h('div.list', null, groups[g].map((e) => {
        const n = exerciseHistory(e.id, state.sessions).length;
        return h('button.list-row', { onclick: () => go(`/exercise/${e.id}`) },
          h('div.grow', null,
            h('div.title.ellipsis', null, e.name),
            h('div.sub.ellipsis', null, [e.standard !== e.name ? e.standard : null, n ? `${n} séance${n > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ') || '—')),
          e.pain?.active ? h('span.badge.warn', null, icon('alert', 'sm')) : null,
          e.notes ? h('span.faint', null, icon('note', 'sm')) : null,
          h('span.chev', null, icon('chevron', 'sm')));
      })),
    ]),
    !list.length && emptyState('search', 'Aucun exercice.'),
    archived.length ? h('details.archived', null,
      h('summary.eyebrow.list-group-title', null, `Archivés (${archived.length})`),
      h('div.list', null, archived.map((e) => h('button.list-row', { onclick: () => go(`/exercise/${e.id}`) },
        h('div.grow.faint', null, e.name), h('span.chev', null, icon('chevron', 'sm')))))) : null);
  return { node, tab: null };
}

export function renderExercise({ id, new: isNew }) {
  const e = getExercise(id);
  if (!e) { go('/library', { replace: true }); return { node: h('div'), tab: null }; }
  const upd = (patch, redraw = false) => { Object.assign(e, patch); saveExercise(e, { silent: true }); if (redraw) rerender(); };
  const hist = exerciseHistory(e.id, state.sessions).reverse();

  const node = h('main.screen.no-tabs', null,
    topbar(e.name, { backTo: null }),
    e.archived && h('div.banner', { style: { marginBottom: '14px' } }, h('span.ic', null, icon('info')),
      h('div.grow', null, 'Exercice archivé : il n’apparaît plus dans la bibliothèque mais son historique est conservé.',
        h('div.actions', null, h('button.btn.sm.primary', { onclick: () => upd({ archived: false }, true) }, 'Restaurer')))),
    h('div.stack', null,
      field('Nom affiché', h('input.input', { type: 'text', value: e.name, autofocus: isNew ? true : null, onchange: (ev) => upd({ name: ev.target.value.trim() || e.name }, true) })),
      field('Nom standardisé', h('input.input', { type: 'text', value: e.standard || '', placeholder: 'Optionnel', onchange: (ev) => upd({ standard: ev.target.value.trim() }) })),
      field('Muscles travaillés', h('button.option', { onclick: () => editMuscles(e, () => { saveExercise(e, { silent: true }); rerender(); }) },
        h('div.grow', null, h('div.t', null, musclesSummary(e)), h('div.d', null, e.muscles?.primary?.length ? 'Toucher pour modifier' : 'Toucher pour préciser (principal, secondaires)')), icon('chevron', 'sm'))),
      field('Type de mouvement', segmented([...MECHANICS.map((m) => ({ value: m.value, label: m.label })), { value: null, label: 'Non précisé' }], e.mechanic ?? null, (v) => upd({ mechanic: v }, true))),
      h('div.field-row', null,
        field('Matériel', selectInput(EQUIPMENTS.map((q) => ({ ...q, label: q.label.replace(' (charge par haltère)', '') })), e.equipment, (v) => upd({ equipment: v, loadMode: v === 'pdc' ? 'lest' : e.loadMode }, true)))),
      incrementField(e, upd),
      h('div.list', null,
        switchRow('Poids du corps + lest', e.loadMode === 'lest', (v) => upd({ loadMode: v ? 'lest' : 'charge' }), '0 = sans lest, négatif = assistance'),
        switchRow('Unilatéral', !!e.unilateral, (v) => upd({ unilateral: v }), 'Reps saisies par côté'))),

    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Notes permanentes')),
      textarea(e.notes, (v) => upd({ notes: v }), { placeholder: 'Réglage machine, position, sensations… Affiché à chaque séance.' })),

    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Douleur / à éviter')),
      h('div.list', null, switchRow('Signaler une douleur', !!e.pain?.active, (v) => upd({ pain: { ...(e.pain || {}), active: v } }, true), 'Visible dans le programme et pendant la séance')),
      e.pain?.active && h('div', { style: { marginTop: '10px' } },
        textarea(e.pain.comment, (v) => upd({ pain: { ...e.pain, comment: v } }), { placeholder: 'Ex. épaule droite, éviter l’amplitude complète' }))),

    ...exerciseProgressSection(e),

    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Historique'), h('span.small.faint', null, `${hist.length} séance${hist.length > 1 ? 's' : ''}`)),
      hist.length
        ? h('div.list', null, hist.slice(0, 30).map((x) => h('button.list-row', { onclick: () => go(`/history/${x.session.id}`) },
          h('div.grow', null,
            h('div.title', null, fmtDateShort(x.date), h('span.faint.small', null, ` · ${x.session.templateName}`)),
            h('div.sub.num', null, formatSets(x.session.items.filter((it) => it.exerciseId === e.id).flatMap((it) => it.sets), fmtNum))),
          h('span.chev', null, icon('chevron', 'sm')))))
        : emptyState('history', 'Pas encore d’historique.')),

    h('button.btn.ghost.block', { style: { marginTop: '28px' }, onclick: () => mergeFlow(e) }, icon('link', 'sm'), 'Fusionner avec un autre exercice…'),
    h('p.tiny.faint', { style: { margin: '6px 2px 0' } }, 'Pour un doublon (même exercice sous deux noms) : l’historique, le programme et les objectifs sont regroupés.'),

    !e.archived && h('button.btn.danger.block', {
      style: { marginTop: '16px' },
      onclick: async () => {
        const ok = await confirmAction({ title: `Supprimer « ${e.name} » ?`, message: 'S’il a déjà été utilisé, il sera archivé et son historique conservé.' });
        if (ok) { go('/library'); removeExercise(e); }
      },
    }, icon('trash', 'sm'), 'Supprimer l’exercice'));
  return { node, tab: null };
}

/** Incrément propre à l'exercice (sinon : celui de son matériel, dans les Réglages). */
function incrementField(e, upd) {
  const own = e.increment != null;
  const byEquipment = effectiveIncrement({ ...e, increment: null }, state.settings);
  return h('div', null,
    stepper({ label: 'Augmentation proposée (kg)', value: effectiveIncrement(e, state.settings), step: 0.5, min: 0.5, max: 20,
      onChange: (v) => upd({ increment: v == null || v === byEquipment ? null : v }, true) }),
    h('p.tiny.faint', { style: { marginTop: '6px' } }, own
      ? h('span', null, `Valeur propre à cet exercice. `, h('button.link', { style: { padding: '0' }, onclick: () => upd({ increment: null }, true) }, `Revenir au matériel (${fmtNum(byEquipment)} kg)`))
      : 'Selon le matériel (Réglages → Charges de ta salle).'));
}

/** Fusion d'un doublon : on choisit l'exercice à GARDER. */
async function mergeFlow(e) {
  const keepId = await pickExercise({ title: `Fusionner « ${e.name} » dans…`, exclude: [e.id] });
  if (!keepId) return;
  const keep = getExercise(keepId);
  const n = exerciseHistory(e.id, state.sessions).length;
  const ok = await confirmAction({
    title: `Fusionner dans « ${keep.name} » ?`,
    message: `« ${e.name} » disparaît de la bibliothèque. Son historique (${n} séance${n > 1 ? 's' : ''}), sa place dans le programme, ses objectifs et ses notes passent sur « ${keep.name} ». Tu pourras annuler.`,
    confirmLabel: 'Fusionner', danger: false,
  });
  if (!ok) return;
  const { undo } = mergeExerciseInto(e, keep);
  go(`/exercise/${keep.id}`, { replace: true });
  toast(`Fusionné dans « ${keep.name} »`, { undo: () => { undo(); go(`/exercise/${e.id}`, { replace: true }); } });
}
