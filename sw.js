/**
 * Service worker : l'application fonctionne 100 % hors-ligne.
 *
 * Stratégie « cache d'abord » : tous les fichiers de l'app sont mis en cache
 * à l'installation. Pour publier une mise à jour, INCRÉMENTER `VERSION`
 * (sinon les téléphones garderont l'ancienne version en cache).
 * `node tools/check-sw.mjs` vérifie que la liste ASSETS est complète.
 */
const VERSION = 'v1.16.0-sync';
// Version de test (même domaine que la production) : préfixe de cache distinct,
// pour que ni l'une ni l'autre n'efface le cache de l'autre à l'activation.
const IS_TEST = /\/carnet-muscu-test(\/|$)/.test(self.location.pathname);
const PREFIX = IS_TEST ? 'cm-test-' : 'carnet-muscu-';
const CACHE = `${PREFIX}${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/screens.css',
  './assets/fonts/BricolageGrotesque-wght.woff2',
  './assets/fonts/DMSans-wght.woff2',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './js/app.js',
  './js/modules.js',
  './js/core/actions.js',
  './js/core/db.js',
  './js/core/env.js',
  './js/core/bank-store.js',
  './js/data/exercise-bank.js',
  './js/domain/bank.js',
  './js/ui/exercise-browser.js',
  './js/data/muscles.js',
  './js/domain/muscles.js',
  './js/ui/muscle-picker.js',
  './js/domain/dashboard.js',
  './js/domain/demo.js',
  './js/domain/identity.js',
  './js/screens/progress.js',
  './js/core/h.js',
  './js/core/router.js',
  './js/core/store.js',
  './js/core/supabase.js',
  './js/core/sync-engine.js',
  './js/core/sync.js',
  './js/core/util.js',
  './js/data/defaults.js',
  './js/data/run-plans.js',
  './js/data/seed-program.js',
  './js/data/sync-config.js',
  './js/domain/backup.js',
  './js/domain/goals.js',
  './js/domain/planning.js',
  './js/domain/program.js',
  './js/domain/runs.js',
  './js/domain/progression.js',
  './js/domain/session.js',
  './js/domain/stats.js',
  './js/domain/tools.js',
  './js/ui/components.js',
  './js/ui/device.js',
  './js/ui/icons.js',
  './js/ui/overlay.js',
  './js/ui/pickers.js',
  './js/ui/planning-ui.js',
  './js/screens/account.js',
  './js/screens/exercise-progress.js',
  './js/screens/goals.js',
  './js/screens/history-extras.js',
  './js/screens/history.js',
  './js/screens/home-extras.js',
  './js/screens/home.js',
  './js/screens/library.js',
  './js/screens/onboarding.js',
  './js/screens/program.js',
  './js/screens/runs.js',
  './js/screens/session-extras.js',
  './js/screens/session.js',
  './js/screens/settings.js',
  './js/screens/summary.js',
  './js/screens/template-edit.js',
];

self.addEventListener('install', (event) => {
  // `cache: 'reload'` : toujours télécharger depuis le serveur. Sans cela, le
  // navigateur peut resservir des fichiers de SA mémoire HTTP (GitHub Pages :
  // 10 min), et la nouvelle version serait installée avec les anciens fichiers.
  event.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Navigation : toujours servir l'app (routes en #hash, mais par sécurité).
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
