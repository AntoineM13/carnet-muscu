/**
 * MODULE DE PLANNING
 * ==================
 * Le planning est une PROPOSITION, jamais une contrainte.
 *
 * Structure (state.schedule) :
 *   default : { 1..7 -> templateId }            planning par défaut (lundi = 1)
 *   weeks   : { '2026-W39': { items: [...] } }  exceptions par semaine
 *
 * Un « item » planifié :
 *   { id, templateId, plannedDate, originalDate, status, sessionId }
 *   - plannedDate  : jour actuel de la séance (null = « à faire dès que possible »)
 *   - originalDate : jour prévu à la génération de la semaine
 *   - status       : 'todo' | 'moved' | 'done' | 'skipped'
 *                    (« en retard » n'est pas stocké : c'est un todo dont la date est passée)
 *
 * Une semaine est générée depuis `default` la première fois qu'on la consulte.
 * Ensuite, elle vit sa vie : « Cette semaine » ne modifie qu'elle.
 *
 * La progression ne dépend PAS du planning : sauter, décaler ou intervertir
 * ne change rien aux suggestions (qui se basent sur l'historique de chaque exercice).
 *
 * Toutes les fonctions sont pures vis-à-vis du DOM et modifient l'objet
 * `schedule` passé en paramètre (l'appelant se charge de sauvegarder).
 */
import { uid, weekKey, weekDates, weekday, addDays } from '../core/util.js';

export const ACTIVE = ['todo', 'moved'];
export const isActive = (it) => ACTIVE.includes(it.status);

/** Semaine contenant `date`, générée depuis le planning par défaut si besoin. */
export function ensureWeek(schedule, date) {
  const key = weekKey(date);
  if (!schedule.weeks[key]) {
    const items = [];
    for (const d of weekDates(date)) {
      const tpl = schedule.default[weekday(d)];
      if (tpl) items.push(newItem(tpl, d));
    }
    schedule.weeks[key] = { items };
  }
  return schedule.weeks[key];
}

function newItem(templateId, date) {
  return { id: uid('pl'), templateId, plannedDate: date, originalDate: date, status: 'todo', sessionId: null };
}

/** Supprime de la semaine les items dont la séance modèle n'existe plus. */
export function pruneWeek(week, templateIds) {
  week.items = week.items.filter((it) => it.status === 'done' || templateIds.has(it.templateId));
}

const statusAfterMove = (it) => (it.plannedDate === it.originalDate ? 'todo' : 'moved');

export function findItem(schedule, itemId) {
  for (const w of Object.values(schedule.weeks)) {
    const it = w.items.find((i) => i.id === itemId);
    if (it) return it;
  }
  return null;
}

/** Prochain jour « libre » (sans séance active ni faite) à partir de `from`, dans la semaine. */
export function nextFreeDay(week, from, anchor = from) {
  for (const d of weekDates(anchor)) {
    if (d < from) continue;
    const busy = week.items.some((it) => it.plannedDate === d && (isActive(it) || it.status === 'done'));
    if (!busy) return d;
  }
  return null;
}

/**
 * État d'un jour pour la vue « Cette semaine ».
 * @returns {{date, items, doneSessions, state}}
 *   state : 'done' | 'today' | 'planned' | 'late' | 'skipped' | 'rest'
 */
export function dayInfo(schedule, date, today, sessions = []) {
  const week = ensureWeek(schedule, date);
  const items = week.items.filter((it) => it.plannedDate === date);
  const doneSessions = sessions.filter((s) => s.status === 'done' && s.date === date);
  const active = items.filter(isActive);
  let st = 'rest';
  if (active.length) st = date < today ? 'late' : date === today ? 'today' : 'planned';
  else if (doneSessions.length || items.some((i) => i.status === 'done')) st = 'done';
  else if (items.some((i) => i.status === 'skipped')) st = 'skipped';
  return { date, items, doneSessions, state: st };
}

/** Items en retard (non faits, date passée) de la semaine courante, du plus ancien au plus récent. */
export function lateItems(schedule, today) {
  const week = ensureWeek(schedule, today);
  return week.items
    .filter((it) => isActive(it) && it.plannedDate && it.plannedDate < today)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}

/** Items « à faire dès que possible » (sans date). */
export function floatingItems(schedule, today) {
  return ensureWeek(schedule, today).items.filter((it) => isActive(it) && !it.plannedDate);
}

/**
 * Prochaine séance proposée :
 *  1. la séance prévue aujourd'hui si elle n'est pas faite ;
 *  2. sinon la séance en retard la plus ancienne ;
 *  3. sinon une séance « dès que possible » ;
 *  4. sinon la prochaine séance prévue non faite (cette semaine puis la suivante).
 */
export function nextProposal(schedule, today) {
  const week = ensureWeek(schedule, today);
  const todays = week.items.find((it) => isActive(it) && it.plannedDate === today);
  if (todays) return { item: todays, reason: 'today' };
  const late = lateItems(schedule, today)[0];
  if (late) return { item: late, reason: 'late' };
  const floating = floatingItems(schedule, today)[0];
  if (floating) return { item: floating, reason: 'asap' };
  const upcoming = week.items
    .filter((it) => isActive(it) && it.plannedDate > today)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
  if (upcoming) return { item: upcoming, reason: 'next' };
  const nextWeek = ensureWeek(schedule, addDays(weekDates(today)[6], 1));
  const first = nextWeek.items.filter(isActive).sort((a, b) => (a.plannedDate || '').localeCompare(b.plannedDate || ''))[0];
  return first ? { item: first, reason: 'next' } : null;
}

/* ----------------------------------------------------- Modifications -- */

/**
 * Analyse ce qu'implique de placer `templateId` le jour `date` (cette semaine).
 * @returns {{ displaced: item|null, source: item|null, options: string[] }}
 *   - displaced : séance active déjà prévue ce jour-là (qu'il faut intervertir / décaler / sauter)
 *   - source    : l'item de cette séance prévu un autre jour de la semaine
 *   - options   : résolutions possibles pour `displaced` (vide = aucune question à poser)
 */
export function analyzePlace(schedule, templateId, date) {
  const week = ensureWeek(schedule, date);
  const displaced = templateId
    ? week.items.find((it) => it.plannedDate === date && isActive(it) && it.templateId !== templateId) || null
    : week.items.find((it) => it.plannedDate === date && isActive(it)) || null;
  const already = templateId && week.items.find((it) => it.plannedDate === date && isActive(it) && it.templateId === templateId);
  const source = templateId && !already
    ? week.items.filter((it) => it.templateId === templateId && isActive(it) && it.plannedDate !== date)
      .sort((a, b) => (a.plannedDate || '9').localeCompare(b.plannedDate || '9'))[0] || null
    : null;
  let options = [];
  if (displaced) options = source && source.plannedDate ? ['swap', 'shift', 'skip'] : ['shift', 'skip'];
  return { displaced, source, already: !!already, options };
}

/**
 * Place une séance (ou le repos si templateId = null) un jour donné, CETTE SEMAINE.
 * @param {'swap'|'shift'|'skip'} resolution sort de la séance déplacée (si besoin)
 * @returns l'item placé (ou null pour un repos)
 */
export function placeTemplate(schedule, templateId, date, resolution = 'swap') {
  const week = ensureWeek(schedule, date);
  const { displaced, source, already } = analyzePlace(schedule, templateId, date);
  if (already) return week.items.find((it) => it.plannedDate === date && isActive(it) && it.templateId === templateId);

  const sourceDate = source?.plannedDate || null;
  let placed = null;
  if (templateId) {
    if (source) {
      source.plannedDate = date;
      source.status = statusAfterMove(source);
      placed = source;
    } else {
      placed = newItem(templateId, date);
      placed.extra = true; // ajoutée à la main cette semaine
      week.items.push(placed);
    }
  }
  if (displaced) {
    let res = resolution;
    if (res === 'swap' && !sourceDate) res = 'shift';
    if (res === 'swap') {
      displaced.plannedDate = sourceDate;
    } else if (res === 'shift') {
      displaced.plannedDate = nextFreeDay(week, addDays(date, 1), date); // null => dès que possible
    }
    displaced.status = res === 'skip' ? 'skipped' : (displaced.plannedDate ? statusAfterMove(displaced) : 'moved');
  }
  return placed;
}

/** Décale un item vers le prochain jour libre à partir de `from` (sinon « dès que possible »). */
export function shiftItem(schedule, item, from) {
  const anchor = item.originalDate || from;
  const week = ensureWeek(schedule, anchor);
  item.plannedDate = null; // libère son jour actuel pour le calcul
  item.plannedDate = weekKey(from) === weekKey(anchor) ? nextFreeDay(week, from, anchor) : null;
  item.status = item.plannedDate ? statusAfterMove(item) : 'moved';
}

export function skipItem(item) { item.status = 'skipped'; }
export function restoreItem(item) { item.status = statusAfterMove(item); }

/**
 * Modifie le planning PAR DÉFAUT (toutes les semaines) pour un jour de semaine.
 * Même logique d'interversion / décalage / saut, appliquée aux jours de semaine.
 */
export function setDefault(schedule, wd, templateId, resolution = 'swap') {
  const def = schedule.default;
  const displaced = def[wd] && def[wd] !== templateId ? def[wd] : null;
  const sourceWd = templateId ? Object.keys(def).map(Number).find((k) => k !== wd && def[k] === templateId) : null;
  if (sourceWd) delete def[sourceWd];
  if (templateId) def[wd] = templateId; else delete def[wd];
  if (displaced) {
    let res = resolution;
    if (res === 'swap' && !sourceWd) res = 'shift';
    if (res === 'swap') def[sourceWd] = displaced;
    else if (res === 'shift') {
      for (let k = wd + 1; k <= 7; k++) if (!def[k]) { def[k] = displaced; break; }
    }
  }
}

/** Options de résolution pour une modification du planning par défaut. */
export function analyzeDefault(schedule, wd, templateId) {
  const def = schedule.default;
  const displaced = def[wd] && def[wd] !== templateId ? def[wd] : null;
  const sourceWd = templateId ? Object.keys(def).map(Number).find((k) => k !== wd && def[k] === templateId) : null;
  return { displaced, sourceWd, options: displaced ? (sourceWd ? ['swap', 'shift', 'skip'] : ['shift', 'skip']) : [] };
}

/* --------------------------------------------- Liens avec les séances -- */

/** Item à rattacher quand on démarre `templateId` le jour `date`. */
export function itemForStart(schedule, templateId, date) {
  const week = ensureWeek(schedule, date);
  const cands = week.items.filter((it) => it.templateId === templateId && isActive(it));
  return cands.find((it) => it.plannedDate === date)
    || cands.filter((it) => it.plannedDate && it.plannedDate < date).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0]
    || cands.find((it) => !it.plannedDate)
    || null;
}

/** Marque l'item lié à une séance comme fait (et le ramène au jour réel si possible). */
export function markDone(schedule, session) {
  if (!session.plannedItemId) return;
  const it = findItem(schedule, session.plannedItemId);
  if (!it) return;
  it.status = 'done';
  it.sessionId = session.id;
  if (it.plannedDate !== session.date && weekKey(session.date) === weekKey(it.originalDate)) {
    it.plannedDate = session.date;
  }
}

/** Annule le lien (séance supprimée ou rouverte). */
export function unmarkDone(schedule, sessionId) {
  for (const w of Object.values(schedule.weeks)) {
    for (const it of w.items) {
      if (it.sessionId === sessionId) { it.sessionId = null; it.status = statusAfterMove(it); }
    }
  }
}

export const RESOLUTION_LABELS = {
  swap: { label: 'Intervertir', help: 'Les deux jours échangent leur séance.' },
  shift: { label: 'Décaler', help: 'Au prochain jour libre de la semaine, sinon « dès que possible ».' },
  skip: { label: 'Sauter', help: "Elle n'est pas faite cette semaine (sans impact sur la progression)." },
};

/**
 * Régénère la semaine de `today` depuis le planning par défaut, en conservant
 * les séances déjà faites (utilisé après un import de programme ou un
 * changement « toutes les semaines » important).
 */
export function regenerateWeek(schedule, today) {
  const week = ensureWeek(schedule, today);
  const done = week.items.filter((it) => it.status === 'done');
  const doneTpl = new Set(done.map((it) => it.templateId));
  const items = [...done];
  for (const d of weekDates(today)) {
    if (d < today) continue;
    const tpl = schedule.default[weekday(d)];
    if (tpl && !doneTpl.has(tpl)) items.push(newItem(tpl, d));
  }
  week.items = items;
}
