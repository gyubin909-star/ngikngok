// AiKoe backend: menyimpan API key di server (tidak pernah dikirim ke browser)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Muat .env sederhana tanpa dependency
try {
  const raw = await fs.readFile(path.join(__dirname, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch {}

const API = (process.env.FLORA_API_URL || 'https://app.flora.ai/api/v1').replace(/\/$/, '');
const KEY = process.env.FLORA_API_KEY;
const WS = process.env.FLORA_WORKSPACE_ID;
const PORT = Number(process.env.PORT) || 3000;
const PROJECT_NAME = 'AICHAT';
let projectId = process.env.FLORA_PROJECT_ID || null;

if (!KEY || !WS) {
  console.error('FLORA_API_KEY dan FLORA_WORKSPACE_ID wajib diisi (lihat .env.example).');
  process.exit(1);
}

async function callApi(method, route, body) {
  const res = await fetch(API + route, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { message: text } }; }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `API error ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Cari / buat project "AICHAT" di workspace (dibutuhkan oleh POST /generate)
async function ensureProject() {
  if (projectId) return projectId;
  try {
    const list = await callApi('GET', `/projects?workspace_id=${encodeURIComponent(WS)}&limit=50`);
    const items = list.projects || list.data || list.items || [];
    const found = items.find((p) => p.name === PROJECT_NAME) || null;
    if (found) return (projectId = found.project_id);
  } catch (e) { console.warn('List projects gagal:', e.message); }
  const created = await callApi('POST', '/projects', { workspace_id: WS, name: PROJECT_NAME });
  return (projectId = created.project_id);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json',
};

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function readBuffer(req, max) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) { const e = new Error('File terlalu besar (maks 20 MB)'); e.status = 413; throw e; } chunks.push(c); }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  req.setEncoding('utf8'); // decoder UTF-8 menjaga karakter multibyte (emoji, dll.) yang terbelah antar-chunk
  let s = '';
  for await (const c of req) { s += c; if (s.length > 2e6) { const e = new Error('Payload terlalu besar'); e.status = 413; throw e; } }
  try { return s ? JSON.parse(s) : {}; }
  catch { const e = new Error('JSON tidak valid'); e.status = 400; throw e; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/models' && req.method === 'GET') {
      // type=text (default) | image | video
      const qt = url.searchParams.get('type');
      const t = qt === 'image' || qt === 'video' ? qt : 'text';
      return send(res, 200, await callApi('GET', `/models?type=${t}`));
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const { prompt, model, params, type: reqType } = await readJson(req);
      const type = reqType === 'image' || reqType === 'video' ? reqType : 'text'; // text / image / video
      if (!prompt) return send(res, 400, { error: { message: 'prompt wajib diisi' } });
      const project_id = await ensureProject();
      const body = { workspace_id: WS, project_id, type, prompt };
      if (model) body.model = model;
      if (params && Object.keys(params).length) body.params = params;
      return send(res, 200, await callApi('POST', '/generate', body));
    }

    // Upload file referensi -> Assets (signed URL), API key tetap di server
    if (url.pathname === '/api/upload' && req.method === 'POST') {
      const name = decodeURIComponent(req.headers['x-file-name'] || 'file');
      const type = (req.headers['content-type'] || 'application/octet-stream').split(';')[0];
      const buf = await readBuffer(req, 20 * 1024 * 1024);
      const a = await callApi('POST', '/assets', { source: 'signed-url', workspace_id: WS, file_name: name, content_type: type });
      if (!a.upload) throw Object.assign(new Error('Server tidak mengembalikan URL upload'), { status: 502 });
      const fd = new FormData();
      for (const [k, v] of Object.entries(a.upload.form_fields || {})) fd.append(k, v);
      fd.append(a.upload.file_field || 'file', new Blob([buf], { type }), name);
      const up = await fetch(a.upload.url, { method: a.upload.method || 'POST', body: fd });
      if (!up.ok) throw Object.assign(new Error(`Upload ke storage gagal (${up.status})`), { status: 502 });
      const done = await callApi('POST', `/assets/${a.asset_id}/complete`);
      return send(res, 200, { asset_id: a.asset_id, url: done.url || a.url, status: done.status });
    }

    const m = url.pathname.match(/^\/api\/runs\/([\w-]+)$/);
    if (m && req.method === 'GET') return send(res, 200, await callApi('GET', `/runs/${m[1]}`));

    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: { message: 'Not found' } });

    // Static files
    let file = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const full = path.normalize(path.join(__dirname, 'public', file));
    if (!full.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
    const buf = await fs.readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); return res.end('Not found'); }
    console.error(`[${req.method} ${url.pathname}]`, e.status || '', JSON.stringify(e.data || e.message));
    send(res, e.status || 500, e.data || { error: { message: e.message } });
  }
});

server.listen(PORT, () => console.log(`AiKoe berjalan di http://localhost:${PORT}`));
