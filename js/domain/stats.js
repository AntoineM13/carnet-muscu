/**
 * Statistiques dérivées : volume, 1RM estimé, records, historique par exercice.
 *
 * RIEN n'est stocké : tout est recalculé à partir des séances. Corriger une
 * série (même après coup) met donc automatiquement à jour stats et records.
 *
 * Conventions :
 *  - Seules les séries VALIDÉES de type normale / dégressive / échec comptent
 *    (les échauffements sont exclus).
 *  - Volume = somme charge × reps de TOUS les paliers (dégressives incluses).
 *  - Records et progression = PREMIER palier (série principale) uniquement.
 *  - Charge saisie telle quelle (par haltère ; lest pour le poids du corps).
 */
import { SET_TYPES } from '../data/defaults.js';

/** Série prise en compte dans les stats. */
export function isWorkSet(set) {
  return !!set && set.done && SET_TYPES[set.type]?.counts !== false && set.type !== 'echauffement';
}

/** Premier palier (série principale). */
export const mainStage = (set) => set.stages?.[0] || { load: null, reps: null };

export function setVolume(set) {
  if (!isWorkSet(set)) return 0;
  return set.stages.reduce((acc, st) => acc + (Number(st.load) || 0) * (Number(st.reps) || 0), 0);
}

/** 1RM estimé (formule d'Epley). */
export function e1rm(load, reps) {
  if (load == null || !reps || reps <= 0) return null;
  if (reps === 1) return load;
  return load * (1 + reps / 30);
}

/** Ordre chronologique d'une séance. */
export const sessionKey = (s) => `${s.date}T${s.startedAt || ''}`;

/** Statistiques d'un exercice dans UNE séance (tous ses items confondus). */
export function exerciseStatsInSession(session, exerciseId) {
  const sets = session.items.filter((it) => it.exerciseId === exerciseId).flatMap((it) => it.sets);
  const work = sets.filter(isWorkSet);
  let topLoad = null; let topReps = null; let bestE1RM = null; let volume = 0;
  for (const s of work) {
    const { load, reps } = mainStage(s);
    volume += setVolume(s);
    if (reps > 0 && load != null && (topLoad === null || load > topLoad || (load === topLoad && reps > topReps))) {
      topLoad = load; topReps = reps;
    }
    const e = e1rm(load, reps);
    if (e != null && (bestE1RM === null || e > bestE1RM)) bestE1RM = e;
  }
  return { workSets: work, topLoad, topReps, bestE1RM, volume };
}

/**
 * Historique chronologique (ancien -> récent) d'un exercice :
 * [{ session, date, stats }] pour chaque séance TERMINÉE où il a été fait.
 */
export function exerciseHistory(exerciseId, sessions, { excludeSessionId = null } = {}) {
  return sessions
    .filter((s) => s.status === 'done' && s.id !== excludeSessionId && s.items.some((it) => it.exerciseId === exerciseId))
    .sort((a, b) => sessionKey(a).localeCompare(sessionKey(b)))
    .map((s) => ({ session: s, date: s.date, stats: exerciseStatsInSession(s, exerciseId) }))
    .filter((h) => h.stats.workSets.length > 0);
}

/** Records personnels d'un exercice, éventuellement limités aux séances avant `beforeKey`. */
export function personalRecords(exerciseId, sessions, { beforeKey = null, excludeSessionId = null } = {}) {
  const rec = { maxLoad: null, bestE1RM: null, bestVolume: null };
  for (const h of exerciseHistory(exerciseId, sessions, { excludeSessionId })) {
    if (beforeKey && sessionKey(h.session) >= beforeKey) continue;
    const { topLoad, topReps, bestE1RM, volume } = h.stats;
    if (topLoad != null && (!rec.maxLoad || topLoad > rec.maxLoad.value || (topLoad === rec.maxLoad.value && topReps > rec.maxLoad.reps))) {
      rec.maxLoad = { value: topLoad, reps: topReps, date: h.date };
    }
    if (bestE1RM != null && (!rec.bestE1RM || bestE1RM > rec.bestE1RM.value)) rec.bestE1RM = { value: bestE1RM, date: h.date };
    if (volume > 0 && (!rec.bestVolume || volume > rec.bestVolume.value)) rec.bestVolume = { value: volume, date: h.date };
  }
  return rec;
}

/** Résumé d'une séance : durée, volume, séries, records battus. */
export function sessionSummary(session, allSessions, exerciseName = (id) => id) {
  let volume = 0; let sets = 0;
  for (const it of session.items) for (const s of it.sets) {
    if (isWorkSet(s)) { volume += setVolume(s); sets += 1; }
  }
  const start = session.startedAt ? new Date(session.startedAt) : null;
  const end = session.endedAt ? new Date(session.endedAt) : new Date();
  const durationSec = start ? Math.max(0, (end - start) / 1000) : 0;

  const records = [];
  const key = sessionKey(session);
  const seen = new Set();
  for (const it of session.items) {
    if (seen.has(it.exerciseId)) continue;
    seen.add(it.exerciseId);
    const cur = exerciseStatsInSession(session, it.exerciseId);
    if (!cur.workSets.length) continue;
    const prev = personalRecords(it.exerciseId, allSessions, { beforeKey: key, excludeSessionId: session.id });
    const hadHistory = prev.maxLoad || prev.bestVolume;
    if (!hadHistory) continue; // premier passage : pas de « record battu »
    const name = exerciseName(it.exerciseId);
    if (cur.topLoad != null && prev.maxLoad && (cur.topLoad > prev.maxLoad.value)) records.push({ exerciseId: it.exerciseId, name, kind: 'Charge max', value: cur.topLoad, unit: 'kg', reps: cur.topReps });
    else if (cur.bestE1RM != null && prev.bestE1RM && cur.bestE1RM > prev.bestE1RM.value + 0.01) records.push({ exerciseId: it.exerciseId, name, kind: '1RM estimé', value: cur.bestE1RM, unit: 'kg' });
    if (prev.bestVolume && cur.volume > prev.bestVolume.value) records.push({ exerciseId: it.exerciseId, name, kind: 'Volume', value: cur.volume, unit: 'kg' });
  }
  return { volume, sets, durationSec, records };
}

/** Texte compact d'une liste de séries : '26×12 · 26×11 · 26×10 (+20×6)'. */
export function formatSets(sets, fmt = (n) => String(n)) {
  return sets.filter((s) => s.done && s.type !== 'echauffement').map((s) => {
    const [first, ...drops] = s.stages;
    let txt = `${fmt(first.load ?? 0)}×${first.reps ?? 0}`;
    if (drops.length) txt += ` (${drops.map((d) => `${fmt(d.load ?? 0)}×${d.reps ?? 0}`).join(' → ')})`;
    return txt;
  }).join(' · ');
}
