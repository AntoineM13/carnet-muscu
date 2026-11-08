/**
 * Choix des muscles d'un exercice : UN écran, sans onglets.
 *  - Chaque ligne a un bouton qui défile au toucher : — → Principal → Secondaire → —
 *    (Principal = vert plein, Secondaire = contour vert, — = gris).
 *  - Seuls les groupes déjà choisis sont affichés, avec leurs parties pour
 *    préciser ; « + Autre muscle » ajoute un groupe.
 *  - 2 principaux au maximum (le plus ancien repasse en secondaire).
 */
import { h } from '../core/h.js';
import { MUSCLE_TREE } from '../data/muscles.js';
import { groupOf, isGroup, setMuscles } from '../domain/muscles.js';
import { openSheet } from './overlay.js';
import { icon } from './icons.js';

const NEXT = { none: 'primary', primary: 'secondary', secondary: 'none' };
const LABEL = { none: '—', primary: 'Principal', secondary: 'Secondaire' };

/**
 * @param {object} exercise exercice modifié en place
 * @param {{primary:string[], secondary:string[]}} initial muscles de départ (ex. ceux de la banque)
 * @param {function} onSave appelé à chaque modification
 */
export function editMuscles(exercise, initial, onSave) {
  const sel = { primary: [...(initial?.primary || [])].filter((m) => m !== 'autre'), secondary: [...(initial?.secondary || [])] };
  const shown = new Set([...sel.primary, ...sel.secondary].map(groupOf).filter(Boolean));
  let adding = shown.size === 0;

  const stateOf = (id) => (sel.primary.includes(id) ? 'primary' : sel.secondary.includes(id) ? 'secondary' : 'none');
  const save = () => { setMuscles(exercise, sel); onSave(exercise); };

  const cycle = (id) => {
    const next = NEXT[stateOf(id)];
    sel.primary = sel.primary.filter((x) => x !== id);
    sel.secondary = sel.secondary.filter((x) => x !== id);
    // Un groupe entier et ses parties s'excluent : on garde le choix le plus récent.
    const g = groupOf(id);
    const clash = (x) => (isGroup(id) ? groupOf(x) === g && x !== id : x === g);
    if (next !== 'none') {
      sel.primary = sel.primary.filter((x) => !clash(x));
      sel.secondary = sel.secondary.filter((x) => !clash(x));
    }
    if (next === 'primary') {
      sel.primary.push(id);
      if (sel.primary.length > 2) sel.secondary.unshift(sel.primary.shift());
    } else if (next === 'secondary') sel.secondary.push(id);
    save();
  };

  const stateBtn = (id) => {
    const st = stateOf(id);
    return h(`button.mstate.${st}`, { onclick: (e) => { e.stopPropagation(); cycle(id); sheet.refresh(); } }, LABEL[st]);
  };

  const sheet = openSheet({
    title: 'Muscles travaillés',
    render: (api) => [
      h('p.small.muted', { style: { margin: '0 2px 12px' } }, 'Touche le bouton à droite : Principal (le muscle le plus sollicité), puis Secondaire, puis rien.'),
      shown.size ? h('div.list', null, MUSCLE_TREE.filter((g) => shown.has(g.id)).map((g) => [
        h('div.list-row.mrow', null, h('div.grow.title', null, g.parts ? `${g.label} (tout)` : g.label), stateBtn(g.id)),
        ...(g.parts || []).map((p) => h('div.list-row.mrow.part', null, h('div.grow', null, p.label), stateBtn(p.id))),
      ])) : null,
      adding
        ? h('div', { style: { marginTop: '14px' } },
          h('div.eyebrow', { style: { marginBottom: '8px' } }, 'Ajouter un muscle'),
          h('div.chips', null, MUSCLE_TREE.filter((g) => g.id !== 'autre' && !shown.has(g.id)).map((g) => h('button.chip', {
            onclick: () => { shown.add(g.id); if (!sel.primary.length) { sel.primary.push(g.id); save(); } adding = false; api.refresh(); },
          }, g.label))))
        : h('button.btn.ghost.block', { style: { marginTop: '12px' }, onclick: () => { adding = true; api.refresh(); } }, icon('plus', 'sm'), 'Autre muscle'),
      h('div.sheet-actions', null, h('button.btn.primary.block.lg', { onclick: () => api.close() }, 'Terminé')),
    ],
  });
}
