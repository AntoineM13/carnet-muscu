/**
 * ACCUEIL : « ma prochaine séance » en un tap + la semaine en un coup d'œil.
 */
import { h } from '../core/h.js';
import { state, activeSession, getTemplate } from '../core/store.js';
import {
  todayISO, weekDates, weekKey, WEEKDAYS_SHORT, WEEKDAYS, weekday, fromISODate, fmtDateLong, daysBetween, addDays,
} from '../core/util.js';
import * as Plan from '../domain/planning.js';
import { steps, stepStatus } from '../domain/session.js';
import { editSchedule, startSession } from '../core/actions.js';
import { icon } from '../ui/icons.js';
import { go } from '../core/router.js';
import { openDaySheet, openStartPicker, startPlanned, tplName, itemStatusLabel, placeWithResolution } from '../ui/planning-ui.js';
import { homeExtras } from './home-extras.js';
import { openRunSheet } from './runs.js';
import { fmtNum } from '../core/util.js';
import { syncLabel, syncStatus } from '../core/sync.js';
import { IS_TEST_ENV } from '../core/env.js';

/** Sorties de course d'un jour (module optionnel). */
const runsOn = (date) => (state.settings.runsEnabled ? state.runs.filter((r) => r.date === date) : []);

let dismissedLate = null; // bandeau « en retard » masqué pour cette ouverture

export function renderHome() {
  const today = todayISO();
  const week = Plan.ensureWeek(state.schedule, today);
  Plan.pruneWeek(week, new Set(state.templates.map((t) => t.id)));
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
    lateBanner(today),
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
      h('div.eyebrow', null, 'Prochaine séance'),
      h('div.hero-title', null, 'Aucun programme'),
      h('div.muted', null, 'Crée tes séances dans l’onglet Programme, ou lance une séance libre.'),
      h('div.row-flex', { style: { marginTop: '18px' } },
        h('button.btn.primary.grow', { onclick: () => go('/program') }, 'Créer mon programme'),
        h('button.btn.ghost', { onclick: () => { startSession({}); go('/session'); } }, 'Séance libre')));
  }
  const prop = Plan.nextProposal(state.schedule, today);
  if (!prop) {
    return h('section.card.hero.home-hero', null,
      h('div.eyebrow', null, 'Prochaine séance'),
      h('div.hero-title', null, 'Rien de prévu'),
      h('div.muted', null, 'Ton planning par défaut est vide.'),
      h('div.row-flex', { style: { marginTop: '18px' } },
        h('button.btn.primary.grow', { onclick: openStartPicker }, icon('play', 'sm'), 'Choisir une séance')));
  }
  const { item, reason } = prop;
  const tpl = getTemplate(item.templateId);
  const eyebrow = {
    today: "Aujourd'hui",
    late: `En retard · prévue ${WEEKDAYS[weekday(item.plannedDate) - 1]}`,
    asap: 'À faire dès que possible',
    next: item.plannedDate ? `Prochaine · ${daysBetween(today, item.plannedDate) === 1 ? 'demain' : WEEKDAYS[weekday(item.plannedDate) - 1]}` : 'Prochaine',
  }[reason];
  const nEx = tpl ? tpl.blocks.reduce((n, b) => n + b.slots.length, 0) : 0;
  const last = lastDone(item.templateId);
  return h('section.card.hero.home-hero', null,
    h('div.eyebrow', { class: reason === 'late' ? 'warn-text' : 'accent' }, eyebrow),
    h('div.hero-title', null, tplName(item.templateId)),
    h('div.muted', null, `${nEx} exercice${nEx > 1 ? 's' : ''}${last ? ` · dernière fois ${last}` : ''}`),
    h('div.hero-actions', null,
      h('button.btn.primary.lg.grow', {
        onclick: async () => {
          // Séance d'un autre jour lancée aujourd'hui : on l'amène à aujourd'hui.
          if (item.plannedDate !== today) {
            const ok = await placeWithResolution(item.templateId, today, 'week', { silent: true });
            if (!ok) return;
          }
          startPlanned(Plan.itemForStart(state.schedule, item.templateId, today) || item);
        },
      }, icon('play', 'sm'), 'Démarrer'),
      h('button.btn.ghost.lg', { onclick: openStartPicker }, 'Changer')));
}

function lastDone(templateId) {
  const s = state.sessions
    .filter((x) => x.status === 'done' && x.templateId === templateId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!s) return null;
  const d = daysBetween(s.date, todayISO());
  return d === 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} j`;
}

/* ----------------------------------------------------- Bandeau retard -- */
function lateBanner(today) {
  const late = Plan.lateItems(state.schedule, today)[0];
  if (!late || dismissedLate === late.id + today) return null;
  const prop = Plan.nextProposal(state.schedule, today);
  // Si la carte principale propose déjà cette séance, le bandeau reste utile pour décaler/sauter.
  const day = WEEKDAYS[weekday(late.plannedDate) - 1];
  return h('section.banner.home-banner', null,
    h('span.ic', null, icon('alert')),
    h('div.grow', null,
      h('div', null, h('strong', null, tplName(late.templateId)), ` prévue ${day} non faite.`),
      h('div.actions', null,
        prop?.item.id !== late.id && h('button.btn.sm.primary', {
          onclick: () => placeWithResolution(late.templateId, today, 'week'),
        }, 'La faire aujourd’hui'),
        h('button.btn.sm.ghost', { onclick: () => editSchedule((s) => Plan.shiftItem(s, late, addDays(today, 1)), 'Séance décalée') }, 'Décaler'),
        h('button.btn.sm.ghost', { onclick: () => editSchedule(() => Plan.skipItem(late), 'Séance sautée cette semaine') }, 'Sauter'))),
    h('button.icon-btn', { 'aria-label': 'Masquer', onclick: (e) => { dismissedLate = late.id + today; e.currentTarget.closest('.banner').remove(); } }, icon('close', 'sm')));
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
  const days = weekDates(today).map((d) => Plan.dayInfo(state.schedule, d, today, state.sessions));
  const floating = Plan.floatingItems(state.schedule, today);
  const rows = [];
  for (const info of days) {
    const names = [
      ...info.items.map((it) => ({ name: tplName(it.templateId), label: itemStatusLabel(it, today), status: it.status, item: it })),
      ...info.doneSessions.filter((s) => !info.items.some((it) => it.sessionId === s.id)).map((s) => ({ name: s.templateName, label: 'Faite', status: 'done' })),
      ...runsOn(info.date).map((r) => ({ name: `Course · ${fmtNum(r.distanceKm || 0, 1)} km`, label: 'Faite', status: 'done', run: r })),
    ];
    rows.push({ info, names });
  }
  return h('section.section', null,
    h('div.section-head', null, h('h2', null, 'Cette semaine'),
      h('button.link', { onclick: () => go('/program/schedule') }, 'Planning')),
    h('div.week-strip', null, days.map((info) => {
      const d = fromISODate(info.date);
      return h(`button.day.st-${info.state}${info.date === today ? '.is-today' : ''}`, {
        'aria-label': `${WEEKDAYS[weekday(info.date) - 1]} : ${info.state}`,
        onclick: () => openDaySheet(info.date),
      },
      h('span.dl', null, WEEKDAYS_SHORT[weekday(info.date) - 1]),
      h('span.dn.num', null, d.getDate()),
      h('span.dot', null, info.state === 'done' ? icon('check', 'sm') : null),
      runsOn(info.date).length ? h('span.run-mark', { 'aria-label': 'Course' }) : null);
    })),
    h('div.list.week-list', null,
      rows.filter((r) => r.names.length).map((r) => r.names.map((n) => h('button.list-row', { onclick: () => (n.run ? openRunSheet(n.run.id) : openDaySheet(r.info.date)) },
        h('div.wk-day', null, WEEKDAYS[weekday(r.info.date) - 1].slice(0, 3) + '.'),
        h('div.grow', null, h('div.title.ellipsis', null, n.name)),
        h(`span.badge.${badgeClass(n, r.info.date, today)}`, null, n.label)))),
      floating.map((it) => h('div.list-row', null,
        h('div.wk-day', null, '—'),
        h('div.grow', null, h('div.title.ellipsis', null, tplName(it.templateId)), h('div.sub', null, 'Pas de jour libre cette semaine')),
        h('span.badge.warn', null, 'Dès que possible'))),
      !rows.some((r) => r.names.length) && !floating.length ? h('div.list-row.muted', null, 'Aucune séance prévue. Touche un jour pour en ajouter une.') : null));
}

function badgeClass(n, date, today) {
  if (n.status === 'done') return 'accent';
  if (n.status === 'skipped') return 'outline';
  if (date < today) return 'warn';
  return date === today ? 'accent' : '';
}
