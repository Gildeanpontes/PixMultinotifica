import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createDatabase } from './db.mjs';
import { applyAction, text } from './domain.mjs';

const scrypt = promisify(scryptCallback);
const files = new Map(Object.entries({'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/styles.css':['styles.css','text/css'],'/app.css':['app.css','text/css'],'/app.js':['app.js','text/javascript'],'/domain.mjs':['domain.mjs','text/javascript']}));
const sessionLifetime = 12 * 60 * 60 * 1000;
class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415,'Envie dados no formato JSON.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if(size > 16384) throw new HttpError(413,'Requisição muito grande.'); chunks.push(chunk); }
  try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if(!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result; }
  catch { throw new HttpError(400,'Dados inválidos.'); }
}
export function createApp({directory=fileURLToPath(new URL('./.data',import.meta.url)),publicOrigin=process.env.PUBLIC_ORIGIN} = {}) {
  const db = createDatabase(directory);
  const sessions = new Map();
  const attempts = new Map();
  const cookie = (token, clear=false) => `pix_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : sessionLifetime/1000}${publicOrigin?.startsWith('https:') ? '; Secure' : ''}`;
  return http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const json = (status,data) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
    try {
      const host = req.headers.host || '';
      const expectedOrigin = publicOrigin || `http://${host}`;
      if (publicOrigin ? host !== new URL(publicOrigin).host : !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw new HttpError(403,'Host não permitido.');
      const pathname = new URL(req.url,expectedOrigin).pathname;
      if (!pathname.startsWith('/api/')) {
        const file = files.get(pathname);
        if (!file || !['GET','HEAD'].includes(req.method)) throw new HttpError(404,'Não encontrado.');
        const content = await readFile(new URL(file[0],import.meta.url));
        res.writeHead(200,{'Content-Type':`${file[1]}; charset=utf-8`}); res.end(req.method === 'HEAD' ? undefined : content); return;
      }
      if (!['GET','POST'].includes(req.method)) throw new HttpError(405,'Método não permitido.');
      if (req.method === 'POST' && req.headers.origin !== expectedOrigin) throw new HttpError(403,'Origem da requisição não permitida.');
      const now = Date.now();
      for (const [id,session] of sessions) if(session.expires <= now) sessions.delete(id);
      const token = /(?:^|;\s*)pix_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = sessions.get(token);
      if (pathname === '/api/session' && req.method === 'GET') {
        const data = await db.read(); json(200,{setupRequired:!data.admin,authenticated:!!session,username:session?.username}); return;
      }
      if (['/api/setup','/api/login'].includes(pathname) && req.method === 'POST') {
        for (const [key,attempt] of attempts) if(attempt.until <= now) attempts.delete(key);
        const address = req.socket.remoteAddress;
        const attempt = attempts.get(address) || {count:0,until:now+60000};
        if (attempt.count >= 10) { res.setHeader('Retry-After','60'); throw new HttpError(429,'Muitas tentativas. Aguarde um minuto.'); }
        attempt.count++; attempts.set(address,attempt);
        const input = await body(req);
        const username = text(input.username,'Usuário',60).toLocaleLowerCase('pt-BR');
        if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw new HttpError(400,'Use uma senha de 12 a 128 caracteres.');
        const data = await db.read();
        if (pathname === '/api/setup') {
          if (data.admin) throw new HttpError(409,'O administrador já foi criado. Entre com sua conta.');
          const salt = randomBytes(16).toString('hex');
          const hash = (await scrypt(input.password,salt,64)).toString('hex');
          await db.update(next => { if(next.admin) throw new HttpError(409,'Administrador já cadastrado.'); next.admin={username,salt,hash}; next.state.business=text(input.business,'Nome da empresa',70); });
        } else {
          const hash = await scrypt(input.password,data.admin?.salt || 'pix-dummy-salt',64);
          if (!data.admin || !timingSafeEqual(hash,Buffer.from(data.admin.hash,'hex')) || username !== data.admin.username) throw new HttpError(401,'Usuário ou senha incorretos.');
        }
        if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
        if (token) sessions.delete(token);
        const id = randomBytes(32).toString('hex');
        sessions.set(id,{username,expires:Date.now()+sessionLifetime});
        res.setHeader('Set-Cookie',cookie(id)); json(200,{authenticated:true,username}); return;
      }
      if (!session) throw new HttpError(401,'Entre na sua conta para continuar.');
      if (pathname === '/api/logout' && req.method === 'POST') { sessions.delete(token); res.setHeader('Set-Cookie',cookie('',true)); json(200,{ok:true}); return; }
      if (pathname === '/api/state' && req.method === 'GET') { json(200,(await db.read()).state); return; }
      if (pathname === '/api/actions' && req.method === 'POST') {
        const action = await body(req);
        const result = await db.update(next => applyAction(next.state,action));
        json(200,result.state); return;
      }
      throw new HttpError(404,'Não encontrado.');
    } catch(error) {
      const status = error.status || (error.code ? 500 : 400);
      if (status >= 500) console.error('Erro interno de armazenamento:',error.code || error.name);
      if (!res.headersSent) json(status,{error:status >= 500 ? 'Não foi possível salvar ou carregar os dados. Tente novamente.' : error.message});
      else res.end();
    }
  });
}
export const server = createApp();
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port,'127.0.0.1',() => console.log(`PixMultiNotifica: http://localhost:${port}`));
}
