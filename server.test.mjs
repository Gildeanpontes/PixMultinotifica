import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './server.mjs';
import { createDatabase } from './db.mjs';

async function fixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(),'pixmulti-test-'));
  const server = createApp({directory});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const request = async (route,data,extra={}) => {
    const response = await fetch(origin+route,{method:data === undefined ? 'GET' : 'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...extra},body:data === undefined ? undefined : JSON.stringify(data)});
    if(response.headers.has('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
    return response;
  };
  try { await run({server,directory,origin,request}); }
  finally {
    await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep+'pixmulti-test-'));
    await rm(directory,{recursive:true,force:true});
  }
}
const credentials = {username:'teste',password:'senha-apenas-para-teste',business:'Empresa de teste'};

test('login protege dados; senha é derivada e logout invalida sessão', () => fixture(async ({request,directory}) => {
  assert.equal((await request('/api/state')).status,401);
  assert.equal((await (await request('/api/session')).json()).setupRequired,true);
  const setup = await request('/api/setup',credentials);
  assert.equal(setup.status,200);
  assert.match(setup.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const data = await (await request('/api/state')).json();
  assert.equal(data.business,credentials.business);
  assert.equal(JSON.stringify(data).includes('hash'),false);
  const saved = await readFile(path.join(directory,'app.json'),'utf8');
  assert.equal(saved.includes(credentials.password),false);
  assert.equal(JSON.parse(saved).admin.hash.length,128);
  assert.equal((await request('/api/setup',credentials)).status,409);
  assert.equal((await request('/api/logout',{})).status,200);
  assert.equal((await request('/api/state')).status,401);
  assert.equal((await request('/api/login',{...credentials,password:'senha-errada-de-teste'})).status,401);
  assert.equal((await request('/api/login',credentials)).status,200);
}));

test('bloqueia origem externa, corpos inválidos, arquivos privados e alteração sem login', () => fixture(async ({request,origin}) => {
  assert.equal((await request('/api/setup',credentials,{Origin:'https://outro.example'})).status,403);
  assert.equal((await request('/api/actions',{type:'business',name:'X'})).status,401);
  const invalid = await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{'});
  assert.equal(invalid.status,400);
  const oversized = await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({data:'x'.repeat(17000)})});
  assert.equal(oversized.status,413);
  for(const url of ['/.data/app.json','/.env','/.git/config','/db.mjs','/server.mjs','/__proto__']) assert.equal((await request(url)).status,404);
}));

test('gravações concorrentes não perdem lojas; simulação repetida não duplica avisos', () => fixture(async ({request,directory}) => {
  assert.equal((await request('/api/setup',credentials)).status,200);
  const saves = await Promise.all(Array.from({length:5},(_,index) => request('/api/actions',{type:'store',name:`Loja ${index}`})));
  assert.ok(saves.every(response => response.status === 200));
  const state = await (await request('/api/state')).json();
  assert.equal(state.stores.length,6);
  assert.equal((await request('/api/actions',{type:'member',name:'Dono',role:'Dono(a)',phone:'11999990001',storeId:'*'})).status,200);
  const action = {type:'simulate',requestId:'mesma-transacao',payer:'Cliente',amount:50,storeId:'principal',terminal:'Caixa 1'};
  const results = await Promise.all([request('/api/actions',action),request('/api/actions',action)]);
  assert.ok(results.every(response => response.status === 200));
  const persisted = (await createDatabase(directory).read()).state;
  assert.equal(persisted.payments.length,1); assert.equal(persisted.notices.length,1);
  const id=persisted.notices[0].id;
  const opened = await (await request('/api/actions',{type:'openNotice',id})).json();
  assert.equal(opened.notices[0].status,'opened');
  assert.equal(opened.notices[0].openCount,1);
  assert.equal(opened.notices[0].delivered,undefined);
}));

test('dados e login sobrevivem a reinício; sessões antigas não sobrevivem', () => fixture(async ({request,server,directory}) => {
  const setup=await request('/api/setup',credentials);
  const oldCookie=setup.headers.get('set-cookie').split(';')[0];
  await request('/api/actions',{type:'business',name:'Nome persistente'});
  await new Promise(resolve => server.close(resolve));
  const restarted = createApp({directory});
  await new Promise(resolve => restarted.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${restarted.address().port}`;
  try {
    assert.equal((await fetch(base+'/api/state',{headers:{Cookie:oldCookie}})).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(credentials)});
    assert.equal(login.status,200);
    const response = await fetch(base+'/api/state',{headers:{Cookie:login.headers.get('set-cookie').split(';')[0]}});
    assert.equal((await response.json()).business,'Nome persistente');
  } finally { await new Promise(resolve => restarted.close(resolve)); }
}));

test('limita tentativas de login', () => fixture(async ({request}) => {
  for(let index=0;index<10;index++) await request('/api/login',{username:'teste',password:'senha-curta'});
  const response=await request('/api/login',credentials);
  assert.equal(response.status,429); assert.equal(response.headers.get('retry-after'),'60');
}));

test('falha ao carregar arquivo corrompido sem substituir dados existentes', async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'pixmulti-test-'));
  try {
    await writeFile(path.join(directory,'app.json'),'{arquivo-corrompido');
    await assert.rejects(createDatabase(directory).read());
    assert.equal(await readFile(path.join(directory,'app.json'),'utf8'),'{arquivo-corrompido');
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep+'pixmulti-test-'));
    await rm(directory,{recursive:true,force:true});
  }
});
