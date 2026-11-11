/**
 * COMPTE ET SYNCHRONISATION : carte de connexion / état de la synchro.
 * Utilisée dans les réglages et au premier lancement.
 */
import { h } from '../core/h.js';
import { syncStatus, signIn, signOut, syncNow, syncLabel, changePassword } from '../core/sync.js';
import { loginToEmail, displayLogin } from '../domain/identity.js';
import { SYNC_CONFIG } from '../data/sync-config.js';
import { fmtDateShort } from '../core/util.js';
import { icon } from '../ui/icons.js';
import { rerender, go } from '../core/router.js';
import { toast, confirmAction, openSheet } from '../ui/overlay.js';

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
        h('div.title.ellipsis', null, displayLogin(s.user.email)),
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
      }, 'Se déconnecter')),
    h('button.link-btn.small', { onclick: openPasswordSheet }, icon('settings', 'sm'), 'Changer mon mot de passe'));
}

/** Nouveau mot de passe (ex. après un mot de passe provisoire donné par Antoine). */
function openPasswordSheet() {
  openSheet({
    title: 'Changer mon mot de passe',
    render: (api) => {
      const p1 = h('input.input', { type: 'password', autocomplete: 'new-password', placeholder: 'Nouveau mot de passe (6 caractères min.)' });
      const p2 = h('input.input', { type: 'password', autocomplete: 'new-password', placeholder: 'Le retaper' });
      const err = h('p.small', { style: { color: 'var(--warn)' } });
      const btn = h('button.btn.primary.block', { type: 'submit' }, 'Enregistrer');
      return h('form.stack', {
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          if (p1.value.length < 6) { err.textContent = 'Au moins 6 caractères.'; return; }
          if (p1.value !== p2.value) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
          btn.disabled = true; btn.textContent = 'Enregistrement…';
          try {
            await changePassword(p1.value);
            api.close();
            toast('Mot de passe changé');
          } catch (ex) {
            err.textContent = ex.message;
            btn.disabled = false; btn.textContent = 'Enregistrer';
          }
        },
      },
      h('p.sheet-sub', null, 'Choisis un mot de passe propre à cette app (pas celui de ta boîte mail).'),
      p1, p2, err, btn);
    },
  });
}

function loginForm(onboarding) {
  let mode = 'login';
  let busy = false;
  const email = h('input.input', { type: 'text', autocomplete: 'username', placeholder: 'Pseudo (ex. antoine)', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
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
      const em = loginToEmail(email.value); const pw = pass.value;
      if (!email.value.trim() || !pw) { err.textContent = 'Indique ton pseudo et ton mot de passe.'; return; }
      if (!em) { err.textContent = 'Pseudo invalide : 2 à 30 lettres ou chiffres (point et tiret acceptés).'; return; }
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
