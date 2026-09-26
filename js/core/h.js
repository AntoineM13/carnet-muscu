/**
 * Mini-constructeur de DOM (pas de framework).
 *
 *   h('div.card.hero', { onclick: fn, dataset: { id } }, 'texte', h('span', null, 'x'))
 *
 * - Le sélecteur accepte `tag#id.classe1.classe2`.
 * - Les props `on*` deviennent des écouteurs ; `class`, `style` (objet ou chaîne),
 *   `dataset`, `html` (innerHTML de confiance) sont gérés ; le reste -> attributs/propriétés.
 * - Les enfants null / false / undefined sont ignorés, les tableaux aplatis.
 */
export function h(sel, props, ...children) {
  const m = /^([a-z0-9-]+)?(#[\w-]+)?((?:\.[\w-]+)*)$/i.exec(sel);
  const el = document.createElement(m?.[1] || 'div');
  if (m?.[2]) el.id = m[2].slice(1);
  if (m?.[3]) el.className = m[3].slice(1).replace(/\./g, ' ');
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Remplace le contenu d'un nœud. */
export function mount(target, ...children) {
  target.replaceChildren();
  append(target, children);
}

/** Déclenche une vibration si possible (ignoré sur iOS). */
export function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* non supporté */ }
}
