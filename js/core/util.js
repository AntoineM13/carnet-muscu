/**
 * Utilitaires génériques (dates, nombres, identifiants).
 * Aucune dépendance au DOM : utilisable aussi dans les tests Node.
 */

/** Identifiant unique court, préfixé pour la lisibilité dans les exports JSON. */
export function uid(prefix = 'id') {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rnd}`;
}

/** Copie profonde (les données de l'app sont du JSON pur). */
export function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

/* ---------------------------------------------------------------- Dates --
 * Toutes les dates « métier » sont des chaînes locales YYYY-MM-DD.
 * La semaine va du lundi (1) au dimanche (7).
 */

const pad = (n) => String(n).padStart(2, '0');

/** Date locale -> 'YYYY-MM-DD'. */
export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> Date locale à midi (évite les pièges d'heure d'été). */
export function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso, n) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Jour de semaine ISO : 1 = lundi … 7 = dimanche. */
export function weekday(iso) {
  const g = fromISODate(iso).getDay();
  return g === 0 ? 7 : g;
}

/** Lundi de la semaine contenant la date. */
export function mondayOf(iso) {
  return addDays(iso, 1 - weekday(iso));
}

/** Clé de semaine ISO 8601, ex. '2026-W39'. */
export function weekKey(iso) {
  const d = fromISODate(iso);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 4 - (weekday(iso)));
  const yearStart = new Date(thursday.getFullYear(), 0, 1, 12);
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getFullYear()}-W${pad(week)}`;
}

/** Les 7 dates (lundi → dimanche) de la semaine contenant `iso`. */
export function weekDates(iso) {
  const mon = mondayOf(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

export function daysBetween(a, b) {
  return Math.round((fromISODate(b) - fromISODate(a)) / 86400000);
}

export const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const WEEKDAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function weekdayName(iso) {
  return WEEKDAYS[weekday(iso) - 1];
}

/** '12 sept.' */
export function fmtDateShort(iso) {
  const d = fromISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** 'mercredi 12 sept.' */
export function fmtDateLong(iso) {
  return `${weekdayName(iso)} ${fmtDateShort(iso)}`;
}

/** Choix du jour : « Aujourd'hui », « Hier », sinon « Lun. 9 nov. ». */
export function dayLabel(iso, today = todayISO()) {
  const d = daysBetween(iso, today);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  const s = fmtDateLong(iso).replace(/^(\w{3})\w*/, '$1.');
  return s.replace(/^./, (c) => c.toUpperCase());
}

/** Libellé relatif : « aujourd'hui », « hier », sinon date courte. */
export function fmtDateRelative(iso, today = todayISO()) {
  const diff = daysBetween(iso, today);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'hier';
  if (diff === -1) return 'demain';
  return fmtDateShort(iso);
}

/* -------------------------------------------------------------- Nombres -- */

/** Parse une saisie utilisateur ('22,5', '22.5', ' 20 ') ; null si vide/invalide. */
export function parseNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Arrondi au multiple le plus proche de `step` (ex. incrément 2,5 kg). */
export function roundTo(value, step = 2.5) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

/** Format français compact : 22.5 -> '22,5', 20 -> '20'. */
export function fmtNum(n, maxDecimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  const r = Math.round(n * 10 ** maxDecimals) / 10 ** maxDecimals;
  return String(r).replace('.', ',');
}

/** Format kg avec séparateur de milliers : 12450 -> '12 450'. */
export function fmtInt(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Durée en secondes -> '1:30' ou '1 h 05'. */
export function fmtDuration(sec, { long = false } = {}) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (long) return h ? `${h} h ${pad(m)}` : `${m} min`;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Échange deux éléments d'un tableau (en place). */
export function swap(arr, i, j) {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return arr;
}

/** Normalise un texte pour la recherche (minuscule, sans accents). */
export function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
