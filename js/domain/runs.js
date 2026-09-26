/**
 * COURSE À PIED : sorties, allure, plan indicatif.
 * Sortie : { id, date, distanceKm, durationSec, note }
 */
import { uid, weekDates, daysBetween, mondayOf } from '../core/util.js';

export function newRun(date) {
  return { id: uid('run'), date, distanceKm: null, durationSec: null, note: '' };
}

/** Allure en secondes par km (null si incalculable). */
export function paceSec(run) {
  if (!run.distanceKm || !run.durationSec) return null;
  return run.durationSec / run.distanceKm;
}

/** '5:32 /km' */
export function fmtPace(sec) {
  if (!sec || !Number.isFinite(sec)) return '–';
  const m = Math.floor(sec / 60); const s = Math.round(sec % 60);
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${String(s).padStart(2, '0')} /km`;
}

/** Parse une durée saisie : '32', '32:15', '1:02:30' -> secondes. */
export function parseDuration(txt) {
  if (txt == null) return null;
  const parts = String(txt).trim().split(/[:h' ]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 1) return Math.round(parts[0] * 60); // minutes
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function fmtRunDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.round(sec % 60);
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export function runsInWeek(runs, date) {
  const days = new Set(weekDates(date));
  return runs.filter((r) => days.has(r.date));
}

/** Numéro de semaine (0-based) du plan actif, depuis sa date de début. */
export function planWeekIndex(plan, startDate, today) {
  if (!plan || !startDate) return 0;
  const w = Math.floor(daysBetween(mondayOf(startDate), today) / 7);
  return Math.max(0, Math.min(plan.weeks.length - 1, w));
}
