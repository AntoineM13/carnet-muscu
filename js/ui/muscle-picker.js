/**
 * Choix des muscles d'un exercice : principaux (1 ou 2) et secondaires.
 * Simple par défaut : on touche un GROUPE. Ses parties n'apparaissent que
 * lorsqu'il est choisi, pour préciser si on le souhaite (« descendre »).
 */
import { h } from '../core/h.js';
import { MUSCLE_TREE } from '../data/muscles.js';
import { exerciseMuscles, groupOf, isGroup, setMuscles } from '../domain/muscles.js';
import { openSheet } from './overlay.js';
import { segmented } from './components.js';

/**
 * Ouvre la feuille. `onSave(exercise)` est appelé à chaque modification
 * (l'exercice passé est modifié en place).
 */
export function editMuscles(exercise, onSave) {
  let mode = 'primary';
  const cur = exerciseMuscles(exercise);
  const sel = { primary: exercise.muscles?.primary?.length ? [...cur.primary] : (cur.primary[0] === 'autre' ? [] : [...cur.primary]), secondary: [...cur.secondary] };

  const apply = () => { setMuscles(exercise, sel); onSave(exercise); };

  /** Touche un groupe ou une partie dans la liste du mode courant. */
  const toggle = (id) => {
    const list = sel[mode];
    const other = mode === 'primary' ? 'secondary' : 'primary';
    const g = groupOf(id);
    if (list.includes(id)) {
      sel[mode] = list.filter((x) => x !== id);
    } else {
      // Groupe et parties du même groupe s'excluent : on garde le plus précis choisi en dernier.
      let next = list.filter((x) => (isGroup(id) ? groupOf(x) !== g : x !== g));
      next.push(id);
      if (mode === 'primary' && next.length > 2) next = next.slice(-2);
      sel[mode] = next;
      sel[other] = sel[other].filter((x) => x !== id);
    }
    apply();
  };

  openSheet({
    title: 'Muscles travaillés',
    render: (api) => {
      const list = sel[mode];
      return [
        segmented([{ value: 'primary', label: `Principal${sel.primary.length ? ` (${sel.primary.length})` : ''}` }, { value: 'secondary', label: `Secondaires${sel.secondary.length ? ` (${sel.secondary.length})` : ''}` }],
          mode, (v) => { mode = v; api.refresh(); }),
        h('p.small.muted', { style: { margin: '10px 2px 12px' } }, mode === 'primary'
          ? 'Le muscle le plus sollicité (2 au maximum). Touche un groupe ; tu peux ensuite préciser la partie.'
          : 'Les muscles qui aident. Optionnel.'),
        h('div.muscle-groups', null, MUSCLE_TREE.filter((g) => g.id !== 'autre').map((g) => {
          const groupOn = list.includes(g.id);
          const partsOn = (g.parts || []).filter((p) => list.includes(p.id));
          const open = groupOn || partsOn.length > 0;
          const usedElsewhere = (mode === 'primary' ? sel.secondary : sel.primary).some((x) => groupOf(x) === g.id);
          return h(`div.muscle-group${open ? '.open' : ''}`, null,
            h(`button.chip${open ? '.on' : ''}${usedElsewhere && !open ? '.muted' : ''}`, {
              onclick: () => { if (partsOn.length && !groupOn) { sel[mode] = list.filter((x) => groupOf(x) !== g.id); apply(); } else toggle(g.id); api.refresh(); },
            }, g.label),
            open && g.parts ? h('div.muscle-parts', null,
              h('span.tiny.faint', null, 'Préciser :'),
              g.parts.map((p) => h(`button.chip.sm${list.includes(p.id) ? '.on' : ''}`, { onclick: () => { toggle(p.id); api.refresh(); } }, p.label))) : null);
        })),
        h('div.sheet-actions', null, h('button.btn.primary.block.lg', { onclick: () => api.close() }, 'Terminé')),
      ];
    },
  });
}
