/**
 * HISTORIQUE : calendrier mensuel + liste, détail d'une séance passée,
 * correction a posteriori (marquée « modifiée après coup »).
 */
import { h } from '../core/h.js';
import { state, getSession, exerciseName, finishedSessions } from '../core/store.js';
import {
  todayISO, fmtDateLong, fmtDateShort, fmtDuration, fmtInt, fmtNum, MONTHS_LONG, toISODate, WEEKDAYS_SHORT,
} from '../core/util.js';
import { sessionSummary, formatSets } from '../domain/stats.js';
import { steps } from '../domain/session.js';
import { deleteSession } from '../core/actions.js';
import { icon } from '../ui/icons.js';
import { screenHead, topbar, emptyState } from '../ui/components.js';
import { go, rerender } from '../core/router.js';
import { confirmAction } from '../ui/overlay.js';
import { changeDate } from './session.js';
import { NOTE_FIELDS } from './summary.js';
import { historyExtras } from './history-extras.js';

let month = null; // 'YYYY-MM' affiché

export function renderHistory() {
  const today = todayISO();
  if (!month) month = today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const all = finishedSessions();
  const inMonth = all.filter((s) => s.date.startsWith(month));
  const byDate = {};
  for (const s of all) (byDate[s.date] ||= []).push(s);
  const extra = historyExtras(month);

  const shift = (d) => { const dt = new Date(y, m - 1 + d, 1); month = toISODate(dt).slice(0, 7); rerender(); };
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const nDays = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(h('span.cal-cell.pad'));
  for (let d = 1; d <= nDays; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    const has = byDate[iso];
    const run = extra.dates?.has(iso);
    cells.push(h(`button.cal-cell${has ? '.has' : ''}${iso === today ? '.today' : ''}`, {
      disabled: !has && !run,
      onclick: () => { if (has?.length === 1) go(`/history/${has[0].id}`); else document.getElementById(`d-${iso}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    }, h('span.num', null, d), (has || run) ? h('span.cal-dots', null, has ? h('i') : null, run ? h('i.run') : null) : null));
  }
  const vol = inMonth.reduce((a, s) => a + sessionSummary(s, []).volume, 0);

  const node = h('main.screen', null,
    screenHead('Historique', `${all.length} séance${all.length > 1 ? 's' : ''} au total`),
    h('div.card.cal', null,
      h('div.cal-head', null,
        h('button.icon-btn', { 'aria-label': 'Mois précédent', onclick: () => shift(-1) }, icon('back', 'sm')),
        h('div.grow.center', null, h('div.cal-title', null, `${MONTHS_LONG[m - 1]} ${y}`),
          h('div.tiny.faint', null, `${inMonth.length} séance${inMonth.length > 1 ? 's' : ''} · ${fmtInt(vol)} kg`)),
        h('button.icon-btn', { 'aria-label': 'Mois suivant', onclick: () => shift(1) }, icon('chevron', 'sm'))),
      h('div.cal-grid', null, WEEKDAYS_SHORT.map((d) => h('span.cal-dow', null, d)), cells)),
    h('section.section', null,
      inMonth.length
        ? h('div.list', null, inMonth.map((s) => sessionRow(s)))
        : emptyState('history', 'Aucune séance ce mois-ci.')),
    ...(extra.nodes || []));
  return { node, tab: 'history' };
}

function sessionRow(s) {
  const sum = sessionSummary(s, []);
  return h('button.list-row', { id: `d-${s.date}`, onclick: () => go(`/history/${s.id}`) },
    h('div.hist-date', null, h('span.num', null, s.date.slice(8)), h('span', null, fmtDateShort(s.date).split(' ')[1])),
    h('div.grow', null,
      h('div.title.ellipsis', null, s.templateName),
      h('div.sub.num', null, `${fmtDuration(sum.durationSec, { long: true })} · ${sum.sets} série${sum.sets > 1 ? "s" : ""} · ${fmtInt(sum.volume)} kg`,
        s.editedAfterFinish ? h('span.faint', null, ' · modifiée') : null)),
    h('span.chev', null, icon('chevron', 'sm')));
}

export function renderHistoryDetail({ id }) {
  const s = getSession(id);
  if (!s) { go('/history', { replace: true }); return { node: h('div'), tab: null }; }
  const sum = sessionSummary(s, state.sessions, exerciseName);
  const note = s.note || {};
  const hasNote = NOTE_FIELDS.some((f) => note[f.key]) || note.texte;
  const node = h('main.screen.no-tabs', null,
    topbar(s.templateName, { backTo: '/history' }),
    h('div.row-flex', { style: { marginBottom: '14px', flexWrap: 'wrap' } },
      h('span.muted', null, fmtDateLong(s.date).replace(/^./, (c) => c.toUpperCase())),
      s.status === 'active' ? h('span.badge.accent', null, 'En cours') : null,
      s.editedAfterFinish ? h('span.badge.outline', null, 'Modifiée après coup') : null),
    h('div.kv', null,
      h('div.cell', null, h('div.k', null, 'Durée'), h('div.v', null, fmtDuration(sum.durationSec, { long: true }))),
      h('div.cell', null, h('div.k', null, 'Volume'), h('div.v', null, fmtInt(sum.volume), h('small', null, ' kg'))),
      h('div.cell', null, h('div.k', null, 'Séries'), h('div.v', null, sum.sets))),
    h('section.section', null,
      h('div.list', null, steps(s).map((st) => st.items.map((it) => h('button.list-row', { onclick: () => go(`/exercise/${it.exerciseId}`) },
        h('div.grow', null,
          h('div.title', null, exerciseName(it.exerciseId), st.isSuperset ? h('span.badge', { style: { marginLeft: '8px' } }, 'Superset') : null),
          it.skipped ? h('div.sub.faint', null, 'Sauté') : h('div.sub.num', null, formatSets(it.sets, fmtNum) || '—'),
          it.sets.some((x) => x.note) ? h('div.sub.faint', null, it.sets.filter((x) => x.note).map((x) => x.note).join(' · ')) : null),
        h('span.chev', null, icon('chevron', 'sm'))))))),
    hasNote && h('section.section', null,
      h('div.section-head', null, h('h2', null, 'Note de séance')),
      h('div.card', null,
        h('div.chips', null, NOTE_FIELDS.filter((f) => note[f.key]).map((f) => h('span.chip', null, `${f.label} ${note[f.key]}/5`))),
        note.texte ? h('p', { style: { marginTop: '10px' } }, note.texte) : null)),
    h('div.sheet-actions', { style: { marginTop: '28px' } },
      h('button.btn.primary.block', { onclick: () => { s.currentStep = 0; go(`/session/${s.id}`); } }, icon('edit', 'sm'), 'Corriger la séance'),
      h('button.btn.ghost.block', { onclick: () => changeDate(s) }, icon('calendar', 'sm'), 'Changer la date'),
      h('button.btn.danger.block', {
        onclick: async () => {
          const ok = await confirmAction({ title: 'Supprimer cette séance ?', message: 'Tu pourras annuler juste après.' });
          if (ok) { go('/history'); deleteSession(s); }
        },
      }, icon('trash', 'sm'), 'Supprimer')));
  return { node, tab: null };
}
