/**
 * OBJECTIFS : calcul de l'avancement (rien n'est stocké hormis la cible).
 *
 * Deux types :
 *  - 'charge_reps' : ex. 30 kg × 8 (atteint si une série de travail fait
 *                    au moins 8 reps à 30 kg ou plus — premier palier seulement)
 *  - 'e1rm'        : 1RM estimé cible (formule d'Epley)
 */
import { uid, daysBetween, todayISO } from '../core/util.js';
import { exerciseHistory, mainStage, e1rm } from './stats.js';

export function newGoal(exerciseId) {
  return { id: uid('goal'), exerciseId, kind: 'charge_reps', load: null, reps: 8, target1RM: null, deadline: null, createdAt: new Date().toISOString(), achievedAt: null };
}

/**
 * @returns {{ pct:number, achieved:boolean, current:string, remaining:string, currentValue:number|null, targetValue:number|null, daysLeft:number|null, achievedDate:string|null }}
 */
export function goalProgress(goal, sessions, fmt = (n) => String(n)) {
  const hist = exerciseHistory(goal.exerciseId, sessions);
  const sets = hist.flatMap((x) => x.stats.workSets.map((s) => ({ ...mainStage(s), date: x.date })));
  const daysLeft = goal.deadline ? daysBetween(todayISO(), goal.deadline) : null;
  const best1RM = Math.max(0, ...sets.map((s) => e1rm(s.load, s.reps) || 0));

  if (goal.kind === 'e1rm') {
    const target = goal.target1RM || 0;
    const hit = sets.find((s) => (e1rm(s.load, s.reps) || 0) >= target);
    return {
      pct: target ? Math.min(100, (best1RM / target) * 100) : 0,
      achieved: !!hit && target > 0,
      achievedDate: hit?.date || null,
      currentValue: best1RM || null,
      targetValue: target,
      current: best1RM ? `${fmt(best1RM, 1)} kg` : '—',
      remaining: hit ? 'Atteint' : best1RM ? `Il manque ${fmt(target - best1RM, 1)} kg` : 'Pas encore de données',
      daysLeft,
    };
  }

  const L = goal.load ?? 0; const R = goal.reps ?? 1;
  const hit = sets.find((s) => (s.load ?? -Infinity) >= L && (s.reps || 0) >= R);
  const atReps = sets.filter((s) => (s.reps || 0) >= R).map((s) => s.load ?? 0);
  const bestLoadAtReps = atReps.length ? Math.max(...atReps) : null;
  const atLoad = sets.filter((s) => (s.load ?? -Infinity) >= L).map((s) => s.reps || 0);
  const bestRepsAtLoad = atLoad.length ? Math.max(...atLoad) : null;
  const targetE = e1rm(L, R) || 1;
  let remaining = 'Pas encore de données';
  if (hit) remaining = 'Atteint';
  else if (bestRepsAtLoad != null) remaining = `Il manque ${R - bestRepsAtLoad} rep${R - bestRepsAtLoad > 1 ? 's' : ''} à ${fmt(L)} kg`;
  else if (bestLoadAtReps != null) remaining = `Il manque ${fmt(L - bestLoadAtReps)} kg à ${R} reps`;
  // Meilleure série « représentative » : celle au meilleur 1RM estimé.
  const bestSet = sets.reduce((b, s) => ((e1rm(s.load, s.reps) || 0) > (e1rm(b?.load, b?.reps) || 0) ? s : b), null);
  return {
    pct: hit ? 100 : Math.min(99, (best1RM / targetE) * 100),
    achieved: !!hit,
    achievedDate: hit?.date || null,
    currentValue: best1RM || null,
    targetValue: targetE,
    current: bestSet ? `${fmt(bestSet.load)} kg × ${bestSet.reps}` : '—',
    remaining,
    daysLeft,
  };
}

export function goalLabel(goal, fmt = (n) => String(n)) {
  return goal.kind === 'e1rm' ? `1RM estimé ${fmt(goal.target1RM ?? 0)} kg` : `${fmt(goal.load ?? 0)} kg × ${goal.reps}`;
}
