/**
 * Configuration de la synchronisation en ligne (Supabase).
 *
 * La clé « publishable » est publique par conception : elle peut figurer
 * dans le code. NE JAMAIS mettre ici la clé « secret » / « service_role »
 * ni le mot de passe de la base.
 *
 * Mettre `enabled: false` pour revenir à une app 100 % locale.
 */
export const SYNC_CONFIG = {
  enabled: true,
  url: 'https://axtepwhxhqxrijpkdqfr.supabase.co',
  publishableKey: 'sb_publishable_oLjoDLkfBV-bTxruxEmx6g_ERpF3LCS',
  // Délai avant d'envoyer une modification (regroupe les saisies rapides).
  debounceMs: 3000,
  // Synchronisation périodique tant que l'app est ouverte et visible
  // (récupère les modifications faites sur un autre appareil).
  intervalMs: 15000,
};
