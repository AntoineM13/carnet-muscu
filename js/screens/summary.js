/**
 * RÉSUMÉ DE FIN DE SÉANCE : durée, volume, records, note de séance,
 * et proposition de mettre à jour le programme si la structure a changé.
 */
import { h } from '../core/h.js';
import { state, getSession, getTemplate, exerciseName } from '../core/store.js';
import { fmtDuration, fmtInt, fmtNum } from '../core/util.js';
import { sessionSummary } from '../domain/stats.js';
import { blocksFromSession, structureSignature } from '../domain/session.js';
import { saveTemplate, reopenSession } from '../core/actions.js';
import { saveDoc } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { go, rerender } from '../core/router.js';
import { confirmAction, toast } from '../ui/overlay.js';

export const NOTE_FIELDS = [
  { key: 'sommeil', label: 'Sommeil', low: 'Mauvais', high: 'Excellent' },
  { key: 'fatigue', label: 'Fatigue', low: 'Aucune', high: 'Épuisé' },
  { key: 'douleur', label: 'Douleur', low: 'Aucune', high: 'Forte' },
  { key: 'humeur', label: 'Humeur', low: 'Basse', high: 'Top' },
];

export function renderSummary({ id }) {
  const s = getSession(id);
  if (!s) { go('/', { replace: true }); return { node: h('div'), tab: null }; }
  const sum = sessionSummary(s, state.sessions, exerciseName);
  const tpl = s.templateId ? getTemplate(s.templateId) : null;
  const newBlocks = tpl ? blocksFromSession(s, tpl, state.settings) : null;
  const changed = tpl && structureSignature(newBlocks) !== structureSignature(tpl.blocks);
  const saveNote = () => saveDoc('sessions', s, { silent: true });

  const node = h('main.screen.no-tabs', null,
    h('div.summary-hero', null,
      h('span.summary-ic', null, icon('check', 'lg')),
      h('h1', null, 'Séance terminée'),
      h('p.muted', null, s.templateName)),
    h('div.kv', null,
      h('div.cell', null, h('div.k', null, 'Durée'), h('div.v', null, fmtDuration(sum.durationSec, { long: true }))),
      h('div.cell', null, h('div.k', null, 'Volume'), h('div.v', null, fmtInt(sum.volume), h('small', null, ' kg'))),
      h('div.cell', null, h('div.k', null, 'Séries'), h('div.v', null, sum.sets))),
    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Records battus')),
      sum.records.length
        ? h('div.list', null, sum.records.map((r) => h('div.list-row', null,
          h('span.lead.accent', null, icon('trophy', 'sm')),
          h('div.grow', null, h('div.title', null, r.name), h('div.sub', null, r.kind)),
          h('span.num.accent', { style: { fontWeight: 600 } }, `${r.kind === 'Volume' ? fmtInt(r.value) : fmtNum(r.value, 1)} kg${r.reps ? ` × ${r.reps}` : ''}`))))
        : h('p.muted.small', null, 'Pas de record cette fois. La régularité paie.')),
    h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Note de séance'), h('span.small.faint', null, 'Optionnel')),
      h('div.card.stack', null,
        NOTE_FIELDS.map((f) => h('div', null,
          h('div.row-flex', { style: { justifyContent: 'space-between', marginBottom: '6px' } },
            h('span.small', null, f.label), h('span.tiny.faint', null, `${f.low} → ${f.high}`)),
          h('div.scale', null, [1, 2, 3, 4, 5].map((n) => h(`button${s.note[f.key] === n ? '.on' : ''}`, {
            'aria-label': `${f.label} ${n}`,
            onclick: () => { s.note[f.key] = s.note[f.key] === n ? null : n; saveNote(); rerender(); },
          }, n))))),
        h('textarea.textarea', { placeholder: 'Commentaire libre', oninput: (e) => { s.note.texte = e.target.value; saveNote(); } }, s.note.texte || ''))),
    changed && h('section.section', null,
      h('div.banner.info', null, h('span.ic', null, icon('info')),
        h('div.grow', null,
          h('div', null, `Tu as modifié la structure de « ${tpl.name} » aujourd’hui (ordre, exercices, séries ou supersets).`),
          h('div.actions', null, h('button.btn.sm.ghost', {
            onclick: async () => {
              const ok = await confirmAction({ title: 'Mettre à jour le programme ?', message: `Le modèle « ${tpl.name} » prendra la structure de cette séance. Les exercices sautés restent dans le programme.`, confirmLabel: 'Mettre à jour', danger: false });
              if (!ok) return;
              const before = JSON.parse(JSON.stringify(tpl.blocks));
              tpl.blocks = newBlocks; saveTemplate(tpl, { silent: true }); rerender();
              toast('Programme mis à jour', { undo: () => { tpl.blocks = before; saveTemplate(tpl, { silent: true }); rerender(); } });
            },
          }, 'Mettre à jour le programme'))))),
    h('div.sheet-actions', { style: { marginTop: '28px' } },
      h('button.btn.primary.lg.block', { onclick: () => go('/') }, 'Terminer'),
      h('button.btn.quiet.block', { onclick: () => { reopenSession(s); go('/session'); } }, icon('undo', 'sm'), 'Reprendre la séance')));
  return { node, tab: null };
}
