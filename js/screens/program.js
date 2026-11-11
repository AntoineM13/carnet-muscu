/**
 * PROGRAMME : les séances configurées (on en choisit une pour démarrer,
 * depuis l'accueil) et la bibliothèque d'exercices.
 */
import { h } from '../core/h.js';
import { state } from '../core/store.js';
import { newTemplate } from '../domain/program.js';
import { saveTemplate } from '../core/actions.js';
import { icon } from '../ui/icons.js';
import { screenHead, listRow, topbar, emptyState } from '../ui/components.js';
import { go } from '../core/router.js';
import { lastDoneLabel } from '../ui/planning-ui.js';

export function renderProgram() {
  const node = h('main.screen', null,
    screenHead('Programme', `${state.templates.length} séance${state.templates.length > 1 ? 's' : ''}`,
      h('button.icon-btn.boxed', { 'aria-label': 'Réglages', onclick: () => go('/settings') }, icon('settings'))),
    h('section', null,
      h('div.section-head', null, h('h2', null, 'Séances')),
      state.templates.length
        ? h('div.list', null, state.templates.map((t) => {
          const n = t.blocks.reduce((a, b) => a + b.slots.length, 0);
          const ss = t.blocks.filter((b) => b.kind === 'superset').length;
          return listRow({
            title: t.name,
            sub: [`${n} exercice${n > 1 ? 's' : ''}`, ss ? `${ss} superset${ss > 1 ? 's' : ''}` : null, lastDoneLabel(t.id)].filter(Boolean).join(' · '),
            lead: h('span.lead', null, icon('dumbbell', 'sm')),
            onClick: () => go(`/program/t/${t.id}`),
          });
        }))
        : emptyState('program', 'Aucune séance pour l’instant.'),
      h('button.btn.ghost.block', {
        style: { marginTop: '12px' },
        onclick: () => {
          const t = newTemplate(`Séance ${state.templates.length + 1}`, state.templates.length);
          saveTemplate(t, { silent: true });
          go(`/program/t/${t.id}`);
        },
      }, icon('plus', 'sm'), 'Nouvelle séance')),
    h('section.section', null,
      h('div.list', null,
        listRow({ title: 'Bibliothèque d’exercices', sub: `${state.exercises.filter((e) => !e.archived).length} exercices · notes, douleurs, historique`, lead: h('span.lead', null, icon('list', 'sm')), onClick: () => go('/library') }))));
  return { node, tab: 'program' };
}

