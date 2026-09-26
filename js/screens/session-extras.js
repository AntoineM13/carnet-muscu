/**
 * Écran de séance — éléments de PROGRESSION :
 *  - « Forme du jour » (Frais / Normal / KO) en début de séance ;
 *  - carte « Aujourd'hui » par exercice : mode suggéré (modifiable) + cible.
 * La logique elle-même est dans domain/progression.js.
 */
import { h } from '../core/h.js';
import { state, getExercise } from '../core/store.js';
import { suggest, MODES } from '../domain/progression.js';
import { applySuggestion } from '../domain/session.js';
import { segmented } from '../ui/components.js';
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
    settings: state.settings, sessions: state.sessions, exercise: getExercise(item.exerciseId), excludeSessionId: session.id,
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

export function sessionTopExtras(ctx) {
  const { session, idx, editMode } = ctx;
  if (editMode || idx !== 0) return [];
  const started = session.items.some((it) => it.sets.some((s) => s.done && s.type !== 'echauffement'));
  if (started) return [];
  return [h('div.form-card', null,
    h('div.row-flex', null, h('span.eyebrow.grow', null, 'Forme du jour'),
      h('span.tiny.faint', null, session.form === 'ko' ? 'Suggestions en mode Récup / volume' : 'Modifiable dans le menu')),
    segmented(FORMS, session.form || 'normal', (v) => { setForm(session, v); ctx.save(); }, 'accent'))];
}

export function exerciseExtras(ctx, item) {
  const { session, editMode } = ctx;
  if (editMode || item.replacedBy) return [];
  const sug = itemSuggestion(session, item);
  if (!sug) return [];
  const pick = (m) => {
    item.mode = m === sug.auto ? null : m;
    const next = itemSuggestion(session, item);
    if (next) applySuggestion(item, next.sets);
    ctx.save();
  };
  return [h(`div.sug-card.mode-${sug.mode}`, null,
    h('div.sug-head', null,
      h('span.eyebrow', null, "Aujourd'hui"),
      h('div.sug-modes', null, Object.entries(MODES).map(([k, v]) => h(`button${sug.mode === k ? '.on' : ''}`, {
        'aria-pressed': String(sug.mode === k), onclick: () => pick(k),
      }, v.label, k === sug.auto ? h('span.auto', null, 'auto') : null)))),
    h('div.sug-line.num', null, icon(sug.mode === 'augmenter' ? 'up' : sug.mode === 'recup' ? 'down' : 'repeat', 'sm'), sug.headline),
    h('div.sug-reason', null, sug.reason))];
}
