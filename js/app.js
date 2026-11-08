/**
 * Point d'entrée : chargement des données, routes, rendu, service worker.
 */
import { loadAll, state, subscribe, setErrorHandler } from './core/store.js';
import { route, startRouter, resolve, currentPath, go } from './core/router.js';
import { mount } from './core/h.js';
import { tabbar } from './ui/components.js';
import { toast, closeAllSheets, dismissToast } from './ui/overlay.js';
import { keepAwake } from './ui/device.js';
import { registerModules } from './modules.js';
import { initSync, onSyncStatus, syncLabel, syncStatus } from './core/sync.js';
import { IS_TEST_ENV } from './core/env.js';

import { renderHome } from './screens/home.js';
import { renderProgram, renderSchedule } from './screens/program.js';
import { renderTemplateEdit } from './screens/template-edit.js';
import { renderLibrary, renderExercise } from './screens/library.js';
import { renderHistory, renderHistoryDetail } from './screens/history.js';
import { renderSession } from './screens/session.js';
import { renderSummary } from './screens/summary.js';
import { renderSettings } from './screens/settings.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderProgress } from './screens/progress.js';
import { renderRuns } from './screens/runs.js';

const app = document.getElementById('app');

route('/', renderHome);
route('/onboarding', renderOnboarding);
route('/program', renderProgram);
route('/program/schedule', renderSchedule);
route('/program/t/:id', renderTemplateEdit);
route('/library', renderLibrary);
route('/exercise/:id', renderExercise);
route('/history', renderHistory);
route('/history/:id', renderHistoryDetail);
route('/session', renderSession);
route('/session/:id', renderSession);
route('/summary/:id', renderSummary);
route('/settings', renderSettings);
route('/progress', renderProgress);
route('/goals', renderProgress); // ancienne adresse de l'onglet Objectifs
route('/runs', renderRuns);

let booted = false;
let lastPath = null;

function render({ navigated = false } = {}) {
  const path = currentPath();
  if (!state.meta.onboarded && path !== '/onboarding') { go('/onboarding', { replace: true }); return; }
  // Reprise automatique d'une séance en cours à l'ouverture de l'app.
  if (!booted) {
    booted = true;
    if (state.meta.activeSessionId && !path.startsWith('/session')) { go('/session', { replace: true }); return; }
  }
  const r = resolve(path);
  if (!r) { go('/', { replace: true }); return; }
  if (navigated && path !== lastPath) { closeAllSheets(); dismissToast(); }
  const y = navigated && path !== lastPath ? 0 : window.scrollY;
  lastPath = path;
  let out;
  try {
    out = r.handler(r.params);
  } catch (e) {
    console.error(e);
    toast('Erreur d’affichage : ' + e.message);
    return;
  }
  if (!out) return;
  mount(app, out.node, out.tab ? tabbar(out.tab) : null);
  document.body.classList.toggle('no-tabs', !out.tab);
  window.scrollTo(0, y);
  keepAwake(!!state.meta.activeSessionId && path === '/session');
}

async function boot() {
  if (IS_TEST_ENV) document.title = 'TEST · ' + document.title;
  setErrorHandler((e) => { console.error(e); toast('Échec de l’enregistrement : ' + (e?.message || e)); });
  try {
    await loadAll();
  } catch (e) {
    app.textContent = 'Impossible d’ouvrir la base de données locale : ' + e.message;
    return;
  }
  // Demande au navigateur de ne pas effacer les données (best effort).
  try { await navigator.storage?.persist?.(); } catch { /* ignoré */ }
  registerModules();
  await initSync();
  // Libellés « Synchronisé il y a… » mis à jour sans redessiner l'écran.
  onSyncStatus(() => {
    for (const el of document.querySelectorAll('[data-sync-label]')) {
      el.textContent = syncLabel() || '';
      el.className = el.className.replace(/\bst-\w+/, `st-${syncStatus.state}`);
    }
  });
  subscribe(() => render());
  startRouter(render);
  registerServiceWorker();
}

const openedAt = Date.now();

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  // Nouvelle version activée : si l'app vient d'être ouverte, on recharge tout
  // de suite pour l'afficher (rien n'est perdu : tout est déjà enregistré).
  // Sinon (en pleine saisie), on prévient seulement.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (Date.now() - openedAt < 20000 && !document.querySelector('input:focus, textarea:focus')) {
      reloading = true;
      location.reload();
    } else {
      toast('Nouvelle version installée : elle s’affichera à la prochaine ouverture.', { duration: 5000 });
    }
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    // Sur téléphone, l'app reste souvent en arrière-plan : on vérifie aussi
    // s'il existe une mise à jour à chaque retour dans l'app.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => { /* hors-ligne indisponible (ex. file://) */ });
}

boot();
