/**
 * Écran de séance — éléments de PROGRESSION : une seule carte par exercice,
 * « Dernière fois » puis, si les suggestions sont activées, la consigne du
 * jour (Augmenter / Stabiliser / Récup) avec ses chiffres. Le mode se change
 * derrière « Changer ». La logique elle-même est dans domain/progression.js.
 * (La « Forme du jour » a été retirée le 2026-11-11 : on garde FORMS/setForm
 * pour les séances anciennes qui l'ont enregistrée.)
 */
import { h } from '../core/h.js';
import { state, getExercise } from '../core/store.js';
import { fmtNum, fmtDateShort } from '../core/util.js';
import { suggest, MODES, compactSets, comparisonRows } from '../domain/progression.js';
import { applySuggestion } from '../domain/session.js';
import { choose } from '../ui/overlay.js';
import { icon } from '../ui/icons.js';

export const FORMS = [
  { value: 'frais', label: 'Frais' },
  { value: 'normal', label: 'Normal' },
  { value: 'ko', label: 'KO' },
];

/** Suggestion pour un item de la séance. */
export function itemSuggestion(session, item, modeOverride = item.mode) {
  return suggest({
    exerciseId: item.exerciseId, target: item.target, mode: modeOverride, form: session.form,
    settings: state.settings, sessions: state.sessions, exercise: getExercise(item.exerciseId), excludeSessionId: session.id, templateId: session.templateId,
  });
}

/** Change la forme du jour et recalcule les séries encore libres. */
export function setForm(session, form) {
  session.form = form;
  for (const item of session.items) {
    if (item.mode || item.replacedBy) continue;
    const sug = itemSuggestion(session, item, null);
    if (sug) applySuggestion(item, sug.sets);
  }
}

export const suggestionsOn = () => state.settings.suggestionsEnabled !== false;

const loadTxt = (v, lest) => (v == null ? '–' : lest ? (v === 0 ? 'PDC' : `${v > 0 ? '+' : ''}${fmtNum(v)}`) : fmtNum(v));
const pairTxt = (p, lest) => (p ? `${loadTxt(p.load, lest)} × ${p.reps ?? '–'}` : '—');

/**
 * Carte de l'exercice. Suggestions activées : la consigne (Augmenter /
 * Stabiliser / Récup, « Changer ») et un tableau série par série
 * « Dernière fois / Aujourd'hui ». Coupées : seulement la dernière fois.
 */
export function exerciseExtras(ctx, item, last) {
  const { session, editMode } = ctx;
  const ex = getExercise(item.exerciseId);
  const lest = ex?.loadMode === 'lest';
  const sug = !editMode && !item.replacedBy && suggestionsOn() ? itemSuggestion(session, item) : null;
  if (!sug) {
    return [h('div.goal-card', null,
      h('span.eyebrow', null, last ? `Dernière fois · ${fmtDateShort(last.date)}` : 'Dernière fois'),
      last ? h('span.num.goal-last-v', null, compactSets(last.sets, fmtNum, { lest })) : h('span.faint', null, 'Première fois'))];
  }
  const pick = async () => {
    const m = await choose({
      title: 'Consigne du jour',
      subtitle: 'Les séries déjà validées ou modifiées à la main ne changent pas.',
      options: Object.entries(MODES).map(([k, v]) => ({
        value: k, label: v.label, on: k === sug.mode,
        help: k === sug.auto ? 'Proposé par l’app' : { augmenter: 'Charge + incrément', stabiliser: 'Même charge, +1 rep', recup: 'Charge réduite, plus de reps' }[k],
      })),
    });
    if (!m) return;
    item.mode = m === sug.auto ? null : m;
    const next = itemSuggestion(session, item);
    if (next) applySuggestion(item, next.sets);
    ctx.save();
  };
  const ic = sug.mode === 'augmenter' ? 'up' : sug.mode === 'recup' ? 'down' : 'repeat';
  const rows = comparisonRows(last, sug.sets);
  return [h(`div.goal-card.mode-${sug.mode}`, null,
    h('div.goal-head', null,
      h('span.goal-mode', null, icon(ic, 'sm'), MODES[sug.mode].label),
      h('button.link-btn.small.goal-change', { onclick: pick }, 'Changer', icon('chevron', 'sm'))),
    h('div.goal-table.num', null,
      h('span'), h('span.gt-h', null, 'Dernière fois', h('small', null, fmtDateShort(last.date))), h('span.gt-h.gt-today', null, 'Aujourd’hui'),
      rows.map((r, i) => [
        h('span.gt-n', null, `Série ${i + 1}`),
        h('span.gt-last', null, pairTxt(r.last, lest)),
        h('span.gt-today', null, pairTxt(r.target, lest),
          r.trend === 'up' ? icon('up', 'sm') : r.trend === 'down' ? h('span.gt-down', null, icon('down', 'sm')) : h('span.gt-pad')),
      ])))];
}
