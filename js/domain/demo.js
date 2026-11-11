/**
 * JEU DE TEST (version de test uniquement) : fabrique quelques semaines de
 * séances fictives à partir des séances modèles actuelles, pour voir
 * l'historique, l'onglet Progrès et les suggestions sans s'entraîner.
 *
 * Les séances fictives ont un id qui commence par DEMO_PREFIX : on peut les
 * retirer sans toucher aux vraies séances. Fonction pure (testée sous Node).
 */
import { addDays } from '../core/util.js';
import { targetFrom } from './session.js';

export const DEMO_PREFIX = 'demo-';
export const isDemoSession = (s) => typeof s?.id === 'string' && s.id.startsWith(DEMO_PREFIX);

/** Charge de départ plausible selon le matériel (kg). */
const BASE = { barre: 50, halteres: 16, machine: 40, poulie: 17.5, pdc: 0, autre: 15 };

/** Petit hachage stable (même exercice → mêmes chiffres). */
function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

const roundTo = (v, step) => Math.round(v / step) * step;

/**
 * @param templates  séances modèles
 * @param getExercise id → exercice
 * @param settings   réglages (incréments, valeurs par défaut)
 * @param today      'AAAA-MM-JJ' : toutes les séances sont AVANT ce jour
 * @param weeks      nombre de semaines simulées
 * @returns séances terminées (status 'done'), de la plus ancienne à la plus récente
 */
export function buildDemoSessions({ templates, getExercise, settings, today, weeks = 4 }) {
  const n = templates.length;
  const progress = new Map(); // `${templateId}|${exerciseId}` → { load, top }
  const out = [];
  for (let w = 0; w < weeks; w++) {
    templates.forEach((tpl, ti) => {
      const date = addDays(today, -7 * (weeks - 1 - w) - (n - ti));
      const sid = `${DEMO_PREFIX}${tpl.id}-${w}`;
      const start = new Date(`${date}T18:00:00`);
      let clock = start.getTime();
      const items = [];
      for (const [bi, block] of (tpl.blocks || []).entries()) {
        const groupId = block.kind === 'superset' && block.slots.length > 1 ? `${sid}-g${bi}` : null;
        for (const slot of block.slots) {
          const ex = getExercise(slot.exerciseId);
          if (!ex) continue;
          const target = targetFrom(slot, settings, ex);
          const key = `${tpl.id}|${ex.id}`;
          const h = hash(key);
          if (!progress.has(key)) {
            const lest = ex.loadMode === 'lest';
            const base = (BASE[ex.equipment] ?? 15) * (0.8 + (h % 5) / 10);
            progress.set(key, { load: lest ? 0 : Math.max(target.increment, roundTo(base, target.increment)), top: target.repMin + (h % 5) });
          }
          const p = progress.get(key);
          const sets = [];
          for (let k = 0; k < target.sets; k++) {
            clock += (target.restSec + 40) * 1000;
            const reps = Math.max(target.repMin - 1, Math.min(target.repMax, p.top - (k >= 2 ? 1 : 0)));
            sets.push({
              id: `${sid}-${ex.id}-${k}`, type: 'normale', done: true, doneAt: new Date(clock).toISOString(),
              restTakenSec: k ? target.restSec + ((h + k) % 4) * 10 : null, rpe: null, note: '',
              stages: [{ load: p.load, reps }],
            });
          }
          items.push({
            id: `${sid}-${ex.id}`, exerciseId: ex.id, slotId: slot.id, alternatives: [slot.exerciseId, ...(slot.alternatives || [])],
            groupId, skipped: false, mode: null, target, sets, plannedSets: target.sets,
          });
          // Double progression : toutes les séries en haut de plage → on monte.
          if (sets.every((s) => s.stages[0].reps >= target.repMax)) { p.load += target.increment; p.top = target.repMin + 1; } else p.top += 1;
        }
      }
      out.push({
        id: sid, date, startedAt: start.toISOString(), endedAt: new Date(clock + 60000).toISOString(),
        status: 'done', templateId: tpl.id, templateName: tpl.name, plannedItemId: null, form: 'normal',
        currentStep: 0, editedAfterFinish: false,
        note: { sommeil: null, fatigue: null, douleur: null, humeur: null, texte: 'Séance fictive (jeu de test)' },
        rest: null, items,
      });
    });
  }
  return out;
}
