/**
 * ACCUEIL : « Commencer une séance » (on choisit le jour puis la séance,
 * rien n'est imposé) + la semaine en un coup d'œil (séances faites).
 */
import { h } from '../core/h.js';
import { state, activeSession } from '../core/store.js';
import { todayISO, weekDates, weekKey, WEEKDAYS_SHORT, WEEKDAYS, weekday, fromISODate, fmtDateLong, daysBetween } from '../core/util.js';
import { steps, stepStatus } from '../domain/session.js';
import { startSession } from '../core/actions.js';
import { icon } from '../ui/icons.js';
import { go } from '../core/router.js';
import { openDaySheet, openStartPicker } from '../ui/planning-ui.js';
import { homeExtras } from './home-extras.js';
import { openRunSheet } from './runs.js';
import { fmtNum } from '../core/util.js';
import { syncLabel, syncStatus } from '../core/sync.js';
import { IS_TEST_ENV } from '../core/env.js';

/** Sorties de course d'un jour (module optionnel). */
const runsOn = (date) => (state.settings.runsEnabled ? state.runs.filter((r) => r.date === date) : []);

export function renderHome() {
  const today = todayISO();
  const dateTitle = fmtDateLong(today).replace(/^./, (c) => c.toUpperCase());

  const node = h('main.screen', null,
    h('div.screen-head', null,
      h('div', null,
        h('div.eyebrow.row-flex', { style: { gap: '8px' } }, `Semaine ${weekKey(today).split('W')[1]}`,
          IS_TEST_ENV ? h('span.env-tag', null, 'TEST') : null,
          syncStatus.user ? h(`button.sync-pill.st-${syncStatus.state}`, { onclick: () => go('/settings'), 'data-sync-label': '' }, syncLabel()) : null),
        h('h1', { style: { marginTop: '6px' } }, dateTitle)),
      h('button.icon-btn.boxed', { 'aria-label': 'Réglages', onclick: () => go('/settings') }, icon('settings'))),
    heroCard(today),
    backupBanner(),
    weekSection(today),
    ...homeExtras(today));
  return { node, tab: 'home' };
}

/* ------------------------------------------------------ Carte principale -- */
function heroCard(today) {
  const active = activeSession();
  if (active) {
    const st = steps(active);
    const done = st.filter((s) => stepStatus(s) === 'done').length;
    return h('section.card.hero.home-hero', null,
      h('div.eyebrow.accent', null, 'Séance en cours'),
      h('div.hero-title', null, active.templateName),
      h('div.muted', null, `${done} sur ${st.length} exercices terminés`),
      h('button.btn.primary.lg.block', { style: { marginTop: '18px' }, onclick: () => go('/session') }, icon('play', 'sm'), 'Reprendre'));
  }
  if (!state.templates.length) {
    return h('section.card.hero.home-hero', null,
      h('div.eyebrow', null, 'Nouvelle séance'),
      h('div.hero-title', null, 'Aucun programme'),
      h('div.muted', null, 'Crée tes séances dans l’onglet Programme, ou lance une séance libre.'),
      h('div.row-flex', { style: { marginTop: '18px' } },
        h('button.btn.primary.grow', { onclick: () => go('/program') }, 'Créer mon programme'),
        h('button.btn.ghost', { onclick: () => { startSession({}); go('/session'); } }, 'Séance libre')));
  }
  const doneToday = state.sessions.filter((x) => x.status === 'done' && x.date === today);
  return h('section.card.hero.home-hero', null,
    h('div.eyebrow', null, doneToday.length ? `Faite aujourd'hui : ${doneToday.map((x) => x.templateName).join(', ')}` : 'Nouvelle séance'),
    h('div.hero-title', null, 'Quelle séance ?'),
    h('div.muted', null, 'Choisis le jour, puis la séance parmi les tiennes.'),
    h('button.btn.primary.lg.block', { style: { marginTop: '18px' }, onclick: () => openStartPicker() }, icon('play', 'sm'), 'Commencer une séance'));
}

/* ---------------------------------------------------- Rappel sauvegarde -- */
function backupBanner() {
  const done = state.sessions.filter((s) => s.status === 'done').length;
  if (done < 1) return null;
  // Compte connecté et synchronisé récemment : la sauvegarde en ligne remplace l'export.
  if (syncStatus.user && syncStatus.lastSync && daysBetween(syncStatus.lastSync.slice(0, 10), todayISO()) < 7) return null;
  const last = state.settings.lastExportAt;
  const days = last ? daysBetween(last.slice(0, 10), todayISO()) : Infinity;
  if (days < (state.settings.exportReminderDays || 7)) return null;
  return h('section.banner.info.home-banner', null,
    h('span.ic', null, icon('download')),
    h('div.grow', null,
      h('div', null, last ? `Dernière sauvegarde il y a ${days} jours.` : 'Aucune sauvegarde exportée pour l’instant.'),
      h('div.small.muted', { style: { marginTop: '2px' } }, 'iOS peut effacer les données d’une app peu utilisée.'),
      h('div.actions', null, h('button.btn.sm.primary', { onclick: () => go('/settings?backup=1') }, 'Exporter maintenant'))));
}

/* ------------------------------------------------------ Cette semaine -- */
function weekSection(today) {
  const days = weekDates(today).map((date) => {
    const done = state.sessions.filter((x) => x.status === 'done' && x.date === date);
    const runs = runsOn(date);
    return { date, done, runs, state: done.length || runs.length ? 'done' : 'rest' };
  });
  const rows = days.flatMap((d) => [
    ...d.done.map((x) => ({ date: d.date, name: x.templateName || 'Séance', onClick: () => go(`/history/${x.id}`) })),
    ...d.runs.map((r) => ({ date: d.date, name: `Course · ${fmtNum(r.distanceKm || 0, 1)} km`, onClick: () => openRunSheet(r.id) })),
  ]);
  return h('section.section', null,
    h('div.section-head', null, h('h2', null, 'Cette semaine'),
      h('span.muted.small', null, `${rows.length} faite${rows.length > 1 ? 's' : ''}`)),
    h('div.week-strip', null, days.map((info) => {
      const d = fromISODate(info.date);
      return h(`button.day.st-${info.state}${info.date === today ? '.is-today' : ''}`, {
        'aria-label': `${WEEKDAYS[weekday(info.date) - 1]} : ${info.state === 'done' ? 'faite' : 'rien'}`,
        onclick: () => openDaySheet(info.date),
      },
      h('span.dl', null, WEEKDAYS_SHORT[weekday(info.date) - 1]),
      h('span.dn.num', null, d.getDate()),
      h('span.dot', null, info.state === 'done' ? icon('check', 'sm') : null),
      info.runs.length ? h('span.run-mark', { 'aria-label': 'Course' }) : null);
    })),
    h('div.list.week-list', null,
      rows.map((r) => h('button.list-row', { onclick: r.onClick },
        h('div.wk-day', null, WEEKDAYS[weekday(r.date) - 1].slice(0, 3) + '.'),
        h('div.grow', null, h('div.title.ellipsis', null, r.name)),
        h('span.badge.accent', null, 'Faite'))),
      !rows.length ? h('div.list-row.muted', null, 'Aucune séance cette semaine.') : null));
}
