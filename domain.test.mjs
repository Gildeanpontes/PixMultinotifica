import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, paymentMessage, createDemoState, applyAction, businessDate } from './domain.mjs';
import { server } from './server.mjs';

test('normaliza WhatsApp brasileiro com DDD e código de país', () => {
  assert.equal(normalizePhone('(63) 99999-1234'), '5563999991234');
  assert.equal(normalizePhone('+55 63 99999-1234'), '5563999991234');
  assert.equal(normalizePhone('(11) 3333-4444'), '551133334444');
});

test('avisos respeitam loja, cadastro ativo e não duplicam com nova tentativa da mesma requisição', () => {
  const state = createDemoState();
  state.stores.push({id:'centro',name:'Centro'});
  for (const [index,storeId,active] of [[1,'*',true],[2,'principal',true],[3,'centro',true],[4,'principal',false]]) {
    applyAction(state,{type:'member',name:`Pessoa ${index}`,phone:`1199999000${index}`,role:'Caixa',storeId});
    state.members.at(-1).active=active;
  }
  const action = {type:'simulate',requestId:'request-123',payer:'Cliente',amount:19.90,storeId:'principal',terminal:'Caixa 1'};
  applyAction(state,action); applyAction(state,action);
  assert.equal(state.payments.length,1);
  assert.equal(state.notices.length,2);
  assert.deepEqual(state.notices.map(n => n.name).sort(),['Pessoa 1','Pessoa 2']);
  assert.ok(state.notices.every(n => n.status === 'prepared'));
  assert.equal(state.payments[0].status,'simulated');
});

test('edição mantém destinatário pausado, evita telefone duplicado e atualiza os próximos avisos', () => {
  const state = createDemoState();
  const action = {type:'member',name:'Ana',phone:'11999990001',role:'Gerente',storeId:'principal'};
  applyAction(state,action);
  const id=state.members[0].id;
  applyAction(state,{type:'toggle',id});
  applyAction(state,{...action,id,name:'Ana Silva',storeId:'*'});
  assert.equal(state.members.length,1);
  assert.equal(state.members[0].active,false);
  assert.equal(state.members[0].name,'Ana Silva');
  assert.throws(() => applyAction(state,{...action,name:'Outra pessoa'}),/já está cadastrado/);
});

test('simulação rejeita valores com mais de duas casas, loja inválida e confirmação bancária falsa', () => {
  const state = createDemoState();
  const action = {type:'simulate',requestId:'r',payer:'Cliente',amount:10,storeId:'principal',terminal:'Caixa 1'};
  for (const amount of [-1,0,0.001,1.999,Infinity,NaN,'10']) assert.throws(() => applyAction(state,{...action,amount}));
  assert.throws(() => applyAction(state,{...action,storeId:'inexistente'}));
  assert.throws(() => applyAction(state,{type:'confirmPayment'}));
  assert.equal(state.payments.length,0);
});

test('dia comercial usa Brasília mesmo perto da meia-noite UTC', () => {
  assert.equal(businessDate('2026-11-14T01:00:00Z'),'2026-11-13');
  assert.equal(businessDate('2026-11-14T03:00:00Z'),'2026-11-14');
});
test('rejeita números incompletos, sem DDD ou de outro país', () => {
  for (const phone of ['', '99999-1234', '00000000000', '+1 212 555 1234']) assert.throws(() => normalizePhone(phone));
});
test('mensagem inclui valor, referência e aviso de demonstração', () => {
  const message = paymentMessage({ id: 'DEMO-123', payer: 'Ana', amount: 89.9, date: '2026-11-14T01:00:00Z' }, 'Loja');
  for (const text of ['89,90', 'Ana', 'DEMO-123', 'Loja', 'pagamento fictício', 'sem confirmação bancária']) assert.ok(message.includes(text));
});
test('servidor serve app e bloqueia arquivos fora da lista pública', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/', '/app.js', '/styles.css', '/domain.mjs']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-security-policy').includes("default-src 'self'"));
      assert.ok((await response.text()).length > 0);
    }
    for (const path of ['/.env', '/package.json', '/.git/config', '/server.mjs']) assert.equal((await fetch(base + path)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
