/**
 * SÉANCE EN COURS (et correction d'une séance terminée).
 *
 * Principes :
 *  - UN écran par exercice (ou par superset). Jamais de longue liste.
 *  - Boutons fixes en bas : Précédent (compact) / Suivant (nom de l'exercice suivant).
 *  - Tout reste modifiable tant que la séance n'est pas terminée (et après, depuis l'historique).
 *  - Sauvegarde à chaque action ; toute suppression peut être annulée.
 */
import { h, haptic } from '../core/h.js';
import { state, getSession, getExercise, exerciseName, getTemplate } from '../core/store.js';
import { clone, fmtNum, fmtDuration, fmtDateShort, todayISO, parseNum } from '../core/util.js';
import * as Ses from '../domain/session.js';
import { lastPerformance, setComparison } from '../domain/progression.js';
import { warmupSets, plateBreakdown } from '../domain/tools.js';
import { formatSets, isWorkSet } from '../domain/stats.js';
import { SET_TYPES } from '../data/defaults.js';
import {
  persistSession, finishActive, deleteSession, sessionCtx, saveTemplate, saveExercise,
} from '../core/actions.js';
import { findSlot } from '../domain/program.js';
import { saveDoc } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { stepper, field } from '../ui/components.js';
import { go, rerender } from '../core/router.js';
import { openSheet, choose, confirmAction, toast } from '../ui/overlay.js';
import { pickExercise } from '../ui/pickers.js';
import { beep, vibrate, primeAudio } from '../ui/device.js';
import { sessionTopExtras, exerciseExtras, FORMS, setForm, itemSuggestion } from './session-extras.js';

const LETTERS = 'ABCDEFGH';

/* ------------------------------------------------------------ Rendu -- */

/** Nom d'un écran : 'Curl banc + Skull crusher' (hors exercices remplacés). */
export const stepName = (step) => step.items.filter((it) => !it.replacedBy).map((it) => exerciseName(it.exerciseId)).join(' + ');

export function renderSession({ id } = {}) {
  const session = id ? getSession(id) : getSession(state.meta.activeSessionId);
  if (!session) { go('/', { replace: true }); return { node: h('div'), tab: null }; }
  const editMode = session.status === 'done';
  const st = Ses.steps(session);
  if (session.currentStep >= st.length) session.currentStep = Math.max(0, st.length - 1);
  const idx = session.currentStep || 0;
  const step = st[idx];

  const save = (redraw = true) => { persistSession(session); if (redraw) rerender(); };
  const ctx = { session, st, step, idx, save, editMode };

  const content = h('div.ses-content', null,
    step ? stepView(ctx) : emptySession(ctx));
  attachSwipe(content, ctx);

  const node = h('main.ses-screen', null,
    header(ctx),
    !editMode && restBar(session),
    content,
    footer(ctx));
  startTicker();
  return { node, tab: null };
}

function emptySession(ctx) {
  return h('div.empty', { style: { marginTop: '24px' } },
    icon('dumbbell'),
    h('p', null, 'Séance vide. Ajoute un premier exercice.'),
    h('button.btn.primary', { style: { marginTop: '14px' }, onclick: () => addExercise(ctx) }, icon('plus', 'sm'), 'Ajouter un exercice'));
}

/* ---------------------------------------------------------- En-tête -- */
function header(ctx) {
  const { session, st, idx, editMode } = ctx;
  return h('header.ses-top', null,
    h('button.icon-btn', {
      'aria-label': editMode ? 'Terminer les modifications' : 'Quitter (la séance reste en cours)',
      onclick: () => go(editMode ? `/history/${session.id}` : '/'),
    }, icon(editMode ? 'back' : 'chevronDown')),
    h('button.ses-progress', { onclick: () => openStepList(ctx) },
      h('span.ses-name.ellipsis', null, editMode ? `Correction · ${fmtDateShort(session.date)}` : session.templateName),
      h('span.ses-count', null, st.length ? `Exercice ${idx + 1} sur ${st.length}` : 'Aucun exercice', icon('chevronDown', 'sm'))),
    !editMode ? h('span.ses-clock.num', { 'data-since': session.startedAt }, fmtDuration((Date.now() - new Date(session.startedAt)) / 1000)) : null,
    h('button.icon-btn', { 'aria-label': 'Options de la séance', onclick: () => sessionMenu(ctx) }, icon('more')));
}

/* ------------------------------------------------------ Chrono repos -- */
function restBar(session) {
  if (!session.rest || !state.settings.restTimerEnabled) return null;
  const left = Math.ceil((session.rest.endsAt - Date.now()) / 1000);
  const adjust = (d) => { Ses.adjustRest(session, d); persistSession(session); rerender(); };
  return h(`div.rest-bar${left <= 0 ? '.over' : ''}`, { 'data-ends': session.rest.endsAt, 'data-dur': session.rest.durationSec },
    h('div.rest-fill', { style: { width: `${Math.max(0, Math.min(100, (left / session.rest.durationSec) * 100))}%` } }),
    h('div.rest-inner', null,
      h('div.grow', null,
        h('div.rest-label', null, left <= 0 ? 'Repos terminé' : 'Repos'),
        h('div.rest-time.num', null, left <= 0 ? `+${fmtDuration(-left)}` : fmtDuration(left))),
      h('button.rest-btn', { onclick: () => adjust(-15), 'aria-label': 'Moins 15 secondes' }, '−15'),
      h('button.rest-btn', { onclick: () => adjust(15), 'aria-label': 'Plus 15 secondes' }, '+15'),
      h('button.rest-btn.skip', {
        onclick: () => { Ses.closeRest(session); persistSession(session); rerender(); },
      }, left <= 0 ? 'OK' : 'Passer')));
}

let ticker = null;
let alertedFor = null;
/** Met à jour chrono de repos et durée de séance chaque seconde (sans redessiner l'écran). */
function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const clock = document.querySelector('.ses-clock');
    if (clock) clock.textContent = fmtDuration((Date.now() - new Date(clock.dataset.since)) / 1000);
    const bar = document.querySelector('.rest-bar');
    if (!document.querySelector('.ses-screen')) { clearInterval(ticker); ticker = null; return; }
    if (!bar) return;
    const ends = Number(bar.dataset.ends); const dur = Number(bar.dataset.dur);
    const left = Math.ceil((ends - Date.now()) / 1000);
    bar.querySelector('.rest-time').textContent = left <= 0 ? `+${fmtDuration(-left)}` : fmtDuration(left);
    bar.querySelector('.rest-fill').style.width = `${Math.max(0, Math.min(100, (left / dur) * 100))}%`;
    if (left <= 0 && !bar.classList.contains('over')) {
      bar.classList.add('over');
      bar.querySelector('.rest-label').textContent = 'Repos terminé';
      bar.querySelector('.rest-btn.skip').textContent = 'OK';
      if (alertedFor !== ends) {
        alertedFor = ends;
        vibrate([300, 120, 300]);
        if (state.settings.soundEnabled) beep();
        bar.classList.add('flash');
      }
    }
  }, 1000);
}

/* ------------------------------------------------------------ Écran -- */
function stepView(ctx) {
  const { step, session, idx } = ctx;
  const skipped = Ses.stepStatus(step) === 'skipped';
  return h('div.ses-step', null,
    ...sessionTopExtras(ctx),
    ...step.items.map((item, k) => exerciseHead(ctx, item, k)),
    skipped
      ? h('div.banner', null, h('span.ic', null, icon('skip')), h('div.grow', null, 'Exercice sauté.',
        h('div.actions', null, h('button.btn.sm.primary', {
          onclick: () => { step.items.forEach((it) => { it.skipped = false; }); ctx.save(); },
        }, 'Le reprendre'))))
      : [
        idx === 0 && warmupProposal(ctx),
        setsView(ctx),
        h('div.ses-tools', null,
          h('button.btn.sm.ghost', { onclick: () => { step.items.forEach((it) => Ses.addSet(it)); ctx.save(); } }, icon('plus', 'sm'), step.isSuperset ? 'Un tour' : 'Une série'),
          h('button.btn.sm.ghost', { onclick: () => openWarmup(ctx) }, icon('flame', 'sm'), 'Échauffement'),
          step.items.some((it) => getExercise(it.exerciseId)?.equipment === 'barre')
            && h('button.btn.sm.ghost', { onclick: () => openPlates(ctx) }, icon('plates', 'sm'), 'Disques')),
      ]);
}

/** En-tête d'un exercice : nom, alternatives, cible, notes, douleur, dernière fois. */
function exerciseHead(ctx, item, k) {
  const { step, session } = ctx;
  const ex = getExercise(item.exerciseId);
  const last = lastPerformance(item.exerciseId, state.sessions, { excludeSessionId: session.id, templateId: session.templateId, target: item.target });
  const t = item.target;
  const letter = Ses.laneLetter(step, item);
  if (item.replacedBy) {
    const n = item.sets.filter((x) => x.done && x.type !== 'echauffement').length;
    return h('div.replaced-line', null, icon('swap', 'sm'),
      h('span.grow', null, `${ex?.name || 'Exercice'} : ${n} série${n > 1 ? 's' : ''}, puis remplacé par ${exerciseName(item.replacedBy)}`));
  }
  return h(`section.ex-head${step.isSuperset ? '.compact' : ''}`, null,
    h('div.ex-title-row', null,
      letter && h('span.slot-letter.lg', null, letter),
      h('h1.ex-title', null, ex?.name || 'Exercice supprimé')),
    item.alternatives?.length > 1 && h('div.chips.alt-chips', null, item.alternatives.map((a) => h(`button.chip${a === item.exerciseId ? '.on' : ''}`, {
      onclick: () => {
        if (a === item.exerciseId) return;
        Ses.replaceExercise(session, item.id, a, sessionCtx(session));
        ctx.save();
      },
    }, exerciseName(a)))),
    h('div.ex-meta.num', null,
      `${t.sets} × ${t.repMin}-${t.repMax}`, h('span.sep'), `repos ${fmtDuration(t.restSec)}`,
      ex?.unilateral ? [h('span.sep'), 'par côté'] : null,
      ex?.loadMode === 'lest' ? [h('span.sep'), 'lest'] : null),
    ex?.pain?.active && h('div.pain-box', null, icon('alert', 'sm'), h('div', null, h('strong', null, 'Douleur / à éviter'), ex.pain.comment ? ` — ${ex.pain.comment}` : '')),
    ex?.notes ? h('button.note-box.ex-notes', { onclick: () => editNotes(ex) }, ex.notes)
      : !step.isSuperset && h('button.link-btn.small.add-note', { onclick: () => editNotes(ex) }, icon('note', 'sm'), 'Ajouter une note'),
    h('div.last-time', null,
      h('span.eyebrow', null, 'Dernière fois'),
      last ? h('span.num', null, formatSets(last.sets, fmtNum), h('span.faint', null, ` · ${fmtDateShort(last.date)}`))
        : h('span.faint', null, 'Première fois')),
    ...exerciseExtras(ctx, item));
}

function editNotes(ex) {
  if (!ex) return;
  openSheet({
    title: 'Notes permanentes',
    render: (api) => [
      h('p.sheet-sub', null, ex.name),
      h('textarea.textarea', { style: { minHeight: '140px' }, oninput: (e) => { ex.notes = e.target.value; saveExercise(ex, { silent: true }); } }, ex.notes || ''),
      h('div.sheet-actions', null, h('button.btn.primary.block', { onclick: () => { api.close(); rerender(); } }, 'OK')),
    ],
    onClose: () => rerender(),
  });
}

/* ---------------------------------------------------------- Séries -- */
function setsView(ctx) {
  const { step } = ctx;
  const entries = Ses.orderedSets(step);
  const current = Ses.currentEntry(step);
  if (!entries.length) {
    return h('div.empty.small', null, 'Aucune série. ', h('button.link-btn', { onclick: () => { step.items.forEach((it) => Ses.addSet(it)); ctx.save(); } }, 'Ajouter une série'));
  }
  return h('div.sets', null, entries.map((e) => (e === current || (current && e.set === current.set)
    ? currentSetCard(ctx, e)
    : setRow(ctx, e))),
  !current && h('div.step-done', null, icon('check', 'sm'), step.isSuperset ? 'Superset terminé' : 'Exercice terminé'));
}

function setLabel(e) {
  if (e.set.type === 'echauffement') return 'É';
  return e.label;
}

function stageText(set, ex) {
  const [first, ...drops] = set.stages;
  const f = (st) => `${st.load == null ? '–' : fmtNum(st.load)}${ex?.loadMode === 'lest' && st.load != null ? '' : ''} × ${st.reps ?? '–'}`;
  return [f(first), ...drops.map(f)].join('  →  ');
}

/** Ligne compacte (série validée ou à venir). Toucher = édition. */
function setRow(ctx, e) {
  const { set, item } = e;
  const ex = getExercise(item.exerciseId);
  const type = SET_TYPES[set.type];
  return h(`button.set-row${set.done ? '.done' : ''}${set.type === 'echauffement' ? '.warm' : ''}`, {
    onclick: () => openSetSheet(ctx, item.id, set.id),
  },
  h('span.set-label', null, setLabel(e)),
  h('span.set-val.num.grow', null, stageText(set, ex),
    ctx.step.isSuperset ? h('span.set-ex.ellipsis', null, ex?.name) : null),
  set.type !== 'normale' && set.type !== 'echauffement' ? h('span.badge.outline', null, type.label) : null,
  !set.done && !ctx.editMode && set.type !== 'echauffement' && state.settings.suggestionsEnabled !== false ? h('span.set-goal', null, 'objectif') : null,
  set.done && set.restTakenSec != null ? h('span.set-rest.num', null, fmtDuration(set.restTakenSec)) : null,
  set.done ? h('span.set-check', null, icon('check', 'sm')) : h('span.set-todo'));
}

/** « Dernière fois » et « Objectif » de cette série, côte à côte (sans ambiguïté). */
function setCompare(ctx, item, set, ex) {
  const { session } = ctx;
  const index = item.sets.filter((s) => s.type !== 'echauffement').indexOf(set);
  const last = lastPerformance(item.exerciseId, state.sessions, { excludeSessionId: session.id, templateId: session.templateId, target: item.target });
  const sugOn = state.settings.suggestionsEnabled !== false;
  const sug = sugOn ? itemSuggestion(session, item) : null;
  const c = setComparison(last, sug?.sets, index);
  const fmt = (v) => {
    if (!v) return '—';
    const load = v.load == null ? '–' : ex?.loadMode === 'lest' ? (v.load === 0 ? 'PDC' : `${v.load > 0 ? '+' : ''}${fmtNum(v.load)} kg`) : `${fmtNum(v.load)} kg`;
    return `${load} × ${v.reps ?? '–'}`;
  };
  return h(`div.set-compare${sugOn ? '' : '.single'}`, null,
    h('div.sc-col.sc-last', null,
      h('span.sc-k', null, last ? `Dernière fois · ${fmtDateShort(last.date)}` : 'Dernière fois'),
      h('span.sc-v.num', null, c.last ? fmt(c.last) : last ? 'Pas de série ' + (index + 1) : 'Première fois')),
    sugOn ? h('div.sc-col.sc-target', null,
      h('span.sc-k', null, 'Objectif'),
      h('span.sc-v.num', null, c.target ? fmt(c.target) : '—',
        c.trend === 'up' ? icon('up', 'sm') : c.trend === 'down' ? icon('down', 'sm') : null)) : null);
}

/** Carte de la série en cours : saisie + validation en 1 tap. */
function currentSetCard(ctx, e) {
  const { set, item } = e;
  const { session } = ctx;
  const ex = getExercise(item.exerciseId);
  const inc = item.target.increment || 2.5;
  const touch = () => { set.touched = true; persistSession(session); };
  const isWarm = set.type === 'echauffement';

  const validate = () => {
    if (document.activeElement?.blur) document.activeElement.blur();
    const main = set.stages[0];
    if (main.reps == null || main.reps <= 0 || (main.load == null && ex?.loadMode !== 'lest')) {
      toast('Saisis la charge et les répétitions.');
      return;
    }
    primeAudio();
    const rest = Ses.validateSet(session, set.id, { supersetRestAfterRound: state.settings.supersetRestAfterRound });
    propagateLoad(item, set);
    if (!ctx.editMode && rest && state.settings.restTimerEnabled) Ses.startRest(session, set.id, rest);
    haptic(20);
    ctx.save();
    // Palier de dégressive saisi comme une série à part ? On propose de regrouper.
    const prev = Ses.dropCandidate(session, set.id);
    if (prev) {
      toast('C’était une dégressive ?', {
        action: { label: 'Regrouper', icon: 'drop', run: () => { if (Ses.mergeIntoDrop(session, prev.id, set.id)) { ctx.save(); toast('Regroupée en dégressive'); } } },
      });
    }
    // Amène la série suivante à l'écran (sans masquer par l'en-tête ni le pied de page).
    requestAnimationFrame(() => document.querySelector('.set-current, .step-done')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  return h(`div.set-current${isWarm ? '.warm' : ''}`, null,
    h('div.set-current-head', null,
      h('span.set-label.on', null, setLabel(e)),
      h('span.grow', null,
        isWarm ? 'Échauffement' : ctx.step.isSuperset ? ex?.name : `Série ${e.round + 1} sur ${item.sets.filter((s) => s.type !== 'echauffement').length}`),
      set.type === 'echec' && h('span.badge.outline', null, 'Échec'),
      h('button.icon-btn', { 'aria-label': 'Détails de la série', onclick: () => openSetSheet(ctx, item.id, set.id) }, icon('more'))),
    !isWarm && !ctx.editMode ? setCompare(ctx, item, set, ex) : null,
    set.stages.map((stg, i) => h('div.stage', null,
      i > 0 && h('div.stage-head', null, h('span.eyebrow', null, `Palier ${i + 1} · dégressive`),
        h('button.link-btn.small', { onclick: () => { Ses.removeStage(set, i); ctx.save(); } }, 'Retirer')),
      h('div.stage-grid', null,
        stepper({ label: ex?.loadMode === 'lest' ? 'Lest (kg)' : 'Charge (kg)', value: stg.load, step: inc, min: ex?.loadMode === 'lest' ? -200 : 0, placeholder: '0', onChange: (v) => { stg.load = v; touch(); } }),
        stepper({ label: ex?.unilateral ? 'Reps / côté' : 'Reps', value: stg.reps, step: 1, min: 0, placeholder: `${item.target.repMin}-${item.target.repMax}`, onChange: (v) => { stg.reps = v; touch(); } })))),
    h('div.set-current-tools', null,
      !isWarm && h('button.btn.sm.ghost', {
        onclick: () => { Ses.addStage(set, { dropPct: state.settings.dropPct, increment: inc }); ctx.save(); },
      }, icon('drop', 'sm'), 'Dégressive'),
      h('button.btn.sm.ghost', { onclick: () => { if (copyLast(ctx, item, set)) ctx.save(); } }, icon('repeat', 'sm'), 'Comme la dernière fois')),
    h('button.btn.primary.lg.block.validate', { onclick: validate }, icon('check'), set.stages.length > 1 ? 'Valider la dégressive' : 'Valider la série'));
}

/** Après validation : les séries suivantes non modifiées reprennent la charge réellement utilisée. */
function propagateLoad(item, set) {
  if (set.type === 'echauffement') return;
  const { load, reps } = set.stages[0];
  const i = item.sets.indexOf(set);
  for (const s of item.sets.slice(i + 1)) {
    if (s.done || s.touched || s.type === 'echauffement') continue;
    s.stages[0].load = load;
    if (s.stages[0].reps == null) s.stages[0].reps = reps; // première séance : on reprend les reps saisies
  }
}

/** « Comme la dernière fois » : série précédente, sinon même série de la séance précédente. */
function copyLast(ctx, item, set) {
  const works = item.sets.filter((s) => s.type !== 'echauffement');
  const pos = works.indexOf(set);
  const prevDone = [...item.sets.slice(0, item.sets.indexOf(set))].reverse().find((s) => s.done && s.type === set.type);
  let src = prevDone?.stages[0];
  if (!src) {
    const last = lastPerformance(item.exerciseId, state.sessions, { excludeSessionId: ctx.session.id, templateId: ctx.session.templateId, target: item.target });
    const ls = last?.sets[Math.min(Math.max(pos, 0), (last?.sets.length || 1) - 1)];
    src = ls?.stages[0];
  }
  if (!src) { toast('Rien à recopier pour l’instant.'); return false; }
  set.stages[0].load = src.load; set.stages[0].reps = src.reps; set.touched = true;
  return true;
}

/* ------------------------------------------------ Feuille « série » -- */
function openSetSheet(ctx, itemId, setId) {
  const { session } = ctx;
  openSheet({
    title: 'Série',
    onClose: () => rerender(),
    render: (api) => {
      const { item, set } = Ses.findSet(session, setId);
      if (!set) { api.close(); return []; }
      const ex = getExercise(item.exerciseId);
      const inc = item.target.increment || 2.5;
      const upd = () => { persistSession(session); rerender(); };
      api.setTitle(`${ex?.name || 'Série'}${set.done ? ' · validée' : ''}`);
      return [
        h('div.chips', null, Object.entries(SET_TYPES).map(([k, v]) => h(`button.chip${set.type === k ? '.on' : ''}`, {
          onclick: () => {
            if (k === 'degressive' && set.stages.length === 1) Ses.addStage(set, { dropPct: state.settings.dropPct, increment: inc });
            else if (k !== 'degressive' && set.stages.length > 1 && k !== 'echec') set.stages = set.stages.slice(0, 1);
            set.type = k; set.touched = true; upd(); api.refresh();
          },
        }, v.label))),
        ...set.stages.map((stg, i) => h('div.stage', { style: { marginTop: '14px' } },
          i > 0 && h('div.stage-head', null, h('span.eyebrow', null, `Palier ${i + 1}`),
            h('button.link-btn.small', { onclick: () => { Ses.removeStage(set, i); upd(); api.refresh(); } }, 'Retirer')),
          h('div.stage-grid', null,
            stepper({ label: 'Charge (kg)', value: stg.load, step: inc, min: ex?.loadMode === 'lest' ? -200 : 0, onChange: (v) => { stg.load = v; set.touched = true; upd(); } }),
            stepper({ label: 'Reps', value: stg.reps, step: 1, min: 0, onChange: (v) => { stg.reps = v; set.touched = true; upd(); } })))),
        set.type !== 'echauffement' && h('button.btn.sm.ghost', {
          style: { marginTop: '12px' },
          onclick: () => { Ses.addStage(set, { dropPct: state.settings.dropPct, increment: inc }); upd(); api.refresh(); },
        }, icon('drop', 'sm'), 'Ajouter un palier dégressif'),
        h('div.field-row', { style: { marginTop: '16px' } },
          stepper({ label: 'Repos pris (s)', value: set.restTakenSec, step: 15, min: 0, size: 'sm', onChange: (v) => { set.restTakenSec = v; upd(); } }),
          state.settings.rpeEnabled
            ? stepper({ label: 'RPE', value: set.rpe, step: 0.5, min: 1, max: 10, size: 'sm', placeholder: '–', onChange: (v) => { set.rpe = v; upd(); } })
            : h('div')),
        field('Note', h('input.input', { type: 'text', value: set.note || '', placeholder: 'Optionnel', style: { marginTop: '4px' }, onchange: (e) => { set.note = e.target.value; upd(); } })),
        h('div.sheet-actions', null,
          set.done
            ? h('button.btn.ghost.block', { onclick: () => { Ses.unvalidateSet(session, set.id); upd(); api.close(); } }, icon('undo', 'sm'), 'Dévalider')
            : h('button.btn.primary.block', {
              onclick: () => {
                const rest = Ses.validateSet(session, set.id, { supersetRestAfterRound: state.settings.supersetRestAfterRound });
                if (!ctx.editMode && rest && state.settings.restTimerEnabled) Ses.startRest(session, set.id, rest);
                upd(); api.close();
              },
            }, icon('check', 'sm'), 'Valider'),
          h('button.btn.danger.block', {
            onclick: () => {
              const snap = clone(session);
              Ses.removeSet(item, set.id);
              if (session.rest?.setId === set.id) session.rest = null;
              persistSession(session); api.close();
              toast('Série supprimée', { undo: () => restore(snap) });
            },
          }, icon('trash', 'sm'), 'Supprimer la série')),
      ];
    },
  });
}

/** Restaure un instantané de séance (annulation). */
function restore(snap) {
  saveDoc('sessions', snap, { silent: true });
  rerender();
}

/* ----------------------------------------------------- Échauffement -- */
function warmupFor(item) {
  const ex = getExercise(item.exerciseId);
  const firstWork = item.sets.find((s) => s.type !== 'echauffement');
  const load = firstWork?.stages[0].load;
  return warmupSets(load, state.settings.warmupSteps, {
    step: item.target.increment || 2.5,
    minLoad: ex?.equipment === 'barre' ? state.settings.barWeight : 0,
  });
}

function warmupProposal(ctx) {
  const item = ctx.step.items.find((it) => !it.replacedBy);
  if (!item || ctx.editMode || item.warmupDismissed) return null;
  if (item.sets.some((s) => s.type === 'echauffement' || s.done)) return null;
  const list = warmupFor(item);
  if (!list.length) return null;
  return h('div.warmup-card', null,
    h('div.row-flex', null, icon('flame', 'sm'), h('strong.grow', null, 'Échauffement proposé')),
    h('div.num.muted', { style: { margin: '6px 0 10px' } }, list.map((w) => `${fmtNum(w.load)} × ${w.reps}`).join('  ·  ')),
    h('div.row-flex', null,
      h('button.btn.sm.primary.grow', { onclick: () => { Ses.addWarmups(item, list); ctx.save(); } }, 'Ajouter'),
      h('button.btn.sm.ghost', { onclick: () => { item.warmupDismissed = true; ctx.save(); } }, 'Ignorer')));
}

function openWarmup(ctx) {
  const item = ctx.step.items.find((it) => !it.replacedBy);
  const list = warmupFor(item);
  if (!list.length) { toast('Saisis d’abord la charge de travail.'); return; }
  openSheet({
    title: 'Séries d’approche',
    render: (api) => [
      h('p.sheet-sub', null, `Calculées depuis ${fmtNum(item.sets.find((s) => s.type !== 'echauffement')?.stages[0].load)} kg (${state.settings.warmupSteps.map((s) => `${s.pct} %`).join(', ')}). Modifiables après ajout.`),
      h('div.list', null, list.map((w) => h('div.list-row', null, h('span.set-label', null, 'É'), h('div.grow.num', null, `${fmtNum(w.load)} kg × ${w.reps}`), h('span.faint.small', null, `${w.pct} %`)))),
      h('div.sheet-actions', null,
        h('button.btn.primary.block', { onclick: () => { Ses.addWarmups(item, list); ctx.save(); api.close(); } }, 'Ajouter ces séries'),
        h('button.btn.ghost.block', { onclick: () => api.close() }, 'Ignorer')),
    ],
  });
}

/* ------------------------------------------------ Calculateur disques -- */
function openPlates(ctx) {
  const cur = Ses.currentEntry(ctx.step);
  let total = cur?.set.stages[0].load ?? ctx.step.items[0].sets[0]?.stages[0].load ?? state.settings.barWeight;
  openSheet({
    title: 'Disques par côté',
    render: (api) => {
      const r = plateBreakdown(total, state.settings.barWeight, state.settings.plates);
      return [
        stepper({ label: 'Charge totale (kg)', value: total, step: 2.5, min: 0, onChange: (v) => { total = v ?? 0; api.refresh(); } }),
        h('p.small.muted', { style: { margin: '10px 0 16px' } }, `Barre de ${fmtNum(state.settings.barWeight)} kg (modifiable dans les réglages).`),
        r.belowBar ? h('p.muted', null, 'Charge inférieure au poids de la barre.')
          : h('div', null,
            h('div.plates-viz', null,
              h('span.bar-end'),
              r.perSide.map((p) => h('span.plate', { style: { height: `${40 + Math.min(p, 25) * 3.2}px` } }, fmtNum(p)))),
            h('div.num', { style: { fontSize: '18px', marginTop: '14px' } }, r.perSide.length ? r.perSide.map(fmtNum).join(' + ') + ' kg de chaque côté' : 'Barre seule'),
            r.remainder > 0 && h('p.small', { style: { color: 'var(--warn)', marginTop: '8px' } }, `${fmtNum(r.remainder)} kg non réalisables avec tes disques.`)),
      ];
    },
  });
}

/* -------------------------------------------------------- Pied de page -- */
function footer(ctx) {
  const { st, idx, session, editMode } = ctx;
  const next = st[idx + 1];
  const prev = st[idx - 1];
  const stepDone = ctx.step && ['done', 'skipped'].includes(Ses.stepStatus(ctx.step));
  const nextName = next ? stepName(next) : null;
  return h('footer.ses-foot', null,
    h('button.btn.ghost.prev', { disabled: !prev, onclick: () => goStep(ctx, idx - 1), 'aria-label': 'Exercice précédent' }, icon('back', 'sm'), 'Préc.'),
    next
      ? h(`button.btn.lg.next${stepDone ? '.primary' : ''}`, { onclick: () => goStep(ctx, idx + 1) },
        h('span.next-inner', null, h('span.next-k', null, 'Suivant'), h('span.next-name.ellipsis', null, nextName)), icon('chevron', 'sm'))
      : h('button.btn.lg.next.primary', { onclick: () => (editMode ? go(`/history/${session.id}`) : finish(ctx)) },
        editMode ? 'Terminer les modifications' : 'Terminer la séance'));
}

function goStep(ctx, i) {
  if (i < 0 || i >= ctx.st.length) return;
  ctx.session.currentStep = i;
  // Simple navigation : pas de marquage « modifiée après coup ».
  saveDoc('sessions', ctx.session, { silent: true });
  rerender();
  window.scrollTo(0, 0);
}

async function finish(ctx) {
  const { session } = ctx;
  const pending = session.items.filter((it) => !it.skipped).flatMap((it) => it.sets).filter((s) => !s.done).length;
  const doneSets = session.items.flatMap((it) => it.sets).filter((s) => s.done).length;
  if (!doneSets) {
    const ok = await confirmAction({ title: 'Aucune série validée', message: 'Terminer supprimera cette séance vide.', confirmLabel: 'Supprimer la séance' });
    if (ok) { deleteSession(session, 'Séance vide supprimée'); go('/'); }
    return;
  }
  if (pending) {
    const ok = await confirmAction({
      title: 'Terminer la séance ?',
      message: `${pending} série${pending > 1 ? 's' : ''} non validée${pending > 1 ? 's' : ''} ser${pending > 1 ? 'ont' : 'a'} ignorée${pending > 1 ? 's' : ''}.`,
      confirmLabel: 'Terminer', danger: false,
    });
    if (!ok) return;
  }
  finishActive(session);
  go(`/summary/${session.id}`);
}

/* --------------------------------------------------------- Balayage -- */
function attachSwipe(el, ctx) {
  if (!state.settings.swipeEnabled) return;
  let x0 = null; let y0 = null; let ignore = false;
  el.addEventListener('touchstart', (e) => {
    const t = e.target;
    ignore = !!t.closest('input, textarea, select, .stepper, .chips, button');
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null || ignore) { x0 = null; return; }
    const dx = e.changedTouches[0].clientX - x0; const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 50) goStep(ctx, ctx.idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

/* ------------------------------------------------ Liste des exercices -- */
function openStepList(ctx) {
  const { session } = ctx;
  openSheet({
    title: 'Exercices de la séance',
    onClose: () => rerender(),
    render: (api) => {
      const st = Ses.steps(session);
      const cur = session.currentStep;
      const mut = (fn, label) => {
        const snap = clone(session);
        fn();
        Ses.normalizeGroups(session);
        persistSession(session); api.refresh(); rerender();
        if (label) toast(label, { undo: () => { restore(snap); api.close(); } });
      };
      const labels = { done: 'Fait', progress: 'En cours', todo: 'À faire', skipped: 'Sauté' };
      return [
        h('div.step-list', null, st.map((s, i) => {
          const status = Ses.stepStatus(s);
          const done = s.items.flatMap((it) => it.sets).filter((x) => x.done && x.type !== 'echauffement').length;
          const total = s.items.flatMap((it) => it.sets).filter((x) => x.type !== 'echauffement').length;
          return h(`div.step-row.st-${status}${i === cur ? '.current' : ''}`, null,
            h('button.step-main', { onclick: () => { session.currentStep = i; persistSession(session); api.close(); window.scrollTo(0, 0); } },
              h('span.step-ic', null, status === 'done' ? icon('check', 'sm') : status === 'skipped' ? icon('skip', 'sm') : h('span.num', null, i + 1)),
              h('span.grow', null,
                h('span.step-name', null, stepName(s)),
                h('span.step-sub', null, `${s.isSuperset ? 'Superset · ' : ''}${labels[status]} · ${done}/${total} séries`))),
            h('button.icon-btn', { 'aria-label': 'Monter', disabled: i === 0, onclick: () => mut(() => { Ses.moveStep(session, i, -1); if (cur === i) session.currentStep = i - 1; else if (cur === i - 1) session.currentStep = i; }) }, icon('up', 'sm')),
            h('button.icon-btn', { 'aria-label': 'Descendre', disabled: i === st.length - 1, onclick: () => mut(() => { Ses.moveStep(session, i, 1); if (cur === i) session.currentStep = i + 1; else if (cur === i + 1) session.currentStep = i; }) }, icon('down', 'sm')),
            h('button.icon-btn', { 'aria-label': 'Plus d’actions', onclick: () => stepActions(ctx, i, mut) }, icon('more', 'sm')));
        })),
        h('div.sheet-actions', null,
          h('button.btn.ghost.block', { onclick: () => { api.close(); addExercise(ctx); } }, icon('plus', 'sm'), 'Ajouter un exercice')),
      ];
    },
  });
}

async function stepActions(ctx, i, mut) {
  const { session } = ctx;
  const st = Ses.steps(session);
  const s = st[i];
  const skipped = Ses.stepStatus(s) === 'skipped';
  const v = await choose({
    title: stepName(s),
    options: [
      { value: 'skip', label: skipped ? 'Reprendre' : 'Sauter', icon: skipped ? 'undo' : 'skip', help: skipped ? null : 'Tu pourras le reprendre plus tard' },
      i < st.length - 1 && { value: 'group', label: 'Grouper avec le suivant', icon: 'link', help: 'En superset' },
      s.isSuperset && { value: 'ungroup', label: 'Dégrouper le superset', icon: 'unlink' },
      { value: 'remove', label: 'Retirer de la séance', icon: 'trash', danger: true, help: 'Annulable' },
    ].filter(Boolean),
  });
  if (!v) return;
  const name = stepName(s);
  if (v === 'skip') mut(() => { s.items.forEach((it) => { it.skipped = !skipped; }); });
  if (v === 'group') mut(() => Ses.groupWithNext(session, i));
  if (v === 'ungroup') mut(() => Ses.ungroup(session, i));
  if (v === 'remove') {
    mut(() => {
      s.items.forEach((it) => Ses.removeItem(session, it.id));
      if (session.currentStep >= Ses.steps(session).length) session.currentStep = Math.max(0, Ses.steps(session).length - 1);
    }, `${name} retiré`);
  }
}

async function addExercise(ctx) {
  const { session } = ctx;
  const id = await pickExercise({ title: 'Ajouter un exercice' });
  if (!id) return;
  const settings = state.settings;
  const item = Ses.newItem({ exerciseId: id, target: Ses.targetFrom(null, settings, getExercise(id)), ctx: sessionCtx(session) });
  const at = Ses.addItemAfter(session, item, session.items.length ? session.currentStep : -1);
  session.currentStep = at;
  persistSession(session);
  rerender();
}

/* ----------------------------------------------------- Menu séance -- */
async function sessionMenu(ctx) {
  const { session, step, editMode } = ctx;
  const skipped = step && Ses.stepStatus(step) === 'skipped';
  const v = await choose({
    title: 'Options',
    options: [
      step && { value: 'replace', label: 'Remplacer l’exercice', icon: 'swap' },
      step && { value: 'skip', label: skipped ? 'Reprendre l’exercice' : 'Sauter l’exercice', icon: 'skip' },
      { value: 'add', label: 'Ajouter un exercice', icon: 'plus' },
      { value: 'list', label: 'Réorganiser la séance', icon: 'list' },
      !editMode && { value: 'form', label: 'Forme du jour', icon: 'bolt', help: FORMS.find((f) => f.value === (session.form || 'normal'))?.label },
      { value: 'date', label: 'Changer la date', icon: 'calendar', help: fmtDateShort(session.date) },
      !editMode && { value: 'abandon', label: 'Abandonner la séance', icon: 'trash', danger: true, help: 'Annulable quelques secondes' },
    ].filter(Boolean),
  });
  if (v === 'replace') replaceFlow(ctx);
  if (v === 'skip') { step.items.forEach((it) => { it.skipped = !skipped; }); ctx.save(); if (!skipped) toast('Exercice sauté — tu pourras le reprendre'); }
  if (v === 'add') addExercise(ctx);
  if (v === 'list') openStepList(ctx);
  if (v === 'date') changeDate(session);
  if (v === 'form') {
    const f = await choose({ title: 'Forme du jour', subtitle: '« KO » bascule les suggestions en mode Récup / volume. Les séries déjà validées ou modifiées ne changent pas.', options: FORMS.map((x) => ({ ...x, on: x.value === (session.form || 'normal') })) });
    if (f) { setForm(session, f); ctx.save(); }
  }
  if (v === 'abandon') {
    const ok = await confirmAction({ title: 'Abandonner la séance ?', message: 'Toutes les séries saisies seront supprimées. Tu pourras annuler juste après.', confirmLabel: 'Abandonner' });
    if (ok) { go('/'); deleteSession(session, 'Séance abandonnée'); }
  }
}

export function changeDate(session) {
  openSheet({
    title: 'Date de la séance',
    render: (api) => [
      h('input.input', { type: 'date', value: session.date, max: todayISO(), onchange: (e) => { if (e.target.value) { session.date = e.target.value; persistSession(session); rerender(); } } }),
      h('div.sheet-actions', null, h('button.btn.primary.block', { onclick: () => api.close() }, 'OK')),
    ],
  });
}

async function replaceFlow(ctx) {
  const { session, step } = ctx;
  let item = step.items.find((it) => !it.replacedBy);
  if (step.isSuperset) {
    const which = await choose({ title: 'Remplacer lequel ?', options: step.items.filter((it) => !it.replacedBy).map((it) => ({ value: it.id, label: `${Ses.laneLetter(step, it)} · ${exerciseName(it.exerciseId)}` })) });
    if (!which) return;
    item = Ses.findItem(session, which);
  }
  const ex = getExercise(item.exerciseId);
  const highlight = state.exercises.filter((e) => e.muscleGroup === ex?.muscleGroup && e.id !== ex?.id).map((e) => e.id);
  const newId = await pickExercise({ title: `Remplacer ${ex?.name || ''}`, exclude: [item.exerciseId], highlight });
  if (!newId) return;
  const tpl = session.templateId ? getTemplate(session.templateId) : null;
  const slot = tpl && item.slotId ? findSlot(tpl, item.slotId) : null;
  let scope = 'today';
  if (slot) {
    scope = await choose({
      title: 'Remplacer…',
      options: [
        { value: 'today', label: 'Juste aujourd’hui', help: 'Le programme reste inchangé', on: true },
        { value: 'forever', label: 'Définitivement', help: `Le modèle « ${tpl.name} » est modifié` },
      ],
    });
    if (!scope) return;
  }
  const snap = clone(session);
  Ses.replaceExercise(session, item.id, newId, sessionCtx(session));
  if (scope === 'forever' && slot) {
    slot.slot.exerciseId = newId;
    slot.slot.alternatives = (slot.slot.alternatives || []).filter((a) => a !== newId);
    saveTemplate(tpl, { silent: true });
  }
  persistSession(session);
  rerender();
  toast(`Remplacé par ${exerciseName(newId)}${scope === 'forever' ? ' (programme mis à jour)' : ''}`, { undo: scope === 'today' ? () => restore(snap) : null });
}

export { parseNum, isWorkSet };
