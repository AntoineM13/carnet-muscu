/**
 * IDENTIFIANT DE CONNEXION : un pseudo plutôt qu'un e-mail (décision du
 * 2026-11-11). Supabase exige une adresse : l'app la fabrique à partir du
 * pseudo (« antoine » → antoine@carnet-muscu.app). Aucun e-mail n'est jamais
 * envoyé (confirmation désactivée), l'adresse n'est qu'un identifiant.
 * Une vraie adresse e-mail (comptes créés avant) reste acceptée telle quelle.
 * Fonctions pures, testées sous Node.
 */
export const PSEUDO_DOMAIN = 'carnet-muscu.app';

/** « Antoine M. » → « antoine-m » ; null si inutilisable. */
export function normalizePseudo(raw) {
  const p = String(raw || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');
  return p.length >= 2 && p.length <= 30 ? p : null;
}

/** Ce que la personne tape → adresse envoyée à Supabase (null si invalide). */
export function loginToEmail(raw) {
  const s = String(raw || '').trim();
  if (s.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
  const p = normalizePseudo(s);
  return p ? `${p}@${PSEUDO_DOMAIN}` : null;
}

/** Adresse Supabase → ce qu'on affiche (le pseudo, ou l'e-mail réel). */
export function displayLogin(email) {
  const e = String(email || '');
  const suffix = `@${PSEUDO_DOMAIN}`;
  return e.toLowerCase().endsWith(suffix) ? e.slice(0, -suffix.length) : e;
}
