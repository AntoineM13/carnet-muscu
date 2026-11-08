/**
 * TABLEAU DE BORD « PROGRÈS » : calculs purs (rien n'est stocké).
 *
 * Cohérence force / volume : un même exercice peut être travaillé lourd dans
 * une séance et en volume dans une autre (ex. développé décliné : Pec/Dos en
 * force, Dos/Pec en volume). Les courbes et les tendances sont donc toujours
 * calculées SÉANCE PAR SÉANCE (modèle `templateId`), jamais mélangées.
 * Le 1RM estimé permet de comparer les deux sur la même échelle.
 *
 * Exercices « poids du corps + lest » (tractions, dips) : si le poids de corps
 * est connu, il est ajouté à la charge (`loadOffsetFor`), sinon une charge de
 * 0 n'a ni volume ni 1RM et la tendance se fait sur les reps.
 */
import { exerciseHistory, sessionSummary, isWorkSet, setVolume } from './stats.js';
import { mondayOf, addDays } from '../core/util.js';

export const FREE_KEY = '__libre';

/** Charge à ajouter pour un exercice : le poids de corps s'il est « poids du corps + lest ». */
export function loadOffsetFor(exercise, bodyWeight) {
  return exercise?.loadMode === 'lest' && bodyWeight > 0 ? bodyWeight : 0;
}

/** Valeur d'une métrique pour les stats d'un exercice dans une séance. */
export function metricValue(stats, metric) {
  if (metric === 'e1rm') return stats.bestE1RM;
  if (metric === 'volume') return stats.volume || null;
  return stats.topLoad;
}

/**
 * Historique d'un exercice découpé par séance modèle.
 * @returns {{ key, templateId, name, points:{date, value}[] }[]}
 *   trié par nombre de points décroissant (la séance la plus fréquente d'abord).
 */
export function exerciseSeriesByTemplate(exerciseId, sessions, metric = 'load', { limit = 24, loadOffset = 0 } = {}) {
  const groups = new Map();
  for (const x of exerciseHistory(exerciseId, sessions, { loadOffset })) {
    const key = x.session.templateId || FREE_KEY;
    if (!groups.has(key)) groups.set(key, { key, templateId: x.session.templateId || null, name: 'Séance libre', points: [] });
    const g = groups.get(key);
    if (x.session.templateId) g.name = x.session.templateName || g.name;
    const value = metricValue(x.stats, metric);
    if (value != null) g.points.push({ date: x.date, value });
  }
  return [...groups.values()]
    .filter((g) => g.points.length)
    .map((g) => ({ ...g, points: g.points.slice(-limit) }))
    .sort((a, b) => b.points.length - a.points.length);
}

const sessionVolume = (s) => s.items.reduce((acc, it) => acc + it.sets.reduce((a, set) => a + setVolume(set), 0), 0);
const sessionWorkSets = (s) => s.items.reduce((acc, it) => acc + it.sets.filter(isWorkSet).length, 0);

/**
 * Résumé de la semaine en cours (lundi → dimanche), comparé à la semaine
 * précédente au même stade (du lundi au même jour de la semaine).
 */
export function weekSummary(sessions, today, exerciseName = (id) => id) {
  const start = mondayOf(today);
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7);
  const prevSameDay = addDays(today, -7);
  const done = sessions.filter((s) => s.status === 'done');
  const week = done.filter((s) => s.date >= start && s.date <= end);
  const prevToDate = done.filter((s) => s.date >= prevStart && s.date <= prevSameDay);
  const prevFull = done.filter((s) => s.date >= prevStart && s.date < start);
  const sum = (list, f) => list.reduce((acc, s) => acc + f(s), 0);
  const records = week.flatMap((s) => sessionSummary(s, sessions, exerciseName).records.map((r) => ({ ...r, date: s.date })));
  const volume = sum(week, sessionVolume);
  const prevVolumeToDate = sum(prevToDate, sessionVolume);
  return {
    start, end,
    count: week.length,
    prevCount: prevFull.length,
    sets: sum(week, sessionWorkSets),
    volume,
    prevVolume: sum(prevFull, sessionVolume),
    prevVolumeToDate,
    volumeDeltaPct: prevVolumeToDate > 0 ? ((volume - prevVolumeToDate) / prevVolumeToDate) * 100 : null,
    records,
  };
}

/** Exercices d'une séance modèle, dans l'ordre (alternatives réellement faites incluses). */
function templateExercises(template, doneHere) {
  const out = [];
  for (const block of template.blocks || []) {
    for (const slot of block.slots || []) {
      const candidates = [slot.exerciseId, ...(slot.alternatives || [])];
      const used = candidates.filter((id) => doneHere.has(id));
      for (const id of (used.length ? used : [slot.exerciseId])) if (!out.some((o) => o.exerciseId === id)) out.push({ exerciseId: id, slotId: slot.id });
    }
  }
  return out;
}

/**
 * Tendance de chaque exercice d'une séance modèle, sur l'historique de CETTE
 * séance uniquement : dernière fois vs il y a `days` jours (à défaut, la
 * première fois).
 * trend : 'up' | 'flat' | 'down' | null (pas assez d'historique), d'après le 1RM estimé.
 */
export function templateTrends(template, sessions, today, { days = 28, tolerancePct = 1, offsetFor = () => 0 } = {}) {
  const here = sessions.filter((s) => s.status === 'done' && s.templateId === template.id);
  const doneHere = new Set(here.flatMap((s) => s.items.filter((it) => it.sets.some(isWorkSet)).map((it) => it.exerciseId)));
  const limit = addDays(today, -days);
  return templateExercises(template, doneHere).map(({ exerciseId, slotId }) => {
    const loadOffset = offsetFor(exerciseId);
    const hist = exerciseHistory(exerciseId, here, { loadOffset });
    if (!hist.length) return { exerciseId, slotId, loadOffset, count: 0, current: null, ref: null, deltaLoad: null, deltaE1RM: null, trend: null };
    const cur = hist[hist.length - 1];
    let ref = null;
    for (let i = hist.length - 2; i >= 0; i--) if (hist[i].date <= limit) { ref = hist[i]; break; }
    if (!ref && hist.length > 1) ref = hist[0];
    const pick = (x) => x && { date: x.date, topLoad: x.stats.topLoad, topReps: x.stats.topReps, bestE1RM: x.stats.bestE1RM };
    const deltaLoad = ref && cur.stats.topLoad != null && ref.stats.topLoad != null ? cur.stats.topLoad - ref.stats.topLoad : null;
    const deltaE1RM = ref && cur.stats.bestE1RM != null && ref.stats.bestE1RM != null ? cur.stats.bestE1RM - ref.stats.bestE1RM : null;
    let trend = null;
    let deltaReps = null;
    if (deltaE1RM != null && ref.stats.bestE1RM > 0) {
      const pct = (deltaE1RM / ref.stats.bestE1RM) * 100;
      trend = pct > tolerancePct ? 'up' : pct < -tolerancePct ? 'down' : 'flat';
    } else if (ref && cur.stats.topLoad === ref.stats.topLoad && cur.stats.topReps != null && ref.stats.topReps != null) {
      // Même charge sans 1RM exploitable (ex. tractions à 0 kg sans poids de corps) : tendance sur les reps.
      deltaReps = cur.stats.topReps - ref.stats.topReps;
      trend = deltaReps > 0 ? 'up' : deltaReps < 0 ? 'down' : 'flat';
    }
    return { exerciseId, slotId, loadOffset, count: hist.length, current: pick(cur), ref: pick(ref), deltaLoad, deltaE1RM, deltaReps, trend };
  });
}
