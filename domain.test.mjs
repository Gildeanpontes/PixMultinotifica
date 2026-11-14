import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, paymentMessage } from './domain.mjs';
import { server } from './server.mjs';

test('normaliza WhatsApp brasileiro com DDD e código de país', () => {
  assert.equal(normalizePhone('(63) 99999-1234'), '5563999991234');
  assert.equal(normalizePhone('+55 63 99999-1234'), '5563999991234');
  assert.equal(normalizePhone('(11) 3333-4444'), '551133334444');
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
