/**
 * COMPTE ET SYNCHRONISATION : carte de connexion / état de la synchro.
 * Utilisée dans les réglages et au premier lancement.
 */
import { h } from '../core/h.js';
import { syncStatus, signIn, signOut, syncNow, syncLabel } from '../core/sync.js';
import { SYNC_CONFIG } from '../data/sync-config.js';
import { fmtDateShort } from '../core/util.js';
import { icon } from '../ui/icons.js';
import { rerender, go } from '../core/router.js';
import { toast, confirmAction } from '../ui/overlay.js';

/**
 * @param {object} opts
 * @param {boolean} [opts.onboarding] true au premier lancement
 */
export function accountCard({ onboarding = false } = {}) {
  if (!SYNC_CONFIG.enabled) return null;
  return syncStatus.user ? connectedCard() : loginForm(onboarding);
}

function connectedCard() {
  const s = syncStatus;
  const last = s.lastSync ? new Date(s.lastSync) : null;
  return h('div.card.stack', null,
    h('div.row-flex', null,
      h('span.lead.accent.sync-lead', null, icon('check', 'sm')),
      h('div.grow', null,
        h('div.title.ellipsis', null, s.user.email),
        h('div.small.muted', { 'data-sync-label': '' }, syncLabel() || ''))),
    s.state === 'error' && s.error ? h('p.small', { style: { color: 'var(--warn)' } }, s.error) : null,
    h('p.tiny.faint', null, 'Tes données restent sur ce téléphone et sont copiées sur ton compte. En cas de perte ou de changement de téléphone, reconnecte-toi pour tout récupérer.',
      last ? ` Dernière synchronisation : ${fmtDateShort(last.toISOString().slice(0, 10))} à ${last.toTimeString().slice(0, 5)}.` : ''),
    h('div.row-flex', null,
      h('button.btn.ghost.grow', {
        onclick: async () => { await syncNow(); rerender(); toast(syncStatus.state === 'idle' ? 'Synchronisé' : (syncStatus.error || 'Hors ligne, nouvel essai plus tard')); },
      }, icon('repeat', 'sm'), 'Synchroniser'),
      h('button.btn.quiet', {
        onclick: async () => {
          const ok = await confirmAction({
            title: 'Se déconnecter ?',
            message: 'Les données restent sur ce téléphone, mais elles ne seront plus synchronisées tant que tu ne te reconnectes pas.',
            confirmLabel: 'Se déconnecter', danger: false,
          });
          if (ok) { await signOut(); rerender(); }
        },
      }, 'Se déconnecter')));
}

function loginForm(onboarding) {
  let mode = 'login';
  let busy = false;
  const email = h('input.input', { type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'E-mail', autocapitalize: 'off' });
  const pass = h('input.input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe (6 caractères min.)' });
  const err = h('p.small', { style: { color: 'var(--warn)', minHeight: '0' } });
  const submit = h('button.btn.primary.block', { type: 'submit' }, 'Se connecter');
  const switcher = h('button.link-btn.small', { type: 'button' }, 'Pas encore de compte ? Créer un compte');
  const setMode = (m) => {
    mode = m;
    submit.textContent = m === 'login' ? 'Se connecter' : 'Créer mon compte';
    switcher.textContent = m === 'login' ? 'Pas encore de compte ? Créer un compte' : 'J’ai déjà un compte : me connecter';
    pass.setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
  };
  switcher.addEventListener('click', () => setMode(mode === 'login' ? 'create' : 'login'));

  const form = h('form.card.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (busy) return;
      err.textContent = '';
      const em = email.value.trim(); const pw = pass.value;
      if (!em || !pw) { err.textContent = 'Indique ton e-mail et ton mot de passe.'; return; }
      busy = true; submit.disabled = true; submit.textContent = 'Connexion…';
      try {
        const res = await signIn(em, pw, { create: mode === 'create' });
        toast(res.hadRemoteData ? 'Connecté : tes données ont été récupérées' : 'Connecté : tes données sont sauvegardées en ligne');
        if (onboarding && res.hadRemoteData) go('/', { replace: true }); else rerender();
      } catch (ex) {
        err.textContent = ex.message;
        busy = false; submit.disabled = false; setMode(mode);
      }
    },
  },
  h('div.row-flex', null, h('span.lead', null, icon('repeat', 'sm')),
    h('div.grow', null,
      h('div.title', null, onboarding ? 'J’ai déjà un compte' : 'Sauvegarde en ligne'),
      h('div.small.muted', null, onboarding
        ? 'Récupère ton programme et ton historique.'
        : 'Optionnel. Sauvegarde automatique et accès depuis plusieurs appareils.'))),
  email, pass, err, submit, switcher);
  return form;
}
