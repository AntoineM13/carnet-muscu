/**
 * Environnement d'exécution : production ou test.
 *
 * La version de test (antoinem13.github.io/carnet-muscu-test/) partage le même
 * domaine que la production (antoinem13.github.io/carnet-muscu/). Or IndexedDB
 * et le cache sont partagés par domaine : sans séparation, la version de test
 * lirait et modifierait les vraies données du téléphone. On isole donc la base
 * locale de test sous un autre nom (voir `db.js`, et `sw.js` pour le cache).
 */

export function isTestPath(pathname) {
  return /\/carnet-muscu-test(\/|$)/.test(pathname || '');
}

export const IS_TEST_ENV = typeof location !== 'undefined' && isTestPath(location.pathname);

/** Nom de la base IndexedDB : inchangé en production (ne jamais le modifier). */
export function dbNameFor(isTest) {
  return isTest ? 'carnet-muscu-test' : 'carnet-muscu';
}
