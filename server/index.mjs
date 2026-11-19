// Kairos local database server.
// Stores everything in a SQLite file on this computer (data/kairos.db) using
// Node's built-in SQLite, and serves the built app in production.
//
//   GET  /api/data            -> { data, version } (data is null until the first save)
//   PUT  /api/data            <- { data, baseVersion } -> { version } | 409 { data, version }
//   GET  /api/backups         -> [{ id, created_at, size }]
//   POST /api/backups/:id/restore -> { data, version }
//   GET  /api/health          -> { ok, db }
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = resolve(process.env.KAIROS_DB ?? join(ROOT, 'data', 'kairos.db'));
const PORT = Number(process.env.KAIROS_PORT ?? 5175);
const HOST = process.env.KAIROS_HOST ?? '127.0.0.1'; // this computer only
const DIST = join(ROOT, 'dist');
const BACKUP_EVERY_MS = 60 * 60 * 1000; // at most one backup per hour
const KEEP_BACKUPS = 200;
const MAX_BODY = 20 * 1024 * 1024;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS documents (
    key        TEXT PRIMARY KEY,
    json       TEXT NOT NULL,
    version    INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS backups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    json       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const getDoc = db.prepare('SELECT json, version FROM documents WHERE key = ?');
const upsertDoc = db.prepare(`
  INSERT INTO documents (key, json, version, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET json = excluded.json, version = excluded.version, updated_at = excluded.updated_at`);
const lastBackup = db.prepare('SELECT created_at FROM backups ORDER BY id DESC LIMIT 1');
const addBackup = db.prepare('INSERT INTO backups (json, created_at) VALUES (?, ?)');
const pruneBackups = db.prepare('DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT ?)');
const listBackups = db.prepare('SELECT id, created_at, length(json) AS size FROM backups ORDER BY id DESC LIMIT 100');
const getBackup = db.prepare('SELECT json FROM backups WHERE id = ?');

const KEY = 'app';

function current() {
  const row = getDoc.get(KEY);
  return row ? { data: JSON.parse(row.json), version: Number(row.version) } : { data: null, version: 0 };
}

function write(json, version) {
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    // Back up the previous version before overwriting, at most once an hour.
    const prev = getDoc.get(KEY);
    const last = lastBackup.get();
    if (prev && (!last || Date.now() - Date.parse(last.created_at) > BACKUP_EVERY_MS)) {
      addBackup.run(prev.json, now);
      pruneBackups.run(KEEP_BACKUPS);
    }
    upsertDoc.run(KEY, json, version, now);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const send = (res, status, body, headers = {}) => {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
};

const readBody = (req) => new Promise((ok, fail) => {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { fail(new Error('too large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
  req.on('error', fail);
});

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res) {
  if (!existsSync(DIST)) return send(res, 404, 'Not built yet. Run "npm run build", or use "npm run dev".');
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(DIST, urlPath));
  if (!file.startsWith(DIST)) return send(res, 403, 'Forbidden');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html'); // single-page app
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, db: DB_PATH });

    if (url.pathname === '/api/data' && req.method === 'GET') return send(res, 200, current());

    if (url.pathname === '/api/data' && req.method === 'PUT') {
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body.data !== 'object' || body.data === null) return send(res, 400, { error: 'data missing' });
      const cur = current();
      // Someone else (another tab) saved since this copy was loaded: hand back the newer one.
      if (cur.version !== 0 && body.baseVersion !== cur.version) return send(res, 409, cur);
      const version = cur.version + 1;
      write(JSON.stringify(body.data), version);
      return send(res, 200, { version });
    }

    if (url.pathname === '/api/backups' && req.method === 'GET') return send(res, 200, listBackups.all());

    const restore = url.pathname.match(/^\/api\/backups\/(\d+)\/restore$/);
    if (restore && req.method === 'POST') {
      const row = getBackup.get(Number(restore[1]));
      if (!row) return send(res, 404, { error: 'no such backup' });
      const version = current().version + 1;
      write(row.json, version);
      return send(res, 200, { data: JSON.parse(row.json), version });
    }

    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    return serveStatic(req, res);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: String(e.message ?? e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Kairos database: ${DB_PATH}`);
  console.log(`Kairos server:   http://${HOST}:${PORT}  (API at /api, app served from dist/ when built)`);
});
