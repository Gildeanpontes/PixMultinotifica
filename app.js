import { money, normalizePhone, paymentMessage } from './domain.mjs';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const key = 'pixmultinotifica.demo.v1';
const initialState = () => ({
  business: 'Minha empresa',
  members: [
    { id: 'owner', name: 'Você', role: 'Dono(a)', phone: '', active: true },
    { id: 'manager', name: 'Gerente de exemplo', role: 'Gerente', phone: '', active: true },
    { id: 'cashier', name: 'Caixa de exemplo', role: 'Caixa', phone: '', active: true },
  ],
  payments: [
    ['Mariana Costa', 150, 9], ['Pedro Almeida', 89.90, 28], ['Juliana Santos', 235.50, 47], ['Lucas Ferreira', 45, 76], ['Ana Oliveira', 120, 105],
  ].map(([payer, amount, minutes], i) => ({ id: `DEMO-${1005-i}`, payer, amount, date: new Date(Date.now() - minutes * 60000).toISOString() })),
  notices: [],
});
let storageWarning = false;
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && typeof saved.business === 'string' && Array.isArray(saved.members) && Array.isArray(saved.payments) && Array.isArray(saved.notices)) {
      if (saved.members.every(m => typeof m.id === 'string' && typeof m.name === 'string' && typeof m.role === 'string' && typeof m.phone === 'string' && typeof m.active === 'boolean') && saved.payments.every(p => typeof p.id === 'string' && typeof p.payer === 'string' && Number.isFinite(p.amount) && p.amount > 0 && Number.isFinite(Date.parse(p.date))) && saved.notices.every(n => typeof n.id === 'string' && typeof n.name === 'string' && typeof n.role === 'string' && /^55\d{10,11}$/.test(n.phone) && typeof n.message === 'string' && Number.isFinite(Date.parse(n.date)))) return saved;
    }
  } catch { storageWarning = true; }
  return initialState();
}
let state = loadState();
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5500); }
function save() { try { localStorage.setItem(key, JSON.stringify(state)); return true; } catch { toast('O navegador não permitiu salvar. As alterações durarão apenas nesta sessão.'); return false; } }
const time = date => new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const date = value => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const initials = name => name.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase();
function paymentTable(payments) {
  if (!payments.length) return '<div class="empty">Nenhum recebimento encontrado.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Pagador</th><th>Valor</th><th>Data / hora</th><th>Status</th></tr></thead><tbody>${payments.map(p => `<tr><td><div class="payer"><span class="payer-icon">↙</span><div><strong>${escapeHtml(p.payer)}</strong><small>${escapeHtml(p.id)}</small></div></div></td><td><strong>${money(p.amount)}</strong></td><td>${date(p.date)} · ${time(p.date)}</td><td><span class="status">◌ Simulado</span></td></tr>`).join('')}</tbody></table></div>`;
}
function memberRow(m, controls = false) {
  return `<div class="member-row"><span class="avatar">${escapeHtml(initials(m.name))}</span><div class="member-info"><strong>${escapeHtml(m.name)}</strong><small>${m.phone ? '+' + escapeHtml(m.phone) : 'Exemplo · cadastre um WhatsApp'}</small></div><span class="role-tag">${escapeHtml(m.role)}</span>${controls ? `<div class="member-actions"><button class="toggle" role="switch" aria-checked="${m.active}" aria-label="Avisos para ${escapeHtml(m.name)}" data-toggle="${escapeHtml(m.id)}"></button><button class="text-button danger" data-remove="${escapeHtml(m.id)}" aria-label="Remover ${escapeHtml(m.name)}">Remover</button></div>` : `<span class="green-dot" title="${m.active ? 'Avisos ativados' : 'Avisos pausados'}" ${m.active ? '' : 'hidden'}></span>`}</div>`;
}
function render() {
  const today = new Date().toLocaleDateString('pt-BR');
  const paymentsToday = state.payments.filter(p => new Date(p.date).toLocaleDateString('pt-BR') === today);
  $('#total-today').textContent = money(paymentsToday.reduce((sum, p) => sum + p.amount, 0));
  $('#count-today').textContent = paymentsToday.length;
  $('#team-total').textContent = state.members.length;
  $('#team-active').textContent = `${state.members.filter(m => m.active).length} pessoas com avisos ativados`;
  $('#notice-total').textContent = state.notices.length;
  $('#payment-count').textContent = state.payments.length;
  $('#sidebar-business').textContent = state.business;
  $('#business-name').value = state.business;
  $('#recent-payments').innerHTML = paymentTable(state.payments.slice(0,5));
  renderPayments();
  $('#team-preview').innerHTML = state.members.length ? state.members.slice(0,3).map(m => memberRow(m)).join('') : '<div class="empty">Cadastre a primeira pessoa da sua equipe.</div>';
  $('#team-list').innerHTML = state.members.length ? state.members.map(m => memberRow(m,true)).join('') : '<div class="empty">Sua equipe começa aqui. Adicione uma pessoa para preparar avisos.</div>';
  $('#notices').innerHTML = state.notices.length ? state.notices.map(n => `<article class="notice"><div><strong>${escapeHtml(n.name)} <span class="role-tag">${escapeHtml(n.role)}</span></strong><div class="notice-meta">+${escapeHtml(n.phone)} · ${date(n.date)} às ${time(n.date)} · Apenas preparada</div><pre>${escapeHtml(n.message)}</pre></div><a class="button secondary" href="https://wa.me/${encodeURIComponent(n.phone)}?text=${encodeURIComponent(n.message)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp ↗</a></article>`).join('') : '<div class="empty">Nenhum aviso preparado ainda.<br>Cadastre um WhatsApp na equipe e simule um recebimento.</div>';
}
function renderPayments() {
  const query = $('#search').value.toLocaleLowerCase('pt-BR');
  $('#all-payments').innerHTML = paymentTable(state.payments.filter(p => `${p.payer} ${p.id}`.toLocaleLowerCase('pt-BR').includes(query)));
}
const pages = {
  inicio: ['Visão geral', 'Tudo certo com o seu Pix.', 'Acompanhe os recebimentos e mantenha toda a equipe informada.'],
  recebimentos: ['Recebimentos', 'Cada Pix, em um só lugar.', 'Consulte o histórico de recebimentos de demonstração.'],
  equipe: ['Minha equipe', 'As pessoas certas, informadas.', 'Cadastre dono, gerente e caixa para os avisos de WhatsApp.'],
  avisos: ['Avisos WhatsApp', 'Um aviso para cada pessoa.', 'Mensagens preparadas para você revisar e enviar pelo WhatsApp.'],
  configuracoes: ['Configurações', 'Do jeito do seu negócio.', 'Personalize sua empresa e confira as integrações necessárias.'],
};
function navigate() {
  const page = Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'inicio';
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== `page-${page}`; });
  document.querySelectorAll('[data-page]').forEach(el => { el.classList.toggle('active', el.dataset.page === page); if(el.dataset.page === page) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  [$('#breadcrumb').textContent, $('#page-title').textContent, $('#page-description').textContent] = pages[page];
}
function openMember() { $('#member-form').reset(); $('#member-error').textContent = ''; $('#member-dialog').showModal(); }
$('#add-member').addEventListener('click', openMember);
$('#add-member-home').addEventListener('click', openMember);
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#simulate').addEventListener('click', () => { $('#payment-form').reset(); $('#payment-error').textContent = ''; $('#payment-dialog').showModal(); });
$('#member-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const name = form.get('name').trim();
    if (!name) throw new Error('Informe o nome da pessoa.');
    const phone = normalizePhone(form.get('phone'));
    if (state.members.some(m => m.phone === phone)) throw new Error('Este WhatsApp já está cadastrado na equipe.');
    state.members.push({ id: crypto.randomUUID(), name, role: form.get('role'), phone, active: true });
    const persisted = save(); render(); $('#member-dialog').close(); if (persisted) toast('Pessoa cadastrada. O WhatsApp já pode receber mensagens preparadas.');
  } catch (error) { $('#member-error').textContent = error.message; }
});
$('#payment-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const payer = form.get('payer').trim();
  const amount = Number(form.get('amount'));
  if (!payer || !Number.isFinite(amount) || amount < .01 || amount > 1000000) { $('#payment-error').textContent = 'Informe pagador e valor válido entre R$ 0,01 e R$ 1.000.000,00.'; return; }
  const payment = { id: `DEMO-${crypto.randomUUID().slice(0,8).toUpperCase()}`, payer, amount: Math.round(amount * 100) / 100, date: new Date().toISOString() };
  state.payments.unshift(payment);
  const recipients = state.members.filter(m => m.active && m.phone);
  const message = paymentMessage(payment, state.business);
  state.notices.unshift(...recipients.map(m => ({ id: crypto.randomUUID(), name: m.name, role: m.role, phone: m.phone, date: payment.date, message })));
  const persisted = save(); render(); $('#payment-dialog').close();
  if (persisted) toast(recipients.length ? `Pix simulado. ${recipients.length} aviso(s) preparado(s). Abra “Avisos WhatsApp” para enviar.` : 'Pix simulado. Cadastre uma pessoa com WhatsApp para preparar avisos.');
});
$('#team-list').addEventListener('click', event => {
  const toggle = event.target.closest('[data-toggle]');
  const remove = event.target.closest('[data-remove]');
  if (toggle) { const member = state.members.find(m => m.id === toggle.dataset.toggle); if (member) { member.active = !member.active; save(); render(); } }
  if (remove) {
    const member = state.members.find(m => m.id === remove.dataset.remove);
    if (member && confirm(`Remover ${member.name} da equipe? Avisos já preparados continuarão no histórico.`)) { state.members = state.members.filter(m => m.id !== member.id); save(); render(); }
  }
});
$('#business-form').addEventListener('submit', event => { event.preventDefault(); const name = $('#business-name').value.trim(); if (!name) { $('#business-name').setCustomValidity('Informe o nome da empresa.'); $('#business-name').reportValidity(); return; } state.business = name; const persisted = save(); render(); if(persisted) toast('Nome da empresa atualizado.'); });
$('#business-name').addEventListener('input', event => event.target.setCustomValidity(''));
$('#search').addEventListener('input', renderPayments);
window.addEventListener('hashchange', navigate);
window.addEventListener('storage', event => { if(event.key === key) { state = loadState(); render(); } });
render(); navigate();
if (storageWarning) toast('Não foi possível carregar os dados salvos. Uma demonstração nova foi aberta.');
