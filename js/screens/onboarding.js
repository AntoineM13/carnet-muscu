/**
 * PREMIER LANCEMENT : programme pré-rempli, partir de zéro, ou importer.
 */
import { h } from '../core/h.js';
import { state } from '../core/store.js';
import { loadSeed, finishOnboarding } from '../core/actions.js';
import { SEED_TEMPLATES } from '../data/seed-program.js';
import { parseImport } from '../domain/backup.js';
import { replaceEverything } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { go } from '../core/router.js';
import { toast } from '../ui/overlay.js';
import { applyProgram } from './settings.js';
import { accountCard } from './account.js';

export function renderOnboarding() {
  if (state.meta.onboarded) { go('/', { replace: true }); return { node: h('div'), tab: null }; }
  const node = h('main.screen.no-tabs.onboarding', null,
    h('div.onb-logo', null, icon('dumbbell', 'lg')),
    h('h1', null, 'Carnet de muscu'),
    h('p.muted', { style: { margin: '8px 0 28px' } }, 'Ton carnet de bord, 100 % hors-ligne. Chaque séance prépare la suivante.'),
    h('button.option.onb-option', { onclick: () => { loadSeed(); go('/', { replace: true }); } },
      h('span.lead.accent', null, icon('program')),
      h('div.grow', null,
        h('div.t', null, 'Programme pré-rempli'),
        h('div.d', null, `${SEED_TEMPLATES.map((t) => t.name).join(', ')}`))),
    h('button.option.onb-option', { onclick: () => { finishOnboarding(); go('/program', { replace: true }); } },
      h('span.lead', null, icon('plus')),
      h('div.grow', null, h('div.t', null, 'Partir de zéro'), h('div.d', null, 'Crée tes séances et exercices toi-même.'))),
    h('label.option.onb-option', null,
      h('span.lead', null, icon('upload')),
      h('div.grow', null, h('div.t', null, 'Importer un fichier'), h('div.d', null, 'Programme partagé par un collègue, ou sauvegarde complète.')),
      h('input.hidden', {
        type: 'file', accept: 'application/json,.json',
        onchange: async (e) => {
          const f = e.target.files[0]; if (!f) return;
          try {
            const p = parseImport(await f.text());
            if (p.kind === 'backup') await replaceEverything({ ...p.json.data, meta: { onboarded: true, activeSessionId: null } });
            else { applyProgram(p.json); finishOnboarding(); }
            toast(p.kind === 'backup' ? 'Sauvegarde restaurée' : 'Programme importé');
            go('/', { replace: true });
          } catch (err) { toast(err.message); }
        },
      })),
    accountCard({ onboarding: true }) && h('div', { style: { marginTop: '20px' } }, accountCard({ onboarding: true })),
    h('p.tiny.faint', { style: { marginTop: '24px' } }, 'Conseil : ajoute l’app à l’écran d’accueil (Partager → Sur l’écran d’accueil) pour l’utiliser en plein écran et hors-ligne.'));
  return { node, tab: null };
}
