/**
 * EXPLORATEUR D'EXERCICES (bibliothèque + banque), partagé par l'écran
 * Bibliothèque et le sélecteur d'exercice des séances.
 *
 *  - Sans recherche : une tuile par groupe musculaire.
 *  - Dans un groupe : sections par partie (haut / milieu / bas des pectoraux…),
 *    tes exercices d'abord (blanc), puis ceux de la banque (gris, « + »).
 *  - Avec une recherche : résultats directs, tous groupes confondus.
 */
import { h } from '../core/h.js';
import { state } from '../core/store.js';
import { MUSCLE_TREE, MECHANICS } from '../data/muscles.js';
import { EQUIPMENTS } from '../data/defaults.js';
import { catalog, sortCatalog, sectionsForGroup, countsByGroup, exerciseFromBank } from '../domain/bank.js';
import { getExercise } from '../core/store.js';
import { saveExercise } from '../core/actions.js';
import { openSheet, toast } from './overlay.js';
import { rerender } from '../core/router.js';
import { musclesSummary } from '../domain/muscles.js';
import { exerciseHistory } from '../domain/stats.js';
import { bankIndex } from '../core/bank-store.js';
import { icon } from './icons.js';

const EQ_LABEL = Object.fromEntries(EQUIPMENTS.map((q) => [q.value, q.label.replace(' (charge par haltère)', '')]));
const MECH_SHORT = { poly: 'Poly', iso: 'Isolation' };

/** Ligne de description courte : « Poly · Barre ». */
export function exerciseTags(mech, eq) {
  return [MECH_SHORT[mech], EQ_LABEL[eq]].filter(Boolean).join(' · ');
}

/**
 * @param {object} ui    état de l'explorateur { q, group, mechanic, equipment, showAlso }
 * @param {object} cb    { setGroup(id|null), refresh(), openMine(id), openBank(entry), addBank(entry), exclude:[] }
 */
export function exerciseBrowser(ui, cb) {
  const index = bankIndex();
  const exclude = new Set(cb.exclude || []);
  const exercises = state.exercises.filter((e) => !exclude.has(e.id));

  if (ui.q?.trim()) {
    const items = sortCatalog(catalog(exercises, index, { q: ui.q }));
    const mine = items.filter((i) => i.kind === 'mine');
    const bank = items.filter((i) => i.kind === 'bank').slice(0, 40);
    if (!items.length) return h('div.empty.small', null, 'Aucun exercice trouvé. Tu peux le créer avec le bouton +.');
    return [
      mine.length ? [h('div.eyebrow.list-group-title', null, 'Mes exercices'), h('div.list', null, mine.map((it) => row(it, cb)))] : null,
      bank.length ? [h('div.eyebrow.list-group-title', null, 'Suggestions du catalogue'), h('div.list', null, bank.map((it) => row(it, cb)))] : null,
    ];
  }

  if (!ui.group) {
    const counts = countsByGroup(catalog(exercises, index, {}));
    return h('div.group-tiles', null, MUSCLE_TREE.filter((g) => g.id !== 'autre' || counts.autre?.mine).map((g) => {
      const c = counts[g.id] || { mine: 0, bank: 0 };
      return h('button.group-tile', { onclick: () => cb.setGroup(g.id) },
        h('div.gt-name', null, g.label),
        h('div.gt-count', null,
          c.mine ? h('span.mine', null, `${c.mine} à toi`) : null,
          c.mine && c.bank ? ' · ' : null,
          c.bank ? `${c.bank} suggestion${c.bank > 1 ? 's' : ''}` : null,
          !c.mine && !c.bank ? '—' : null));
    }));
  }

  // Vue d'un groupe : filtres puis sections par partie.
  const all = catalog(exercises, index, { group: ui.group, level: 'any' });
  const eqPresent = [...new Set(all.map((i) => i.eq))].filter(Boolean);
  const filtered = all.filter((i) => (!ui.mechanic || i.mech === ui.mechanic) && (!ui.equipment || i.eq === ui.equipment));
  const { sections, also } = sectionsForGroup(ui.group, filtered);
  const chip = (on, label, fn) => h(`button.chip.sm${on ? '.on' : ''}`, { onclick: fn }, label);
  return [
    h('div.browser-filters', null,
      h('div.chips.scroll', null,
        chip(!ui.mechanic, 'Tous', () => { ui.mechanic = null; cb.refresh(); }),
        MECHANICS.map((m) => chip(ui.mechanic === m.value, m.label, () => { ui.mechanic = ui.mechanic === m.value ? null : m.value; cb.refresh(); }))),
      eqPresent.length > 1 ? h('div.chips.scroll', null,
        chip(!ui.equipment, 'Tout matériel', () => { ui.equipment = null; cb.refresh(); }),
        EQUIPMENTS.filter((q) => eqPresent.includes(q.value)).map((q) => chip(ui.equipment === q.value, EQ_LABEL[q.value], () => { ui.equipment = ui.equipment === q.value ? null : q.value; cb.refresh(); }))) : null),
    sections.length ? sections.map((s) => [
      h('div.eyebrow.list-group-title', null, s.label),
      h('div.list', null, s.items.map((it) => row(it, cb))),
    ]) : h('div.empty.small', null, 'Aucun exercice avec ces filtres.'),
    also.length ? h('details.also', { open: ui.showAlso || null, ontoggle: (e) => { ui.showAlso = e.target.open; } },
      h('summary.eyebrow.list-group-title', null, `Sollicitent aussi ce muscle (${also.length})`),
      h('div.list', null, also.map((it) => row(it, cb)))) : null,
  ];
}

function row(it, cb) {
  if (it.kind === 'mine') {
    const e = it.ex;
    const n = exerciseHistory(e.id, state.sessions).length;
    return h('button.list-row', { onclick: () => cb.openMine(e.id) },
      h('div.grow', null,
        h('div.title.ellipsis', null, e.name),
        h('div.sub.ellipsis', null, [exerciseTags(it.mech, it.eq), n ? `${n} séance${n > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ') || '—')),
      e.pain?.active ? h('span.badge.warn', null, icon('alert', 'sm')) : null,
      h('span.chev', null, icon('chevron', 'sm')));
  }
  const b = it.entry;
  return h('div.list-row.bank-row', null,
    h('button.grow.bank-open', { onclick: () => cb.openBank(b) },
      h('div.title.ellipsis', null, b.fr),
      h('div.sub.ellipsis', null, [exerciseTags(b.mech, b.eq), b.source === 'commune' ? 'partagé' : null].filter(Boolean).join(' · '))),
    h('button.icon-btn.add-btn', { 'aria-label': `Ajouter ${b.fr}`, onclick: () => cb.addBank(b) }, icon('plus', 'sm')));
}

/** Contenu de la fiche d'une entrée de banque (feuille). */
export function bankEntryDetails(b) {
  const ex = { muscles: { primary: b.p || [], secondary: b.s || [] } };
  return [
    b.en ? h('p.small.muted', { style: { marginTop: '-4px' } }, b.en) : null,
    h('div.bank-tags', null, h('span.badge.outline', null, exerciseTags(b.mech, b.eq) || '—'), b.uni ? h('span.badge.outline', null, 'Unilatéral') : null,
      b.source === 'commune' ? h('span.badge.outline', null, 'Partagé') : null),
    h('div.field', { style: { marginTop: '14px' } }, h('label', null, 'Muscles'), h('div', null, musclesSummary(ex))),
    b.d ? h('p', { style: { marginTop: '12px', lineHeight: '1.5' } }, b.d) : null,
  ];
}

/** Ajoute une entrée de la banque à la bibliothèque (même id : rien ne se duplique). */
export function addFromBank(b, { silent = false } = {}) {
  if (!getExercise(b.id)) saveExercise(exerciseFromBank(b), { silent: true });
  if (!silent) toast(`« ${b.fr} » ajouté à ta bibliothèque`);
  return b.id;
}

/** Fiche d'une entrée de banque (feuille), avec « Ajouter ». */
export function openBankSheet(b, { actionLabel = 'Ajouter à ma bibliothèque', onAdd = null } = {}) {
  openSheet({
    title: b.fr,
    render: (api) => [
      ...bankEntryDetails(b),
      h('div.sheet-actions', null,
        h('button.btn.primary.block.lg', { onclick: () => { api.close(); const id = addFromBank(b, { silent: !!onAdd }); if (onAdd) onAdd(id); else rerender(); } }, icon('plus', 'sm'), actionLabel)),
    ],
  });
}
