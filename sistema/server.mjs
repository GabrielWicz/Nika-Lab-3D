import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const password = process.env.NIKA_SENHA;
if (!password || password.length < 12) throw new Error('Defina NIKA_SENHA com pelo menos 12 caracteres.');
const salt = randomBytes(32);
const passwordHash = scryptSync(password, salt, 64);
const sessions = new Map();
const directory = new URL('./dados/', import.meta.url);
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(new URL('empresa.sqlite', directory));
db.exec('CREATE TABLE IF NOT EXISTS empresa (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)');
db.prepare('INSERT OR IGNORE INTO empresa VALUES (1, 0, ?)').run(JSON.stringify({
  produtos: [], materiais: [], movimentos: [], orcamentos: [], gastos: []
}));
const load = db.prepare('SELECT version, data FROM empresa WHERE id=1');
const save = db.prepare('UPDATE empresa SET version=version+1, data=? WHERE id=1 AND version=?');
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/modelo.mjs', ['modelo.mjs', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]
]);
const secure = process.env.NIKA_HTTPS === '1' ? '; Secure' : '';
const cookie = 'Path=/; HttpOnly; SameSite=Strict' + secure;
let nextLogin = 0;

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8_000_000) throw new Error('Arquivo excede o limite.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}

createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const path = req.url.split('?')[0];
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === 'GET' && files.has(path)) {
      const [name, type] = files.get(path);
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
      return res.end(readFileSync(new URL(name, import.meta.url)));
    }
    if (req.method !== 'GET' && req.headers['content-type'] !== 'application/json') {
      return json(415, { error: 'Formato inválido.' });
    }
    const now = Date.now();
    for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
    if (path === '/api/login' && req.method === 'POST') {
      const input = await readJson(req);
      if (now < nextLogin) return json(429, { error: 'Aguarde antes de tentar novamente.' });
      nextLogin = now + 1000;
      if (typeof input.senha !== 'string' || input.senha.length > 1024 ||
          !timingSafeEqual(scryptSync(input.senha, salt, 64), passwordHash)) {
        return json(401, { error: 'Senha incorreta.' });
      }
      const token = randomBytes(32).toString('hex');
      sessions.set(token, now + 28_800_000);
      res.setHeader('Set-Cookie', 'nika=' + token + '; Max-Age=28800; ' + cookie);
      return json(200, {});
    }
    const token = req.headers.cookie?.match(/(?:^|;\s*)nika=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!sessions.has(token)) return json(401, { error: 'Entre para acessar o sistema.' });
    if (path === '/api/logout' && req.method === 'POST') {
      sessions.delete(token);
      res.setHeader('Set-Cookie', 'nika=; Max-Age=0; ' + cookie);
      return json(200, {});
    }
    if (path === '/api/empresa' && req.method === 'GET') {
      const { version, data } = load.get();
      return json(200, { version, data: JSON.parse(data) });
    }
    if (path === '/api/empresa' && req.method === 'PUT') {
      const { version, data } = await readJson(req);
      if (!Number.isSafeInteger(version) || !data || !Object.keys(JSON.parse(load.get().data)).every(key => Array.isArray(data[key]))) {
        return json(400, { error: 'Dados inválidos.' });
      }
      if (!save.run(JSON.stringify(data), version).changes) {
        return json(409, { error: 'Outra sessão salvou alterações. Recarregue a página e tente novamente.' });
      }
      return json(200, { version: version + 1 });
    }
    return json(404, { error: 'Página indisponível.' });
  } catch (error) {
    console.error(error.message);
    return json(400, { error: 'Não foi possível processar a operação.' });
  }
}).listen(Number(process.env.NIKA_PORTA || 3000), '127.0.0.1', function () {
  console.log('Nika Lab 3D: http://127.0.0.1:' + this.address().port);
});
