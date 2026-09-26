/**
 * Sélecteur d'exercice (bibliothèque + création rapide).
 */
import { h } from '../core/h.js';
import { state } from '../core/store.js';
import { norm } from '../core/util.js';
import { MUSCLE_GROUPS, EQUIPMENTS } from '../data/defaults.js';
import { newExercise } from '../domain/program.js';
import { saveExercise } from '../core/actions.js';
import { openSheet } from './overlay.js';
import { icon } from './icons.js';
import { field, selectInput } from './components.js';

/**
 * Ouvre la bibliothèque. Résout avec l'id choisi (ou null).
 * @param {{title?:string, exclude?:string[], highlight?:string[]}} opts
 */
export function pickExercise({ title = 'Choisir un exercice', exclude = [], highlight = [] } = {}) {
  return new Promise((resolve) => {
    let q = '';
    let creating = false;
    let draft = { name: '', muscleGroup: 'Autre', equipment: 'machine' };
    let picked = null;
    const done = (id, api) => { picked = id; api.close(); };
    openSheet({
      title,
      onClose: () => resolve(picked),
      render: (api) => {
        if (creating) {
          return [
            field('Nom', h('input.input', { type: 'text', value: draft.name, autofocus: true, oninput: (e) => { draft.name = e.target.value; } })),
            h('div', { style: { height: '12px' } }),
            field('Groupe musculaire', selectInput(MUSCLE_GROUPS.map((g) => ({ value: g, label: g })), draft.muscleGroup, (v) => { draft.muscleGroup = v; })),
            h('div', { style: { height: '12px' } }),
            field('Matériel', selectInput(EQUIPMENTS, draft.equipment, (v) => { draft.equipment = v; })),
            h('div.sheet-actions', null,
              h('button.btn.primary.lg.block', {
                onclick: () => {
                  if (!draft.name.trim()) return;
                  const ex = newExercise({ ...draft, name: draft.name.trim(), loadMode: draft.equipment === 'pdc' ? 'lest' : 'charge' });
                  saveExercise(ex, { silent: true });
                  done(ex.id, api);
                },
              }, 'Créer et choisir'),
              h('button.btn.ghost.block', { onclick: () => { creating = false; api.refresh(); } }, 'Retour à la liste')),
          ];
        }
        const list = state.exercises
          .filter((e) => !e.archived && !exclude.includes(e.id))
          .filter((e) => !q || norm(e.name + ' ' + e.standard + ' ' + e.muscleGroup).includes(norm(q)));
        const groups = {};
        for (const e of list) (groups[e.muscleGroup] ||= []).push(e);
        const search = h('input.input', {
          type: 'search', placeholder: 'Rechercher', value: q, 'aria-label': 'Rechercher un exercice',
          oninput: (e) => { q = e.target.value; const pos = e.target.selectionStart; api.refresh(); const el = api.body.querySelector('input[type=search]'); el.focus(); el.setSelectionRange(pos, pos); },
        });
        const hl = list.filter((e) => highlight.includes(e.id));
        return [
          h('div.picker-search', null, search),
          h('button.option', { onclick: () => { creating = true; draft.name = q; api.refresh(); } }, icon('plus'),
            h('div.grow', null, h('div.t', null, q ? `Créer « ${q} »` : 'Nouvel exercice'))),
          hl.length ? h('div.eyebrow.list-group-title', null, 'Suggestions') : null,
          hl.length ? h('div.list', null, hl.map((e) => exRow(e, () => done(e.id, api)))) : null,
          ...MUSCLE_GROUPS.filter((g) => groups[g]).map((g) => [
            h('div.eyebrow.list-group-title', null, g),
            h('div.list', null, groups[g].map((e) => exRow(e, () => done(e.id, api)))),
          ]),
          !list.length ? h('p.muted.center', { style: { padding: '20px' } }, 'Aucun exercice trouvé.') : null,
        ];
      },
    });
  });
}

function exRow(e, onclick) {
  return h('button.list-row', { onclick },
    h('div.grow', null,
      h('div.title.ellipsis', null, e.name, e.pain?.active ? h('span.badge.warn', { style: { marginLeft: '8px' } }, 'Douleur') : null),
      e.standard && e.standard !== e.name ? h('div.sub.ellipsis', null, e.standard) : null));
}
