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
import { suggest, MODES } from '../domain/progression.js';
import { applySuggestion } from '../domain/session.js';
import { formatSets } from '../domain/stats.js';
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

/** Carte « Dernière fois » + consigne du jour (une seule fois par exercice). */
export function exerciseExtras(ctx, item, last) {
  const { session, editMode } = ctx;
  const lastRow = h('div.goal-last', null,
    h('span.eyebrow', null, last ? `Dernière fois · ${fmtDateShort(last.date)}` : 'Dernière fois'),
    last ? h('span.num.goal-last-v', null, formatSets(last.sets, fmtNum)) : h('span.faint', null, 'Première fois'));
  const sug = !editMode && !item.replacedBy && suggestionsOn() ? itemSuggestion(session, item) : null;
  if (!sug) return [h('div.goal-card', null, lastRow)];
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
  return [h(`div.goal-card.mode-${sug.mode}`, null,
    lastRow,
    h('div.goal-sep'),
    h('div.goal-row', null,
      h('span.goal-mode', null, icon(ic, 'sm'), MODES[sug.mode].label),
      h('span.goal-v.num', null, sug.headline)),
    h('div.goal-foot', null,
      h('span.goal-reason.grow', null, sug.reason),
      h('button.link-btn.small.goal-change', { onclick: pick }, 'Changer', icon('chevron', 'sm'))))];
}
