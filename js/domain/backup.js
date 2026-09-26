/**
 * Exports / imports JSON.
 *
 *  a) Sauvegarde complète  (format 'carnet-muscu/backup')  : tout.
 *  b) Programme seul       (format 'carnet-muscu/program') : bibliothèque,
 *     séances modèles et planning par défaut — pour partager la structure
 *     avec un collègue SANS toucher à son historique.
 *
 * Chaque fichier porte `format` et `version` pour permettre des migrations.
 */
import { clone } from '../core/util.js';
import { normalizeExercise } from './program.js';

export const BACKUP_FORMAT = 'carnet-muscu/backup';
export const PROGRAM_FORMAT = 'carnet-muscu/program';
export const FILE_VERSION = 1;

export function buildFullBackup(state) {
  return {
    format: BACKUP_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(),
    data: {
      settings: clone(state.settings),
      meta: { onboarded: true },
      schedule: clone(state.schedule),
      exercises: clone(state.exercises),
      templates: clone(state.templates),
      sessions: clone(state.sessions.filter((s) => s.status === 'done')),
      goals: clone(state.goals),
      runs: clone(state.runs),
    },
  };
}

export function buildProgramExport(state) {
  return {
    format: PROGRAM_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(),
    // Notes personnelles et marqueurs « douleur » ne sont pas partagés.
    exercises: state.exercises.filter((e) => !e.archived).map((e) => {
      const { notes, pain, ...rest } = e;
      return clone(rest);
    }),
    templates: clone(state.templates),
    defaultSchedule: clone(state.schedule.default),
  };
}

/** Identifie et valide un fichier importé. */
export function parseImport(text) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error("Ce fichier n'est pas un JSON valide."); }
  if (json?.format === BACKUP_FORMAT) {
    if (!json.data || !Array.isArray(json.data.sessions)) throw new Error('Sauvegarde incomplète.');
    return { kind: 'backup', json };
  }
  if (json?.format === PROGRAM_FORMAT) {
    if (!Array.isArray(json.templates) || !Array.isArray(json.exercises)) throw new Error('Programme incomplet.');
    return { kind: 'program', json };
  }
  throw new Error("Format non reconnu (ni sauvegarde, ni programme Carnet de muscu).");
}

/**
 * Fusionne un programme importé dans les données locales.
 * - Exercices : fusion par id. Les notes et marqueurs « douleur » locaux sont conservés.
 * - Séances modèles et planning par défaut : remplacés.
 * - Historique, objectifs, réglages : intacts.
 * @returns { exercises, templates, defaultSchedule } à enregistrer
 */
export function mergeProgram(local, program) {
  const byId = new Map(local.exercises.map((e) => [e.id, e]));
  const exercises = [];
  for (const imp of program.exercises) {
    const cur = byId.get(imp.id);
    if (cur) {
      exercises.push({ ...cur, ...imp, notes: cur.notes, pain: cur.pain, archived: false });
      byId.delete(imp.id);
    } else {
      exercises.push(normalizeExercise(imp));
    }
  }
  // Exercices locaux absents de l'import : conservés (ils portent peut-être de l'historique).
  for (const rest of byId.values()) exercises.push(rest);
  const templates = program.templates.map((t, i) => ({ ...clone(t), order: i }));
  return { exercises, templates, defaultSchedule: clone(program.defaultSchedule || {}) };
}

/** Nom de fichier horodaté. */
export function exportFileName(kind) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return kind === 'program' ? `carnet-muscu-programme-${stamp}.json` : `carnet-muscu-sauvegarde-${stamp}.json`;
}
