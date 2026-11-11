/**
 * Client Supabase minimal (sans bibliothèque) : authentification par e-mail
 * et mot de passe, lecture/écriture de la table `docs` via l'API REST.
 *
 * Seule la clé « publishable » est utilisée côté app : elle est faite pour
 * être publique. La sécurité repose sur les règles RLS de la table
 * (chaque utilisateur ne voit que ses propres lignes).
 */

export class SupabaseError extends Error {
  constructor(message, { status = 0, code = null, offline = false } = {}) {
    super(message);
    this.status = status; this.code = code; this.offline = offline;
  }
}

/** Traduit les erreurs d'authentification courantes. */
function frenchAuthError(status, body) {
  const code = body?.error_code || body?.code || body?.error || '';
  const msg = (body?.msg || body?.message || body?.error_description || '').toLowerCase();
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) return 'Les inscriptions sont fermées par sécurité. Demande à la personne qui t’a partagé l’app de créer ton compte.';
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'Pseudo ou mot de passe incorrect.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Ce pseudo est déjà pris.';
  if (code === 'same_password') return 'Choisis un mot de passe différent de l’actuel.';
  if (code === 'weak_password' || msg.includes('password should be')) return 'Mot de passe trop court (6 caractères minimum).';
  if (code === 'email_address_invalid' || msg.includes('invalid format') || msg.includes('email address')) return 'Adresse e-mail invalide.';
  if (code === 'email_not_confirmed') return 'Confirme d’abord ton e-mail (lien reçu par mail).';
  if (status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Trop de tentatives, réessaie dans quelques minutes.';
  return body?.msg || body?.message || body?.error_description || `Erreur ${status}`;
}

export function createSupabaseClient({ url, key, loadSession, saveSession, fetchFn = (...a) => fetch(...a) }) {
  const base = url.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  let session = null; // { access_token, refresh_token, expires_at, user: { id, email } }
  let loaded = false;

  async function ensureLoaded() {
    if (!loaded) { session = (await loadSession()) || null; loaded = true; }
  }

  async function call(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    let res;
    try {
      res = await fetchFn(`${base}${path}`, {
        method,
        cache: 'no-store', // jamais de réponse périmée venant du cache du navigateur
        headers: {
          apikey: key,
          ...(auth && session ? { Authorization: `Bearer ${session.access_token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SupabaseError('Hors ligne : impossible de joindre le serveur.', { offline: true });
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) throw new SupabaseError(frenchAuthError(res.status, json), { status: res.status, code: json?.error_code || json?.code || null });
    return json;
  }

  async function storeSession(data) {
    if (!data?.access_token) return null;
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: { id: data.user?.id, email: data.user?.email },
    };
    await saveSession(session);
    return session;
  }

  async function refresh() {
    if (!session?.refresh_token) throw new SupabaseError('Session expirée, reconnecte-toi.', { status: 401 });
    try {
      const data = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false });
      return storeSession(data);
    } catch (e) {
      if (!e.offline) { session = null; await saveSession(null); }
      throw e.offline ? e : new SupabaseError('Session expirée, reconnecte-toi.', { status: 401 });
    }
  }

  /** Requête authentifiée, avec rafraîchissement automatique du jeton. */
  async function authed(path, opts) {
    await ensureLoaded();
    if (!session) throw new SupabaseError('Non connecté.', { status: 401 });
    if (session.expires_at - 60 < Date.now() / 1000) await refresh();
    try {
      return await call(path, opts);
    } catch (e) {
      if (e.status !== 401) throw e;
      await refresh();
      return call(path, opts);
    }
  }

  return {
    async getUser() { await ensureLoaded(); return session?.user || null; },

    async signUp(email, password) {
      const data = await call('/auth/v1/signup', { method: 'POST', body: { email, password }, auth: false });
      if (!data?.access_token) {
        throw new SupabaseError('Compte créé : confirme ton e-mail (lien reçu par mail), puis connecte-toi.', { code: 'confirm_needed' });
      }
      return (await storeSession(data)).user;
    },

    async signIn(email, password) {
      const data = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false });
      return (await storeSession(data)).user;
    },

    /** Change le mot de passe du compte connecté. */
    async updatePassword(password) {
      await authed('/auth/v1/user', { method: 'PUT', body: { password } });
    },

    async signOut() {
      await ensureLoaded();
      try { if (session) await call('/auth/v1/logout', { method: 'POST' }); } catch { /* hors ligne : on déconnecte localement */ }
      session = null;
      await saveSession(null);
    },

    /**
     * Lignes modifiées après le curseur { t, c, i } (ordre stable).
     * Le curseur évite de perdre des lignes partageant le même horodatage.
     */
    async pullDocs(cursor, limit) {
      const params = new URLSearchParams({
        select: 'collection,id,data,deleted,updated_at',
        order: 'updated_at.asc,collection.asc,id.asc',
        limit: String(limit),
      });
      if (cursor) {
        const q = (v) => `"${String(v).replace(/"/g, '\\"')}"`;
        params.set('or', `(updated_at.gt.${q(cursor.t)},and(updated_at.eq.${q(cursor.t)},collection.gt.${q(cursor.c)}),and(updated_at.eq.${q(cursor.t)},collection.eq.${q(cursor.c)},id.gt.${q(cursor.i)}))`);
      }
      return (await authed(`/rest/v1/docs?${params}`)) || [];
    },

    /** Banque commune : toutes les entrées partagées par les utilisateurs. */
    async listBank() {
      return (await authed('/rest/v1/bank?select=id,data,created_by,updated_at&order=updated_at.asc&limit=2000')) || [];
    },

    /** Banque commune : ajoute ou met à jour une entrée (seul son auteur peut la modifier). */
    async upsertBank(id, data) {
      await authed('/rest/v1/bank?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: [{ id, data, created_by: session?.user?.id }],
      });
    },

    /** Envoie (insère ou remplace) des lignes. */
    async pushDocs(rows) {
      if (!rows.length) return;
      const user = session?.user?.id;
      await authed('/rest/v1/docs?on_conflict=user_id,collection,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: rows.map((r) => ({ user_id: user, collection: r.collection, id: r.id, data: r.data, deleted: r.deleted })),
      });
    },
  };
}
