/**
 * PROGRAMME : liste des séances modèles, planning par défaut, bibliothèque.
 */
import { h } from '../core/h.js';
import { state } from '../core/store.js';
import { WEEKDAYS, todayISO, weekDates, weekday } from '../core/util.js';
import { newTemplate } from '../domain/program.js';
import { saveTemplate } from '../core/actions.js';
import { icon } from '../ui/icons.js';
import { screenHead, listRow, topbar, emptyState } from '../ui/components.js';
import { go } from '../core/router.js';
import { placeWithResolution, tplName } from '../ui/planning-ui.js';
import { choose } from '../ui/overlay.js';

export function renderProgram() {
  const def = state.schedule.default;
  const dayOf = (id) => Object.entries(def).filter(([, t]) => t === id).map(([wd]) => WEEKDAYS[wd - 1]);
  const node = h('main.screen', null,
    screenHead('Programme', `${state.templates.length} séance${state.templates.length > 1 ? 's' : ''} · ${Object.keys(def).length} par semaine`,
      h('button.icon-btn.boxed', { 'aria-label': 'Réglages', onclick: () => go('/settings') }, icon('settings'))),
    h('section', null,
      h('div.section-head', null, h('h2', null, 'Séances')),
      state.templates.length
        ? h('div.list', null, state.templates.map((t) => {
          const n = t.blocks.reduce((a, b) => a + b.slots.length, 0);
          const ss = t.blocks.filter((b) => b.kind === 'superset').length;
          const days = dayOf(t.id);
          return listRow({
            title: t.name,
            sub: [`${n} exercice${n > 1 ? 's' : ''}`, ss ? `${ss} superset${ss > 1 ? 's' : ''}` : null, days.length ? days.join(', ') : 'Pas de jour fixe'].filter(Boolean).join(' · '),
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
      h('div.section-head', null, h('h2', null, 'Planning par défaut'), h('button.link', { onclick: () => go('/program/schedule') }, 'Modifier')),
      h('div.list', null, [1, 2, 3, 4, 5, 6, 7].map((wd) => h('div.list-row', null,
        h('div.wk-day', null, WEEKDAYS[wd - 1].slice(0, 3) + '.'),
        h('div.grow', { class: def[wd] ? '' : 'faint' }, def[wd] ? tplName(def[wd]) : 'Repos'))))),
    h('section.section', null,
      h('div.list', null,
        listRow({ title: 'Bibliothèque d’exercices', sub: `${state.exercises.filter((e) => !e.archived).length} exercices · notes, douleurs, historique`, lead: h('span.lead', null, icon('list', 'sm')), onClick: () => go('/library') }))));
  return { node, tab: 'program' };
}

/** Écran d'édition du planning par défaut (toutes les semaines). */
export function renderSchedule() {
  const def = state.schedule.default;
  const monday = weekDates(todayISO());
  const node = h('main.screen.no-tabs', null,
    topbar('Planning par défaut', { backTo: '/program' }),
    h('p.muted.small', { style: { margin: '0 4px 14px' } },
      'Chaque séance a un jour de référence. C’est une proposition : tu peux toujours changer une semaine précise depuis l’accueil, ou lancer n’importe quelle séance n’importe quel jour.'),
    h('div.list', null, [1, 2, 3, 4, 5, 6, 7].map((wd) => h('button.list-row', {
      onclick: async () => {
        const v = await choose({
          title: WEEKDAYS[wd - 1].replace(/^./, (c) => c.toUpperCase()),
          subtitle: 'Toutes les semaines',
          options: [
            ...state.templates.map((t) => ({ value: t.id, label: t.name, on: def[wd] === t.id })),
            { value: '__rest', label: 'Repos', icon: 'moon', on: !def[wd] },
          ],
        });
        if (!v) return;
        await placeWithResolution(v === '__rest' ? null : v, monday[wd - 1] >= todayISO() ? monday[wd - 1] : monday[wd - 1], 'all');
      },
    },
    h('div.wk-day', null, WEEKDAYS[wd - 1].slice(0, 3) + '.'),
    h('div.grow', { class: def[wd] ? 'title' : 'faint' }, def[wd] ? tplName(def[wd]) : 'Repos'),
    h('span.chev', null, icon('chevron', 'sm'))))),
    h('p.faint.small', { style: { margin: '14px 4px' } },
      `${Object.keys(def).length} séances par semaine. Passer de 4 à 3 séances : mets simplement un jour en repos.`));
  return { node, tab: null };
}

export { weekday };
