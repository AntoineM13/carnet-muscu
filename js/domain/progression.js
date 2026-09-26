/**
 * MODULE DE PROGRESSION
 * =====================
 * Toute la logique « que faire aujourd'hui » est isolée ici, pour pouvoir
 * être ajustée facilement (ex. intégrer le RPE plus tard).
 *
 * Méthode :
 *  - « Augmenter »       : toutes les séries de travail de la dernière fois ont
 *                          atteint le HAUT de la plage (ex. 12 pour 8-12)
 *                          -> charge + incrément, reps au bas de la plage.
 *  - « Stabiliser »      : sinon, même charge, objectif : battre les reps (+1 par série).
 *  - « Récup / volume »  : charge réduite (−10 % par défaut), reps au haut de la
 *                          plage et une série de plus. Activé par la forme « KO ».
 *
 * Règles :
 *  - Seules les séries de travail validées comptent (échauffements exclus).
 *  - Pour une dégressive, seul le PREMIER palier compte (les paliers réduits sont ignorés).
 *  - La suggestion est indicative : l'utilisateur saisit ce qu'il veut.
 *  - Le RPE n'influence rien (information seulement).
 *  - Le planning n'intervient pas : seule compte l'historique de l'exercice.
 */
import { exerciseHistory, isWorkSet, mainStage } from './stats.js';
import { roundTo, fmtNum } from '../core/util.js';

export const MODES = {
  augmenter: { label: 'Augmenter', short: '+' },
  stabiliser: { label: 'Stabiliser', short: '=' },
  recup: { label: 'Récup / volume', short: '−' },
};

/**
 * Dernière performance d'un exercice (séance terminée la plus récente).
 * @returns {{date:string, sessionId:string, sets:object[]}|null}
 */
export function lastPerformance(exerciseId, sessions, { excludeSessionId = null } = {}) {
  const hist = exerciseHistory(exerciseId, sessions, { excludeSessionId });
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  const sets = last.session.items
    .filter((it) => it.exerciseId === exerciseId)
    .flatMap((it) => it.sets)
    .filter(isWorkSet);
  return { date: last.date, sessionId: last.session.id, sets };
}

/** Le mode que l'app choisirait seule. */
export function autoMode(last, target, form = 'normal') {
  if (form === 'ko') return 'recup';
  if (!last) return null;
  return reachedTop(last.sets, target) ? 'augmenter' : 'stabiliser';
}

/** Toutes les séries de travail ont-elles atteint le haut de la plage ? */
export function reachedTop(sets, target) {
  if (!sets.length || sets.length < target.sets) return false;
  return sets.every((s) => (mainStage(s).reps || 0) >= target.repMax);
}

/**
 * Suggestion du jour pour un exercice.
 * @param {object} p
 * @param {string} p.exerciseId
 * @param {object} p.target  { sets, repMin, repMax, increment }
 * @param {string} [p.mode]  mode imposé ('augmenter' | 'stabiliser' | 'recup'), sinon auto
 * @param {string} [p.form]  'frais' | 'normal' | 'ko'
 * @param {object} p.settings réglages (recupPct)
 * @param {object[]} p.sessions historique
 * @param {object} [p.exercise] fiche exercice (loadMode)
 * @returns {{ mode, auto, sets:{load,reps}[], headline, reason, last } | null}
 */
export function suggest({ exerciseId, target, mode = null, form = 'normal', settings, sessions, exercise = null, excludeSessionId = null }) {
  const last = lastPerformance(exerciseId, sessions, { excludeSessionId });
  const auto = autoMode(last, target, form);
  const m = mode || auto;
  if (!last || !m) return null;

  const inc = target.increment || 2.5;
  const mains = last.sets.map(mainStage);
  const top = Math.max(...mains.map((s) => s.load ?? 0));
  const lest = exercise?.loadMode === 'lest';
  let sets = [];
  let headline = '';
  let reason = '';

  if (m === 'augmenter') {
    const load = top + inc;
    sets = Array.from({ length: target.sets }, () => ({ load, reps: target.repMin }));
    headline = `${fmtNum(load)} kg × ${target.repMin}+`;
    reason = reachedTop(last.sets, target)
      ? `Toutes les séries à ${target.repMax} reps la dernière fois : on monte de ${fmtNum(inc)} kg.`
      : `Augmentation choisie manuellement (+${fmtNum(inc)} kg).`;
  } else if (m === 'stabiliser') {
    sets = Array.from({ length: target.sets }, (_, i) => {
      const prev = mains[Math.min(i, mains.length - 1)];
      return { load: prev.load ?? top, reps: Math.min((prev.reps || target.repMin) + 1, target.repMax) };
    });
    headline = `${fmtNum(sets[0].load)} kg · viser ${sets.map((s) => s.reps).join('/')}`;
    reason = `Même charge, objectif : battre ${mains.map((s) => s.reps).join('/')} reps.`;
  } else {
    const pct = settings?.recupPct ?? 10;
    const load = lest ? top - inc : Math.max(0, roundTo(top * (1 - pct / 100), inc));
    sets = Array.from({ length: target.sets + 1 }, () => ({ load, reps: target.repMax }));
    headline = `${fmtNum(load)} kg × ${target.repMax} · ${target.sets + 1} séries`;
    reason = form === 'ko' && !mode
      ? `Forme « KO » : charge réduite${lest ? '' : ` de ${pct} %`}, plus de volume.`
      : `Charge réduite${lest ? '' : ` de ${pct} %`}, plus de reps et une série de plus.`;
  }
  return { mode: m, auto, sets, headline, reason, last };
}

/**
 * Valeurs de préremplissage pour un exercice : la suggestion du jour,
 * à défaut la dernière performance, à défaut vide.
 */
export function prefillSets(exerciseId, count, sessions, opts = {}) {
  const { exercise = null, target = null, form = 'normal', mode = null, settings = null, excludeSessionId = null } = opts;
  if (target) {
    const sug = suggest({ exerciseId, target, mode, form, settings, sessions, exercise, excludeSessionId });
    if (sug) return sug.sets;
  }
  const last = lastPerformance(exerciseId, sessions, { excludeSessionId });
  const out = [];
  for (let i = 0; i < count; i++) {
    const src = last?.sets[Math.min(i, last.sets.length - 1)];
    if (src) {
      const { load, reps } = mainStage(src);
      out.push({ load, reps });
    } else {
      out.push({ load: exercise?.loadMode === 'lest' ? 0 : null, reps: null });
    }
  }
  return out;
}
