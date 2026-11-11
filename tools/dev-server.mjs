/**
 * SERVEUR DE TEST LOCAL : sert l'app ET un faux Supabase minimal, pour tester
 * dans un navigateur (ou Chrome sans fenêtre) sans toucher au vrai Supabase.
 *
 * Usage (deux terminaux, ou en arrière-plan) :
 *   node tools/dev-server.mjs . 8777   → l'app sur http://127.0.0.1:8777/
 *                                        (aussi sous /carnet-muscu-test/ pour simuler la version de test)
 *   node tools/dev-server.mjs . 8778   → le faux Supabase (l'app servie sur 8777 pointe vers 8778)
 *
 * - sync-config.js est remplacé à la volée pour pointer vers le faux Supabase.
 * - Connexion : n'importe quel e-mail / mot de passe.
 * - /__inject (POST) et /__has?k=collection/id : outils de test de la synchro.
 * - VERFILE=chemin : simule des publications successives (contenu du fichier =
 *   numéro de version injecté dans index.html et sw.js), avec max-age=600 comme
 *   GitHub Pages.
 * Rien à installer : Node seul.
 */
// Sert l'app (lecture seule du dépôt) + un faux Supabase minimal sur le même port.
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import { join, extname } from 'node:path';
const ROOT = process.argv[2], PORT = +(process.argv[3]||8777), API = 8778;
const rows = new Map(); let clock = Date.now();
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = ''; for await (const c of req) body += c;
  const j = (s, o) => { res.writeHead(s, { ...cors, 'Content-Type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
  if (u.pathname === '/auth/v1/token') return j(200, { access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', email: (body && JSON.parse(body).email) || 'test@x' } });
  if (u.pathname === '/auth/v1/logout') return j(204);
  if (u.pathname === '/auth/v1/signup') return process.env.NO_SIGNUP ? j(422, { code: 422, error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' }) : j(200, { access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', email: JSON.parse(body).email } });
  if (u.pathname === '/auth/v1/user' && req.method === 'PUT') { console.log('PASSWORD CHANGED'); return j(200, { id: 'u1' }); }
  if (u.pathname === '/rest/v1/docs') {
    console.log(new Date().toISOString().slice(11,19), req.method, req.method === 'POST' ? JSON.parse(body).map(r => r.collection + '/' + r.id).join(',') : (u.searchParams.get('or') ? 'pull(cursor)' : 'pull(all)'));
    if (req.method === 'POST') { for (const r of JSON.parse(body)) rows.set(r.collection + '/' + r.id, { ...r, updated_at: new Date(++clock).toISOString() }); return j(201); }
    const or = u.searchParams.get('or'); let t = null, c = null, i = null;
    if (or) { const m = [...or.matchAll(/"([^"]*)"/g)].map(x => x[1]); t = m[0]; c = m[2]; i = m[5]; }
    const all = [...rows.values()].sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id))
      .filter(r => !or || r.updated_at > t || (r.updated_at === t && (r.collection > c || (r.collection === c && r.id > i))));
    return j(200, all.slice(0, +u.searchParams.get('limit') || 1000));
  }
  if (u.pathname === '/__inject') { const r = JSON.parse(body); rows.set(r.collection + '/' + r.id, { ...r, updated_at: new Date(++clock).toISOString() }); console.log('INJECT', r.id); return j(200, {}); }
  if (u.pathname === '/__has') return j(200, rows.has(u.searchParams.get('k')));
  let p = u.pathname.replace(/^\/carnet-muscu-test(?=\/)/, '');
  if (p === '/' || p === '') p = '/index.html';
  if (p === '/js/data/sync-config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(`export const SYNC_CONFIG = { enabled: true, url: 'http://127.0.0.1:${API}', publishableKey: 'k', debounceMs: 3000, intervalMs: 15000 };`); }
  let ver = 'a'; try { ver = (await readFile(process.env.VERFILE, 'utf8')).trim(); } catch {}
  if (p === '/index.html' || p === '/sw.js') {
    let d = await readFile(join(ROOT, p), 'utf8');
    if (p === '/sw.js') d = d.replace(/const VERSION = '[^']*'/, `const VERSION = 'probe-${ver}'`);
    else d = d.replace('<head>', `<head><meta name="probe" content="${ver}">`); // __VER
    res.writeHead(200, { 'Content-Type': types[extname(p)], 'Cache-Control': 'max-age=600' }); return res.end(d);
  }
  try { const d = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); res.end(d); } catch { res.writeHead(404); res.end(); }
}).listen(PORT, '127.0.0.1', () => console.log('mock on', PORT));
