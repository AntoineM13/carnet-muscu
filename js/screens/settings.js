/**
 * RÉGLAGES + SAUVEGARDE / RESTAURATION.
 */
import { h } from '../core/h.js';
import { state, saveSettings, replaceEverything, saveSchedule, saveDoc, deleteDoc } from '../core/store.js';
import { fmtNum, daysBetween, todayISO, fmtDateShort, clone } from '../core/util.js';
import { buildFullBackup, buildProgramExport, parseImport, mergeProgram, exportFileName } from '../domain/backup.js';
import { regenerateWeek } from '../domain/planning.js';
import { DEFAULT_SETTINGS, EQUIPMENTS } from '../data/defaults.js';
import { icon } from '../ui/icons.js';
import { topbar, switchRow, stepper } from '../ui/components.js';
import { go, rerender } from '../core/router.js';
import { confirmAction, toast, choose } from '../ui/overlay.js';
import { accountCard } from './account.js';
import { syncStatus, signOut } from '../core/sync.js';

const ALL_PLATES = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];

export function renderSettings({ backup } = {}) {
  const s = state.settings;
  const set = (patch) => saveSettings(patch);
  const lastExport = s.lastExportAt ? daysBetween(s.lastExportAt.slice(0, 10), todayISO()) : null;

  const node = h('main.screen.no-tabs', null,
    topbar('Réglages', { backTo: '/' }),

    accountCard() && group('Compte et synchronisation', '', accountCard()),

    group('Sauvegarde', backup ? 'backup-focus' : '',
      h('div.card.stack', null,
        h('p.small.muted', null, lastExport == null ? 'Aucune sauvegarde exportée.' : `Dernière sauvegarde : ${lastExport === 0 ? "aujourd'hui" : `il y a ${lastExport} jour${lastExport > 1 ? 's' : ''}`}.`,
          ' Les données restent sur ce téléphone : exporte régulièrement (une fois par semaine) et range le fichier dans Fichiers / iCloud Drive.'),
        h('button.btn.primary.block', { onclick: () => exportJSON('backup') }, icon('download', 'sm'), 'Exporter la sauvegarde complète'),
        h('button.btn.ghost.block', { onclick: () => exportJSON('program') }, icon('download', 'sm'), 'Exporter le programme seul'),
        h('label.btn.ghost.block', null, icon('upload', 'sm'), 'Importer un fichier…',
          h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: (e) => importFile(e.target.files[0], e.target) })),
        h('p.tiny.faint', null, 'Le programme seul (séances et exercices) se partage sans toucher à l’historique de la personne qui l’importe.'))),

    group('Saisie', '',
      h('div.list', null,
        switchRow('RPE', s.rpeEnabled, (v) => set({ rpeEnabled: v }), 'Champ optionnel, à titre informatif'),
        switchRow('Balayage entre exercices', s.swipeEnabled, (v) => set({ swipeEnabled: v }), 'Glisser horizontalement pour changer d’exercice'),
        switchRow('Chrono de repos', s.restTimerEnabled, (v) => set({ restTimerEnabled: v }), 'Se lance après chaque série validée. À couper si tu utilises ton propre chrono'),
        s.restTimerEnabled && switchRow('Son en fin de repos', s.soundEnabled, (v) => set({ soundEnabled: v })),
        switchRow('Superset : repos après le tour complet', s.supersetRestAfterRound, (v) => set({ supersetRestAfterRound: v }), 'Sinon après chaque exercice'))),

    group('Nouveaux exercices du programme', '',
      h('div.settings-grid', null,
        stepper({ label: 'Séries', value: s.defaultSets, step: 1, min: 1, size: 'sm', onChange: (v) => set({ defaultSets: v ?? 3 }) }),
        stepper({ label: 'Repos (s)', value: s.defaultRestSec, step: 15, min: 0, size: 'sm', onChange: (v) => set({ defaultRestSec: v ?? 90 }) }),
        stepper({ label: 'Reps min', value: s.defaultRepMin, step: 1, min: 1, size: 'sm', onChange: (v) => set({ defaultRepMin: v ?? 8 }) }),
        stepper({ label: 'Reps max', value: s.defaultRepMax, step: 1, min: 1, size: 'sm', onChange: (v) => set({ defaultRepMax: v ?? 12 }) }))),

    group('Charges de ta salle', '',
      h('p.small.muted', { style: { marginBottom: '10px' } }, 'De combien la charge monte quand l’app propose d’augmenter, selon le matériel. Une fiche exercice peut avoir sa propre valeur (ex. une machine aux paliers particuliers).'),
      h('div.settings-grid', null,
        EQUIPMENTS.filter((q) => q.value !== 'pdc').map((q) => {
          const inc = { ...DEFAULT_SETTINGS.increments, ...(s.increments || {}) };
          return stepper({ label: `${q.label.replace(' (charge par haltère)', '')} (kg)`, value: inc[q.value], step: 0.5, min: 0.5, max: 20, size: 'sm',
            onChange: (v) => set({ increments: { ...inc, [q.value]: v ?? DEFAULT_SETTINGS.increments[q.value] } }) });
        }),
        stepper({ label: 'Lest (kg)', value: { ...DEFAULT_SETTINGS.increments, ...(s.increments || {}) }.pdc, step: 0.5, min: 0.5, max: 20, size: 'sm',
          onChange: (v) => set({ increments: { ...DEFAULT_SETTINGS.increments, ...(s.increments || {}), pdc: v ?? 2.5 } }) }))),

    group('Poids de corps', '',
      h('div.settings-grid', null,
        stepper({ label: 'Poids de corps (kg)', value: s.bodyWeight, step: 0.5, min: 30, max: 250, size: 'sm', placeholder: '—', onChange: (v) => set({ bodyWeight: v }) })),
      h('p.tiny.faint', { style: { marginTop: '8px' } }, 'Sert au suivi des exercices au poids du corps (tractions, dips) : l’onglet Progrès compte poids de corps + lest. Optionnel.')),

    group('Progression et dégressives', '',
      h('div.settings-grid', null,
        stepper({ label: 'Récup : charge −%', value: s.recupPct, step: 5, min: 0, max: 50, size: 'sm', onChange: (v) => set({ recupPct: v ?? 10 }) }),
        stepper({ label: 'Dégressive : −% proposé', value: s.dropPct, step: 5, min: 5, max: 60, size: 'sm', onChange: (v) => set({ dropPct: v ?? 20 }) })),
      h('p.tiny.faint', { style: { marginTop: '8px' } }, 'La charge proposée pour un palier dégressif n’est qu’une suggestion : tu saisis toujours ce que tu veux.')),

    group('Échauffement', '',
      h('div.settings-grid.three', null, s.warmupSteps.map((w, i) => h('div', null,
        stepper({ label: `Palier ${i + 1} (%)`, value: w.pct, step: 5, min: 10, max: 95, size: 'sm', onChange: (v) => { const steps = clone(s.warmupSteps); steps[i].pct = v ?? w.pct; set({ warmupSteps: steps }); } }),
        h('div', { style: { height: '8px' } }),
        stepper({ label: 'Reps', value: w.reps, step: 1, min: 1, max: 20, size: 'sm', onChange: (v) => { const steps = clone(s.warmupSteps); steps[i].reps = v ?? w.reps; set({ warmupSteps: steps }); } }))))),

    group('Barre et disques', '',
      stepper({ label: 'Poids de la barre (kg)', value: s.barWeight, step: 2.5, min: 0, size: 'sm', onChange: (v) => set({ barWeight: v ?? 20 }) }),
      h('div.eyebrow', { style: { margin: '14px 0 8px' } }, 'Disques disponibles'),
      h('div.chips', null, ALL_PLATES.map((p) => h(`button.chip${s.plates.includes(p) ? '.on' : ''}`, {
        onclick: () => set({ plates: s.plates.includes(p) ? s.plates.filter((x) => x !== p) : [...s.plates, p].sort((a, b) => b - a) }),
      }, `${fmtNum(p)} kg`)))),

    group('Course à pied', '',
      h('div.list', null, switchRow('Module course à pied', !!s.runsEnabled, (v) => set({ runsEnabled: v }), 'Sorties sur l’accueil, la semaine et l’historique')),
      s.runsEnabled && h('div', { style: { marginTop: '12px' } },
        stepper({ label: 'Sorties visées par semaine', value: s.runsPerWeek, step: 1, min: 1, max: 7, size: 'sm', onChange: (v) => set({ runsPerWeek: v ?? 2 }) }))),

    group('Données', '',
      h('button.btn.danger.block', {
        onclick: async () => {
          const ok = await confirmAction({ title: 'Tout effacer ?', message: 'Programme, historique, objectifs et réglages seront supprimés de ce téléphone. Exporte une sauvegarde avant.', confirmLabel: 'Tout effacer' });
          if (!ok) return;
          // Déconnexion d'abord : l'effacement local ne doit pas toucher le compte en ligne.
          if (syncStatus.user) await signOut();
          await replaceEverything({ meta: { onboarded: false, activeSessionId: null } });
          go('/onboarding');
        },
      }, icon('trash', 'sm'), 'Effacer toutes les données')),
    h('p.tiny.faint.center', { style: { marginTop: '24px' } }, syncStatus.user ? 'Carnet de muscu · données sur cet appareil et sur ton compte' : 'Carnet de muscu · données stockées uniquement sur cet appareil'));

  if (backup) requestAnimationFrame(() => document.querySelector('.backup-focus')?.scrollIntoView({ block: 'start' }));
  return { node, tab: null };
}

function group(title, cls, ...children) {
  return h(`section.section${cls ? '.' + cls : ''}`, null, h('div.section-head', null, h('h2', null, title)), ...children);
}

/* --------------------------------------------------------- Export -- */
export async function exportJSON(kind) {
  const data = kind === 'program' ? buildProgramExport(state) : buildFullBackup(state);
  const name = exportFileName(kind);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  let shared = false;
  // Sur iPhone, la feuille de partage permet « Enregistrer dans Fichiers ».
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); shared = true; } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!shared) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  if (kind === 'backup') saveSettings({ lastExportAt: new Date().toISOString() });
  toast(kind === 'program' ? 'Programme exporté' : 'Sauvegarde exportée');
  rerender();
}

/* --------------------------------------------------------- Import -- */
async function importFile(file, input) {
  if (!file) return;
  input.value = '';
  let parsed;
  try { parsed = parseImport(await file.text()); } catch (e) { toast(e.message); return; }
  if (parsed.kind === 'backup') {
    const d = parsed.json.data;
    const ok = await confirmAction({
      title: 'Restaurer cette sauvegarde ?',
      message: `Du ${fmtDateShort(parsed.json.exportedAt.slice(0, 10))} : ${d.sessions.length} séances, ${d.templates.length} séances modèles. Les données actuelles de ce téléphone seront REMPLACÉES.`,
      confirmLabel: 'Remplacer mes données',
    });
    if (!ok) return;
    await replaceEverything({ ...d, meta: { onboarded: true, activeSessionId: null } });
    toast('Sauvegarde restaurée');
    go('/');
    return;
  }
  // Programme seul
  const p = parsed.json;
  const v = await choose({
    title: 'Importer ce programme ?',
    subtitle: `${p.templates.length} séances, ${p.exercises.length} exercices. Ton historique, tes objectifs et tes notes sont conservés.`,
    options: [
      { value: 'yes', label: 'Remplacer mon programme', help: 'Séances modèles et planning par défaut', on: true },
      { value: 'no', label: 'Annuler' },
    ],
  });
  if (v !== 'yes') return;
  applyProgram(p);
  toast('Programme importé');
  go('/program');
}

export function applyProgram(p) {
  const merged = mergeProgram(state, p);
  for (const t of [...state.templates]) if (!merged.templates.some((x) => x.id === t.id)) deleteDoc('templates', t.id, { silent: true });
  for (const e of merged.exercises) saveDoc('exercises', e, { silent: true });
  for (const t of merged.templates) saveDoc('templates', t, { silent: true });
  state.schedule.default = merged.defaultSchedule;
  regenerateWeek(state.schedule, todayISO());
  saveSchedule();
}
