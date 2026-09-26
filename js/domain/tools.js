/**
 * Outils de salle : séries d'échauffement et calculateur de disques.
 * Fonctions pures, sans état.
 */
import { roundTo } from '../core/util.js';

/**
 * Séries d'approche calculées depuis la charge de travail prévue.
 * @param {number} workLoad charge de travail
 * @param {{pct:number, reps:number}[]} steps paliers (ex. 50 %, 70 %, 85 %)
 * @param {object} opts { step: arrondi, minLoad: ex. poids de la barre }
 */
export function warmupSets(workLoad, steps, { step = 2.5, minLoad = 0 } = {}) {
  if (!workLoad || workLoad <= 0) return [];
  const out = [];
  for (const s of steps) {
    const load = Math.max(minLoad, roundTo(workLoad * s.pct / 100, step));
    if (load >= workLoad) continue;
    if (out.length && out[out.length - 1].load === load) continue;
    out.push({ load, reps: s.reps, pct: s.pct });
  }
  return out;
}

/**
 * Répartition des disques PAR CÔTÉ (algorithme glouton, disques en nombre
 * illimité). Retourne { perSide: [25, 10, 2.5], remainder } ;
 * remainder > 0 si la charge n'est pas atteignable exactement.
 */
export function plateBreakdown(total, barWeight = 20, plates = [25, 20, 15, 10, 5, 2.5, 1.25]) {
  if (total == null || total < barWeight) return { perSide: [], remainder: total == null ? 0 : total - barWeight, belowBar: true };
  let side = (total - barWeight) / 2;
  const perSide = [];
  const sorted = [...plates].sort((a, b) => b - a);
  for (const p of sorted) {
    while (side + 1e-9 >= p) { perSide.push(p); side -= p; }
  }
  return { perSide, remainder: Math.round(side * 2 * 100) / 100, belowBar: false };
}

/** Charge proposée pour un palier de dégressive (simple proposition). */
export function proposeDropLoad(prevLoad, dropPct = 20, step = 2.5) {
  if (prevLoad == null) return null;
  const v = roundTo(prevLoad * (1 - dropPct / 100), step || 1);
  return v >= prevLoad ? Math.max(0, prevLoad - (step || 1)) : v;
}
