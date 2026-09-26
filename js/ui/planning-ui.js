/**
 * Interfaces de planning partagées : feuille « jour », choix d'une séance
 * à démarrer, résolution des conflits (intervertir / décaler / sauter).
 * Objectif : toute modification en 3 taps maximum.
 */
import { h } from '../core/h.js';
import { state, getTemplate } from '../core/store.js';
import { todayISO, fmtDateLong, weekday, WEEKDAYS, fmtDateShort, weekDates } from '../core/util.js';
import * as Plan from '../domain/planning.js';
import { editSchedule, startSession } from '../core/actions.js';
import { openSheet, choose } from './overlay.js';
import { segmented } from './components.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { openRunSheet } from '../screens/runs.js';

export const tplName = (id) => getTemplate(id)?.name || 'Séance supprimée';

export const STATE_LABEL = {
  done: 'Faite', today: "Aujourd'hui", planned: 'Prévue', late: 'En retard', skipped: 'Sautée', rest: 'Repos',
};

export function itemStatusLabel(it, today = todayISO()) {
  if (it.status === 'done') return 'Faite';
  if (it.status === 'skipped') return 'Sautée';
  if (!it.plannedDate) return 'Dès que possible';
  if (it.plannedDate < today) return 'En retard';
  if (it.status === 'moved') return 'Décalée';
  return it.plannedDate === today ? "Aujourd'hui" : 'Prévue';
}

/** Où cette séance est-elle prévue cette semaine ? (texte d'aide) */
function plannedHint(templateId, date) {
  const week = Plan.ensureWeek(state.schedule, date);
  const it = week.items.find((i) => i.templateId === templateId && Plan.isActive(i));
  if (!it) {
    const done = week.items.find((i) => i.templateId === templateId && i.status === 'done');
    return done ? 'Déjà faite cette semaine' : 'Non prévue cette semaine';
  }
  if (!it.plannedDate) return 'À faire dès que possible';
  return it.plannedDate === date ? 'Prévue ce jour' : `Prévue ${WEEKDAYS[weekday(it.plannedDate) - 1]}`;
}

/** Demande le sort de la séance déplacée. Résout 'swap' | 'shift' | 'skip' | null. */
export function askResolution(options, displacedName, sourceDay) {
  return choose({
    title: `Et « ${displacedName} » ?`,
    subtitle: 'Elle était prévue ce jour-là.',
    options: options.map((o) => ({
      value: o,
      label: Plan.RESOLUTION_LABELS[o].label + (o === 'swap' && sourceDay ? ` (vers ${sourceDay})` : ''),
      help: Plan.RESOLUTION_LABELS[o].help,
      on: o === options[0],
    })),
  });
}

/**
 * Place une séance (ou repos) un jour donné, pour cette semaine ou toutes.
 * Pose la question de résolution si nécessaire. Résout true si appliqué.
 */
export async function placeWithResolution(templateId, date, scope = 'week', { silent = false } = {}) {
  if (scope === 'all') {
    const wd = weekday(date);
    const a = Plan.analyzeDefault(state.schedule, wd, templateId);
    let res = 'swap';
    if (a.options.length) {
      res = await askResolution(a.options, tplName(a.displaced), a.sourceWd ? WEEKDAYS[a.sourceWd - 1] : null);
      if (!res) return false;
    }
    editSchedule((s) => {
      Plan.setDefault(s, wd, templateId, res);
      if (date >= todayISO()) Plan.regenerateWeek(s, todayISO());
    }, 'Planning par défaut modifié');
    return true;
  }
  const a = Plan.analyzePlace(state.schedule, templateId, date);
  if (a.already) return true;
  let res = 'swap';
  if (a.options.length) {
    const srcDay = a.source?.plannedDate ? WEEKDAYS[weekday(a.source.plannedDate) - 1] : null;
    res = await askResolution(a.options, tplName(a.displaced.templateId), srcDay);
    if (!res) return false;
  }
  editSchedule((s) => Plan.placeTemplate(s, templateId, date, res), silent ? null : (templateId ? 'Planning modifié' : 'Jour passé en repos'));
  return true;
}

/** Feuille « jour » : changer la séance d'un jour, ou le passer en repos. */
export function openDaySheet(date) {
  let scope = 'week';
  const today = todayISO();
  openSheet({
    title: fmtDateLong(date).replace(/^./, (c) => c.toUpperCase()),
    render: (api) => {
      const info = Plan.dayInfo(state.schedule, date, today, state.sessions);
      const current = info.items.filter(Plan.isActive);
      const pick = async (templateId) => {
        api.close();
        await placeWithResolution(templateId, date, scope);
      };
      return [
        // Séances déjà faites / sautées ce jour
        ...info.doneSessions.map((s) => h('button.option', { onclick: () => { api.close(); go(`/history/${s.id}`); } },
          icon('check'), h('div.grow', null, h('div.t', null, s.templateName || 'Séance'), h('div.d', null, 'Faite — voir le détail')))),
        ...info.items.filter((i) => i.status === 'skipped').map((it) => h('button.option', {
          onclick: () => { api.close(); editSchedule(() => Plan.restoreItem(it), 'Séance rétablie'); },
        }, icon('undo'), h('div.grow', null, h('div.t', null, tplName(it.templateId)), h('div.d', null, 'Sautée — toucher pour la rétablir')))),
        ...current.map((it) => h('div.card', { style: { marginBottom: '12px' } },
          h('div.eyebrow', null, itemStatusLabel(it, today)),
          h('h3', { style: { margin: '4px 0 12px' } }, tplName(it.templateId)),
          h('div.row-flex', null,
            h('button.btn.primary.grow', { onclick: () => { api.close(); startPlanned(it); } }, icon('play', 'sm'), 'Démarrer'),
            h('button.btn.ghost', { onclick: () => { api.close(); editSchedule(() => Plan.skipItem(it), 'Séance sautée cette semaine'); } }, 'Sauter')))),
        h('div.eyebrow', { style: { margin: '14px 0 8px' } }, current.length ? 'Remplacer par' : 'Prévoir'),
        segmented([{ value: 'week', label: 'Cette semaine' }, { value: 'all', label: 'Toutes les semaines' }], scope, (v) => { scope = v; api.refresh(); }),
        h('div', { style: { height: '12px' } }),
        ...state.templates.filter((t) => !current.some((c) => c.templateId === t.id)).map((t) => h('button.option', { onclick: () => pick(t.id) },
          h('div.grow', null, h('div.t', null, t.name),
            h('div.d', null, scope === 'all'
              ? (Object.entries(state.schedule.default).find(([, id]) => id === t.id) ? `Par défaut le ${WEEKDAYS[Number(Object.entries(state.schedule.default).find(([, id]) => id === t.id)[0]) - 1]}` : 'Pas de jour par défaut')
              : plannedHint(t.id, date))))),
        (current.length || (scope === 'all' && state.schedule.default[weekday(date)])) && h('button.option', { onclick: () => pick(null) },
          icon('moon'), h('div.grow', null, h('div.t', null, 'Repos'), h('div.d', null, 'Aucune séance ce jour'))),
        state.settings.runsEnabled && date <= today && h('button.option', { onclick: () => { api.close(); openRunSheet(null, date); } },
          icon('run'), h('div.grow', null, h('div.t', null, 'Ajouter une sortie de course'), h('div.d', null, 'Distance, durée, allure'))),
      ];
    },
  });
}

/** Démarre une séance planifiée (le jour même, rattachée à son item). */
export function startPlanned(item) {
  startSession({ templateId: item.templateId, plannedItemId: item.id });
  go('/session');
}

/**
 * « Changer » : choisir n'importe quelle séance (ou séance libre) à démarrer
 * aujourd'hui (ou à une autre date, pour une saisie a posteriori).
 */
export function openStartPicker() {
  let date = todayISO();
  openSheet({
    title: 'Choisir une séance',
    render: (api) => {
      const start = async (templateId) => {
        api.close();
        if (templateId && date === todayISO()) {
          const ok = await placeWithResolution(templateId, date, 'week', { silent: true });
          if (!ok) return;
        }
        startSession({ templateId, date });
        go('/session');
      };
      const dates = weekDates(todayISO()).filter((d) => d <= todayISO()).reverse();
      return [
        h('p.sheet-sub', null, 'Le planning s\'adapte : la séance prévue aujourd\'hui peut être intervertie, décalée ou sautée.'),
        ...state.templates.map((t) => h('button.option', { onclick: () => start(t.id) },
          h('div.grow', null, h('div.t', null, t.name), h('div.d', null, plannedHint(t.id, date))),
          icon('play', 'sm'))),
        h('button.option', { onclick: () => start(null) }, icon('plus'),
          h('div.grow', null, h('div.t', null, 'Séance libre'), h('div.d', null, 'Partir d\'une séance vide'))),
        h('div.field', { style: { marginTop: '16px' } },
          h('label', null, 'Date de la séance'),
          h('div.chips', null,
            dates.map((d) => h(`button.chip${d === date ? '.on' : ''}`, { onclick: () => { date = d; api.refresh(); } },
              d === todayISO() ? "Aujourd'hui" : fmtDateShort(d))),
            h('input.input', { type: 'date', value: date, max: todayISO(), style: { marginTop: '8px' }, onchange: (e) => { if (e.target.value) { date = e.target.value; api.refresh(); } } }))),
      ];
    },
  });
}
