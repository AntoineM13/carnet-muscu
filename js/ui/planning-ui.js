/**
 * Démarrer une séance : on choisit le jour puis la séance, rien n'est
 * présélectionné (décision du 2026-11-11 : plus de planning imposé, il
 * faisait démarrer la mauvaise séance). Feuille « jour » de la semaine.
 *
 * Les données de planning (state.schedule) restent stockées et synchronisées
 * pour compatibilité, mais ne sont plus affichées.
 */
import { h } from '../core/h.js';
import { state, getTemplate } from '../core/store.js';
import { todayISO, fmtDateLong, fmtDateShort, addDays, daysBetween, dayLabel } from '../core/util.js';
import { startSession } from '../core/actions.js';
import { openSheet } from './overlay.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { openRunSheet } from '../screens/runs.js';

export const tplName = (id) => getTemplate(id)?.name || 'Séance supprimée';

const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());

/** « dernière fois il y a 3 j » pour une séance modèle (avant `date`). */
export function lastDoneLabel(templateId, date = todayISO()) {
  const s = state.sessions
    .filter((x) => x.status === 'done' && x.templateId === templateId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!s) return 'jamais faite';
  const d = daysBetween(s.date, date);
  if (d < 0) return `faite le ${fmtDateShort(s.date)}`;
  return d === 0 ? "faite aujourd'hui" : d === 1 ? 'faite hier' : `dernière fois il y a ${d} j`;
}

/**
 * Choisir le jour, puis la séance à démarrer. `initialDate` permet d'ouvrir
 * la feuille sur un jour passé (saisie a posteriori).
 */
export function openStartPicker(initialDate = todayISO()) {
  const today = todayISO();
  let date = initialDate > today ? today : initialDate;
  const yesterday = addDays(today, -1);
  let other = date !== today && date !== yesterday; // « Autre jour » : sélecteur de date
  openSheet({
    title: 'Commencer une séance',
    render: (api) => {
      const start = (templateId) => {
        api.close();
        startSession({ templateId, date });
        go('/session');
      };
      return [
        h('div.eyebrow', { style: { margin: '2px 0 8px' } }, 'Jour'),
        h('div.chips', null,
          h(`button.chip${!other && date === today ? '.on' : ''}`, { onclick: () => { date = today; other = false; api.refresh(); } }, "Aujourd'hui"),
          h(`button.chip${!other && date === yesterday ? '.on' : ''}`, { onclick: () => { date = yesterday; other = false; api.refresh(); } }, 'Hier'),
          h(`button.chip${other ? '.on' : ''}`, { onclick: () => { other = true; api.refresh(); } }, other && date !== today && date !== yesterday ? dayLabel(date, today) : 'Autre jour')),
        other ? h('input.input', {
          type: 'date', value: date, max: today, 'aria-label': 'Date de la séance', style: { marginTop: '8px' },
          onchange: (e) => { if (e.target.value && e.target.value <= today) { date = e.target.value; api.refresh(); } },
        }) : null,
        h('div.eyebrow', { style: { margin: '18px 0 8px' } }, `Séance · ${dayLabel(date, today).toLowerCase()}`),
        state.templates.length ? null : h('p.sheet-sub', null, 'Aucune séance configurée : crée-les dans l’onglet Programme.'),
        ...state.templates.map((t) => {
          const n = t.blocks.reduce((a, b) => a + b.slots.length, 0);
          return h('button.option', { onclick: () => start(t.id) },
            h('div.grow', null, h('div.t', null, t.name),
              h('div.d', null, `${n} exercice${n > 1 ? 's' : ''} · ${lastDoneLabel(t.id, date)}`)),
            icon('play', 'sm'));
        }),
        h('button.option', { onclick: () => start(null) }, icon('plus'),
          h('div.grow', null, h('div.t', null, 'Séance libre'), h('div.d', null, 'Partir d’une séance vide'))),
        !state.templates.length ? h('button.btn.ghost.block', { style: { marginTop: '8px' }, onclick: () => { api.close(); go('/program'); } }, 'Aller au Programme') : null,
      ];
    },
  });
}

/** Feuille d'un jour de la semaine : séances faites, en ajouter une. */
export function openDaySheet(date) {
  const today = todayISO();
  openSheet({
    title: cap(fmtDateLong(date)),
    render: (api) => {
      const done = state.sessions.filter((s) => s.status === 'done' && s.date === date);
      const runs = state.settings.runsEnabled ? state.runs.filter((r) => r.date === date) : [];
      return [
        ...done.map((s) => h('button.option', { onclick: () => { api.close(); go(`/history/${s.id}`); } },
          icon('check'), h('div.grow', null, h('div.t', null, s.templateName || 'Séance'), h('div.d', null, 'Faite · voir le détail')))),
        ...runs.map((r) => h('button.option', { onclick: () => { api.close(); openRunSheet(r.id); } },
          icon('run'), h('div.grow', null, h('div.t', null, 'Course'), h('div.d', null, 'Voir la sortie')))),
        !done.length && !runs.length ? h('p.sheet-sub', null, date > today ? 'Ce jour n’est pas encore arrivé.' : 'Rien d’enregistré ce jour.') : null,
        date <= today && h('button.option', { onclick: () => { api.close(); openStartPicker(date); } },
          icon('play'), h('div.grow', null, h('div.t', null, 'Commencer une séance ce jour'), h('div.d', null, 'Choisir parmi tes séances'))),
        state.settings.runsEnabled && date <= today && h('button.option', { onclick: () => { api.close(); openRunSheet(null, date); } },
          icon('run'), h('div.grow', null, h('div.t', null, 'Ajouter une sortie de course'), h('div.d', null, 'Distance, durée, allure'))),
      ];
    },
  });
}
