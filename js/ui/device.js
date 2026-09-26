/**
 * Intégrations matérielles : écran allumé (Wake Lock), bip de fin de repos,
 * vibration. Tout échoue en silence si non supporté.
 */

let wakeLock = null;
let wantLock = false;

/** Garde l'écran allumé tant qu'une séance est en cours. */
export async function keepAwake(on) {
  wantLock = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; /* repli silencieux */ }
}

// Le verrou est relâché quand l'app passe en arrière-plan : on le redemande au retour.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantLock) keepAwake(true);
});

let audioCtx = null;
/** Débloque l'audio (iOS exige un geste utilisateur). */
export function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { audioCtx = null; }
}

/** Double bip discret. */
export function beep() {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.22].forEach((dt) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    });
  } catch { /* ignoré */ }
}

export function vibrate(pattern = [200, 100, 200]) {
  try { navigator.vibrate?.(pattern); } catch { /* iOS : non supporté */ }
}
