/**
 * Feuilles (bottom sheets), confirmations et toasts avec « Annuler ».
 */
import { h } from '../core/h.js';
import { icon } from './icons.js';

const stack = [];

/**
 * Ouvre une feuille. `render(api)` retourne le contenu ; `api.refresh()` le
 * reconstruit, `api.close()` la ferme.
 * @returns api
 */
export function openSheet({ title, render, onClose, className = '' }) {
  dismissToast(); // le message précédent ne doit pas masquer les boutons de la feuille
  const backdrop = h('div.sheet-backdrop');
  const body = h('div.sheet-body');
  const titleEl = h('h2', null, title || '');
  const sheet = h(`div.sheet${className ? '.' + className : ''}`, { role: 'dialog', 'aria-modal': 'true' },
    h('div.sheet-handle'),
    h('div.sheet-head', null, titleEl,
      h('button.icon-btn', { 'aria-label': 'Fermer', onclick: () => api.close() }, icon('close'))),
    body);
  let closed = false;
  const api = {
    el: sheet,
    body,
    setTitle(t) { titleEl.textContent = t; },
    refresh() {
      const top = body.scrollTop;
      body.replaceChildren();
      const c = render(api);
      if (c) body.append(...[].concat(c).flat(Infinity).filter((x) => x && x !== true));
      body.scrollTop = top;
    },
    close(result) {
      if (closed) return;
      closed = true;
      sheet.classList.remove('open'); backdrop.classList.remove('open');
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      setTimeout(() => { sheet.remove(); backdrop.remove(); }, 260);
      onClose?.(result);
    },
  };
  backdrop.addEventListener('click', () => api.close());
  // Glisser la poignée vers le bas pour fermer
  let startY = null;
  sheet.querySelector('.sheet-head').addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.querySelector('.sheet-head').addEventListener('touchend', (e) => {
    if (startY != null && e.changedTouches[0].clientY - startY > 60) api.close();
    startY = null;
  });
  document.body.append(backdrop, sheet);
  api.refresh();
  stack.push(api);
  requestAnimationFrame(() => requestAnimationFrame(() => { backdrop.classList.add('open'); sheet.classList.add('open'); }));
  return api;
}

export function closeAllSheets() { [...stack].forEach((s) => s.close()); }
export const hasOpenSheet = () => stack.length > 0;

/**
 * Choix dans une liste d'options. Résout avec la valeur choisie (ou null).
 * options: [{ value, label, help?, danger?, on? }]
 */
export function choose({ title, subtitle, options }) {
  return new Promise((resolve) => {
    let picked = null;
    openSheet({
      title,
      onClose: () => resolve(picked),
      render: (api) => [
        subtitle && h('p.sheet-sub', null, subtitle),
        ...options.map((o) => h(`button.option${o.danger ? '.danger' : ''}${o.on ? '.on' : ''}`, {
          onclick: () => { picked = o.value; api.close(); },
        }, o.icon ? icon(o.icon) : null, h('div.grow', null, h('div.t', null, o.label), o.help && h('div.d', null, o.help)))),
      ],
    });
  });
}

/** Confirmation d'une action destructrice. */
export function confirmAction({ title, message, confirmLabel = 'Supprimer', danger = true }) {
  return new Promise((resolve) => {
    let ok = false;
    openSheet({
      title,
      onClose: () => resolve(ok),
      render: (api) => [
        message && h('p.sheet-sub', null, message),
        h('div.sheet-actions', null,
          h(`button.btn.block.lg${danger ? '.danger' : '.primary'}`, { onclick: () => { ok = true; api.close(); } }, confirmLabel),
          h('button.btn.block.ghost', { onclick: () => api.close() }, 'Annuler')),
      ],
    });
  });
}

/* ---------------------------------------------------------------- Toast -- */
let toastWrap = null;
let toastTimer = null;
let toastEl = null;

function dismissToast() {
  clearTimeout(toastTimer);
  toastEl?.remove();
  toastEl = null;
}

/**
 * Affiche un message. Avec `undo`, un bouton « Annuler » reste visible
 * quelques secondes.
 *
 * Le message ne bloque jamais l'écran : toucher n'importe où ailleurs le fait
 * disparaître (et le toucher passe quand même à l'élément visé), ce qui permet
 * d'enchaîner plusieurs suppressions sans attendre. Toucher le message le ferme.
 */
export function toast(message, { undo = null, duration = undo ? 5000 : 2600 } = {}) {
  if (!toastWrap) {
    toastWrap = h('div.toast-wrap');
    document.body.append(toastWrap);
    document.addEventListener('pointerdown', (e) => {
      if (toastEl && !toastEl.contains(e.target)) dismissToast();
    }, true);
  }
  dismissToast();
  const el = h('div.toast', { role: 'status' },
    h('span.msg', { onclick: () => dismissToast() }, message),
    undo && h('button.btn.sm.primary', { onclick: () => { dismissToast(); undo(); } }, icon('undo', 'sm'), 'Annuler'));
  toastEl = el;
  toastWrap.replaceChildren(el);
  toastTimer = setTimeout(() => { if (toastEl === el) dismissToast(); }, duration);
}
