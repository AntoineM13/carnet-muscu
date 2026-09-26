/**
 * Ajouts à l'historique par des modules optionnels (course à pied).
 * @returns {{ dates?: Set<string>, nodes?: Node[] }}
 */
import { h } from '../core/h.js';
import { state } from '../core/store.js';
import { runRow } from './runs.js';

export function historyExtras(month) {
  if (!state.settings.runsEnabled) return {};
  const runs = state.runs.filter((r) => r.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  return {
    dates: new Set(runs.map((r) => r.date)),
    nodes: runs.length ? [h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Course à pied'), h('a.link', { href: '#/runs' }, 'Tout voir')),
      h('div.list', null, runs.map(runRow)))] : [],
  };
}
