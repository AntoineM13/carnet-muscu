/**
 * Routeur par hash (#/chemin/param). Chaque route pointe vers une fonction
 * `render(params)` qui retourne { node, tab } (tab = onglet actif, ou null
 * pour masquer la barre d'onglets).
 */
const routes = [];
let renderFn = null;

/** Déclare une route : pattern '/program/template/:id'. */
export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, handler });
}

export function currentPath() {
  return decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
}

export function resolve(path = currentPath()) {
  const [p, qs] = path.split('?');
  for (const r of routes) {
    const m = r.re.exec(p);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      for (const [k, v] of new URLSearchParams(qs || '')) params[k] = v;
      return { handler: r.handler, params };
    }
  }
  return null;
}

export function go(path, { replace = false } = {}) {
  const hash = '#' + path;
  if (location.hash === hash) { renderFn?.(); return; }
  if (replace) { history.replaceState(null, '', hash); renderFn?.(); } else location.hash = hash;
}

export function back() {
  if (history.length > 1) history.back(); else go('/');
}

export function startRouter(render) {
  renderFn = render;
  window.addEventListener('hashchange', () => render({ navigated: true }));
  render({ navigated: true });
}

/** Redessine l'écran courant sans changer de route (conserve le défilement). */
export function rerender() {
  renderFn?.({ navigated: false });
}
