/**
 * Petits composants d'interface réutilisables.
 */
import { h } from '../core/h.js';
import { icon } from './icons.js';
import { parseNum, fmtNum } from '../core/util.js';
import { go, back } from '../core/router.js';

/** Barre de titre d'un sous-écran avec bouton retour. */
export function topbar(title, { backTo = null, actions = null } = {}) {
  return h('header.topbar', null,
    h('button.icon-btn', { 'aria-label': 'Retour', onclick: () => (backTo ? go(backTo) : back()) }, icon('back')),
    h('div.title', null, title),
    actions || h('div.spacer'));
}

/** En-tête d'un écran principal. */
export function screenHead(title, sub, right = null) {
  return h('div.screen-head', null,
    h('div', null, h('h1', null, title), sub && h('div.sub', null, sub)),
    right);
}

/**
 * Stepper numérique « − valeur + ». La saisie clavier accepte la virgule.
 * onChange(value|null) est appelé à chaque modification.
 */
export function stepper({ value, step = 1, min = -Infinity, max = Infinity, onChange, placeholder = '', label, size = '', ariaLabel }) {
  const input = h('input', {
    type: 'text', inputmode: 'decimal', enterkeyhint: 'done', autocomplete: 'off',
    value: value == null ? '' : fmtNum(value), placeholder, 'aria-label': ariaLabel || label || '',
  });
  const set = (v) => {
    if (v != null) v = Math.min(max, Math.max(min, Math.round(v * 100) / 100));
    input.value = v == null ? '' : fmtNum(v);
    onChange?.(v);
  };
  input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
  input.addEventListener('change', () => set(parseNum(input.value)));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  const cur = () => parseNum(input.value);
  const el = h(`div.stepper${size ? '.' + size : ''}`, null,
    h('button', { type: 'button', 'aria-label': `Moins ${label || ''}`, onclick: () => set((cur() ?? 0) - step) }, icon('minus')),
    input,
    h('button', { type: 'button', 'aria-label': `Plus ${label || ''}`, onclick: () => set((cur() ?? 0) + step) }, icon('plus')));
  return label ? h('div', null, h('div.stepper-label', null, label), el) : el;
}

/** Contrôle segmenté. options: [{ value, label }] */
export function segmented(options, value, onChange, cls = '') {
  return h(`div.seg${cls ? '.' + cls : ''}`, { role: 'tablist' },
    options.map((o) => h(`button${o.value === value ? '.on' : ''}`, {
      type: 'button', role: 'tab', 'aria-selected': String(o.value === value), onclick: () => onChange(o.value),
    }, o.label)));
}

/** Ligne avec interrupteur. */
export function switchRow(label, checked, onChange, sub) {
  return h('label.switch-row', null,
    h('div.grow', null, h('div', null, label), sub && h('div.small.muted', null, sub)),
    h('span.switch', null,
      h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }),
      h('span')));
}

/** Champ texte / nombre / date avec libellé. */
export function field(label, input) {
  return h('div.field', null, h('label', null, label), input);
}

export function textInput(value, onChange, attrs = {}) {
  return h('input.input', { type: 'text', value: value ?? '', ...attrs, onchange: (e) => onChange(e.target.value) });
}

export function numberInput(value, onChange, attrs = {}) {
  return h('input.input.num', {
    type: 'text', inputmode: 'decimal', value: value == null ? '' : fmtNum(value), ...attrs,
    onchange: (e) => onChange(parseNum(e.target.value)),
  });
}

export function selectInput(options, value, onChange) {
  return h('select.select', { onchange: (e) => onChange(e.target.value) },
    options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
}

export function textarea(value, onChange, attrs = {}) {
  return h('textarea.textarea', { ...attrs, onchange: (e) => onChange(e.target.value) }, value || '');
}

/** Ligne de liste cliquable. */
export function listRow({ title, sub, lead, right, onClick, chevron = true }) {
  return h(onClick ? 'button.list-row' : 'div.list-row', { onclick: onClick },
    lead,
    h('div.grow', null, h('div.title.ellipsis', null, title), sub && h('div.sub', null, sub)),
    right,
    onClick && chevron ? h('span.chev', null, icon('chevron', 'sm')) : null);
}

export function emptyState(ic, text, action) {
  return h('div.empty', null, icon(ic), h('p', null, text), action && h('div', { style: { marginTop: '14px' } }, action));
}

/** Barre d'onglets principale. */
export function tabbar(active) {
  const tabs = [
    { id: 'home', href: '#/', label: 'Accueil', ic: 'home' },
    { id: 'program', href: '#/program', label: 'Programme', ic: 'program' },
    { id: 'history', href: '#/history', label: 'Historique', ic: 'history' },
    { id: 'goals', href: '#/goals', label: 'Objectifs', ic: 'target' },
  ];
  return h('nav.tabbar', { 'aria-label': 'Navigation principale' },
    tabs.map((t) => h(`a${t.id === active ? '.on' : ''}`, { href: t.href }, icon(t.ic), t.label)));
}

/** Graphique linéaire SVG simple. points: [{ x: label, y: number }] */
export function lineChart(points, { height = 170, target = null, fmtY = (v) => fmtNum(v, 1) } = {}) {
  const W = 340; const H = height; const padL = 36; const padR = 10; const padT = 12; const padB = 24;
  if (!points.length) return h('div.empty.small', null, 'Pas encore de données.');
  const ys = points.map((p) => p.y).concat(target != null ? [target] : []);
  let min = Math.min(...ys); let max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min; min -= span * 0.1; max += span * 0.1;
  const x = (i) => padL + (points.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (points.length - 1));
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const ticks = [max - (max - min) * 0.1, (max + min) / 2, min + (max - min) * 0.1];
  const labelIdx = points.length <= 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const svg = `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
      <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#c8f169" stop-opacity="0.22"/><stop offset="1" stop-color="#c8f169" stop-opacity="0"/>
      </linearGradient></defs>
      ${ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${fmtY(t)}</text>`).join('')}
      ${target != null ? `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>` : ''}
      <path class="area" d="${area}"/>
      <path class="line" d="${path}"/>
      ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.y)}" r="3.2"/>`).join('')}
      ${[...new Set(labelIdx)].map((i) => `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}">${points[i].x}</text>`).join('')}
    </svg>`;
  return h('div', { html: svg });
}
