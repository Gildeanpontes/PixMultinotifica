import { money, businessDate } from './domain.mjs';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const time = value => new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
const date = value => new Date(value).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'});
const initials = name => name.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase();
let state = null;
let setupRequired = false;
let currentUser = '';
let toastTimer;
let mutating = false;
let revision = 0;
let simulationRequestId;

function toast(message) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; },6000);
}
function showAuth(setup) {
  state = null; revision++;
  setupRequired = setup;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('#app-shell').hidden = true; $('#auth-screen').hidden = false;
  $('#auth-form').hidden = false; $('#setup-business').hidden = !setup;
  $('#auth-form').elements.business.required = setup;
  $('#auth-form').elements.password.autocomplete = setup ? 'new-password' : 'current-password';
  $('#auth-form').elements.password.value = '';
  $('#auth-title').textContent = setup ? 'Vamos criar seu espaço.' : 'Bom ter você de volta.';
  $('#auth-description').textContent = setup ? 'Cadastre o administrador desta empresa. Você escolhe sua senha.' : 'Entre para acompanhar os recebimentos e sua equipe.';
  $('#auth-submit').textContent = setup ? 'Criar meu espaço' : 'Entrar';
}
async function api(path,data) {
  const response = await fetch(`/api/${path}`,data === undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  let result;
  try { result = await response.json(); } catch { throw new Error('O servidor não respondeu corretamente. Reinicie com npm start.'); }
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') showAuth(false);
    throw new Error(result.error || 'Não foi possível concluir a operação.');
  }
  return result;
}
async function refresh() {
  if (!state || mutating) return;
  const version = ++revision;
  try {
    const next = await api('state');
    if(version !== revision) return;
    state = next; render(); $('#sync-status').textContent = `Atualizado às ${time(new Date())}`;
  } catch(error) { $('#sync-status').textContent = 'Sem atualização · tente novamente'; throw error; }
}
async function perform(action) {
  if (mutating) throw new Error('Aguarde a operação atual terminar.');
  mutating = true; ++revision;
  try { state = await api('actions',action); render(); $('#sync-status').textContent = `Salvo às ${time(new Date())}`; }
  finally { mutating = false; }
}
function storeName(id) { return id === '*' ? 'Todas as lojas' : state.stores.find(store => store.id === id)?.name || 'Loja'; }
function options(selector, allLabel) {
  const select = $(selector); const previous = select.value;
  const all = allLabel ? `<option value="${selector === '#member-store' ? '*' : ''}">${allLabel}</option>` : '';
  select.innerHTML = all + state.stores.map(store => `<option value="${escapeHtml(store.id)}">${escapeHtml(store.name)}</option>`).join('');
  if([...select.options].some(option => option.value === previous)) select.value = previous;
}
function paymentTable(payments) {
  if (!payments.length) return '<div class="empty">Nenhum recebimento nesta seleção.<br>Use “Simular recebimento” para testar o fluxo.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Pagador / referência</th><th>Valor</th><th>Loja / caixa</th><th>Data / hora</th><th>Status</th></tr></thead><tbody>${payments.map(payment => `<tr><td><div class="payer"><span class="payer-icon">↙</span><div><strong>${escapeHtml(payment.payer)}</strong><small>${escapeHtml(payment.id)}</small></div></div></td><td><strong>${money(payment.amount)}</strong></td><td><div class="payer"><div>${escapeHtml(payment.storeName)}<small>${escapeHtml(payment.terminal)}</small></div></div></td><td>${date(payment.date)} · ${time(payment.date)}</td><td><span class="status neutral">Simulado</span></td></tr>`).join('')}</tbody></table></div>`;
}
function memberRow(member, controls=false) {
  return `<div class="member-row"><span class="avatar">${escapeHtml(initials(member.name))}</span><div class="member-info"><strong>${escapeHtml(member.name)}</strong><small>+${escapeHtml(member.phone)} · ${escapeHtml(storeName(member.storeId))}</small><small>${member.active ? 'Avisos ativados' : 'Avisos pausados'}</small></div><span class="role-tag">${escapeHtml(member.role)}</span>${controls ? `<div class="member-actions"><button class="toggle" role="switch" aria-checked="${member.active}" aria-label="Avisos para ${escapeHtml(member.name)}" data-toggle="${escapeHtml(member.id)}"></button><button class="text-button" data-edit="${escapeHtml(member.id)}">Editar</button><button class="text-button danger" data-remove="${escapeHtml(member.id)}">Remover</button></div>` : ''}</div>`;
}
function renderPayments() {
  if(!state) return;
  const query = $('#search').value.toLocaleLowerCase('pt-BR').trim();
  const store = $('#filter-store').value;
  const selectedDate = $('#filter-date').value;
  const amount = $('#filter-amount').value;
  const filtered = state.payments.filter(payment => `${payment.payer} ${payment.id}`.toLocaleLowerCase('pt-BR').includes(query) && (!store || payment.storeId === store) && (!selectedDate || businessDate(payment.date) === selectedDate) && (!amount || Math.round(payment.amount * 100) === Math.round(Number(amount) * 100)));
  $('#all-payments').innerHTML = paymentTable(filtered);
  $('#filter-summary').textContent = `${filtered.length} recebimento(s) · Total simulado: ${money(filtered.reduce((sum,payment) => sum+payment.amount,0))}`;
}
function renderCashier() {
  if(!state) return;
  const store = $('#cashier-store').value;
  const terminal = $('#cashier-terminal').value.trim().toLocaleLowerCase('pt-BR');
  const payments = state.payments.filter(payment => (!store || payment.storeId === store) && (!terminal || payment.terminal.toLocaleLowerCase('pt-BR') === terminal));
  const latest = payments[0];
  $('#cashier-latest').innerHTML = latest ? `<span class="status neutral">Último Pix simulado · não confirmado pelo banco</span><p class="cashier-amount">${money(latest.amount)}</p><h2>${escapeHtml(latest.payer)}</h2><p>${escapeHtml(latest.storeName)} · ${escapeHtml(latest.terminal)} · ${date(latest.date)} às ${time(latest.date)}</p><small>Referência: ${escapeHtml(latest.id)}</small>` : '<div class="empty"><h2>Aguardando o primeiro movimento.</h2><p>A integração CAIXA ainda não está conectada. Simule um recebimento para testar esta tela.</p></div>';
  $('#cashier-history').innerHTML = paymentTable(payments.slice(0,5));
}
function renderNotices() {
  if(!state) return;
  const filter = $('#notice-filter').value;
  const notices = state.notices.filter(notice => !filter || notice.status === filter);
  $('#notices').innerHTML = notices.length ? notices.map(notice => `<article class="notice"><div><strong>${escapeHtml(notice.name)} <span class="role-tag">${escapeHtml(notice.role)}</span></strong><div class="notice-meta">+${escapeHtml(notice.phone)} · ${date(notice.date)} às ${time(notice.date)} · ${escapeHtml(storeName(notice.storeId))}</div><p><span class="status ${notice.status === 'opened' ? 'neutral' : ''}">${notice.status === 'opened' ? 'Link acessado · envio não confirmado' : 'Mensagem preparada'}</span></p>${notice.openCount ? `<small class="notice-meta">${notice.openCount} acesso(s) ao link · Último: ${date(notice.lastOpenedAt)} às ${time(notice.lastOpenedAt)}</small>` : ''}<details><summary>Ver mensagem</summary><pre>${escapeHtml(notice.message)}</pre></details></div><a class="button secondary" data-open-notice="${escapeHtml(notice.id)}" href="https://wa.me/${encodeURIComponent(notice.phone)}?text=${encodeURIComponent(notice.message)}" target="_blank" rel="noopener noreferrer">${notice.status === 'opened' ? 'Abrir novamente' : 'Abrir WhatsApp'} ↗</a></article>`).join('') : '<div class="empty">Nenhum aviso nesta seleção.<br>Cadastre um destinatário ativo e simule um recebimento na loja dele.</div>';
}
function render() {
  if(!state) return;
  const today = businessDate(new Date());
  const paymentsToday = state.payments.filter(payment => businessDate(payment.date) === today);
  $('#total-today').textContent = money(paymentsToday.reduce((sum,payment) => sum+payment.amount,0));
  $('#count-today').textContent = paymentsToday.length;
  $('#team-total').textContent = state.members.length;
  const activeCount = state.members.filter(member => member.active).length;
  $('#team-active').textContent = `${activeCount} ${activeCount === 1 ? 'pessoa com avisos ativados' : 'pessoas com avisos ativados'}`;
  $('#notice-total').textContent = state.notices.length;
  $('#payment-count').textContent = state.payments.length;
  $('#sidebar-business').textContent = state.business;
  if(document.activeElement !== $('#business-name')) $('#business-name').value = state.business;
  $('#session-user').textContent = `Administrador conectado: ${currentUser}`;
  $('#recent-payments').innerHTML = paymentTable(state.payments.slice(0,5));
  const members = [...state.members].sort((a,b) => Number(b.active)-Number(a.active));
  $('#team-preview').innerHTML = members.length ? members.slice(0,3).map(member => memberRow(member)).join('') : '<div class="empty">Cadastre a primeira pessoa da sua equipe.</div>';
  $('#team-list').innerHTML = state.members.length ? state.members.map(member => memberRow(member,true)).join('') : '<div class="empty">Adicione uma pessoa para preparar os avisos.</div>';
  $('#stores-list').innerHTML = state.stores.map(store => `<div class="integration"><span>${escapeHtml(store.name)}</span><span class="role-tag">${state.members.filter(member => member.storeId === store.id || member.storeId === '*').length} destinatário(s)</span></div>`).join('');
  options('#filter-store','Todas as lojas'); options('#cashier-store','Todas as lojas');
  renderPayments(); renderCashier(); renderNotices();
}
const pages = {
  inicio:['Visão geral','Tudo certo com o seu Pix.','Acompanhe os recebimentos e mantenha toda a equipe informada.'],
  recebimentos:['Recebimentos','Cada Pix, em um só lugar.','Encontre pagamentos por pagador, referência, valor, data e loja.'],
  caixa:['Tela do caixa','Confira o Pix sem pedir uma foto.','Valor e horário em destaque. Nesta versão, todos os movimentos são simulados.'],
  equipe:['Minha equipe','As pessoas certas, informadas.','Edite os destinatários e escolha a loja que cada pessoa acompanha.'],
  avisos:['Avisos WhatsApp','Um aviso para cada pessoa.','Acompanhe as mensagens preparadas e os acessos ao WhatsApp.'],
  configuracoes:['Configurações','Do jeito do seu negócio.','Gerencie a empresa, suas lojas e o andamento das integrações.'],
};
function navigate() {
  const page = Object.hasOwn(pages,location.hash.slice(1)) ? location.hash.slice(1) : 'inicio';
  document.querySelectorAll('.page').forEach(element => { element.hidden = element.id !== `page-${page}`; });
  document.querySelectorAll('[data-page]').forEach(element => { element.classList.toggle('active',element.dataset.page === page); if(element.dataset.page === page) element.setAttribute('aria-current','page'); else element.removeAttribute('aria-current'); });
  [$('#breadcrumb').textContent,$('#page-title').textContent,$('#page-description').textContent] = pages[page];
}
function openMember(member) {
  const form = $('#member-form'); form.reset(); options('#member-store','Todas as lojas');
  if(member) for(const field of ['id','name','phone','role','storeId']) form.elements[field].value = member[field];
  $('#member-title').textContent = member ? 'Editar pessoa' : 'Adicionar pessoa';
  $('#member-error').textContent = ''; $('#member-dialog').showModal();
}
// Cada formulário mantém o próprio erro e impede cliques repetidos durante o envio.
function onSubmit(selector,errorSelector,handler) {
  $(selector).addEventListener('submit',async event => {
    event.preventDefault();
    const button = event.target.querySelector('[type="submit"], button:not([type])');
    if(button.disabled) return;
    button.disabled = true; if(errorSelector) $(errorSelector).textContent = '';
    try { await handler(new FormData(event.target),event.target); }
    catch(error) { if(errorSelector) $(errorSelector).textContent = error.message; else toast(error.message); }
    finally { button.disabled = false; }
  });
}
onSubmit('#auth-form','#auth-error',async form => {
  const result = await api(setupRequired ? 'setup' : 'login',Object.fromEntries(form));
  currentUser = result.username; $('#auth-form').elements.password.value = '';
  state = await api('state'); $('#auth-screen').hidden = true; $('#app-shell').hidden = false; render(); navigate();
});
onSubmit('#member-form','#member-error',async form => {
  await perform({type:'member',...Object.fromEntries(form)});
  $('#member-dialog').close(); toast('Pessoa salva. Os próximos avisos usarão este cadastro.');
});
onSubmit('#payment-form','#payment-error',async form => {
  const before = state.notices.length;
  await perform({type:'simulate',...Object.fromEntries(form),amount:Number(form.get('amount')),requestId:simulationRequestId});
  $('#payment-dialog').close(); toast(`Pix simulado. ${state.notices.length-before} aviso(s) preparado(s). Nenhuma mensagem enviada automaticamente.`);
});
onSubmit('#business-form',null,async () => { await perform({type:'business',name:$('#business-name').value}); toast('Nome da empresa salvo.'); });
onSubmit('#store-form',null,async (form,element) => { await perform({type:'store',name:form.get('name')}); element.reset(); toast('Loja cadastrada.'); });
$('#add-member').addEventListener('click',() => openMember());
$('#add-member-home').addEventListener('click',() => openMember());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click',() => button.closest('dialog').close()));
$('#simulate').addEventListener('click',() => { $('#payment-form').reset(); options('#payment-store'); simulationRequestId=crypto.randomUUID(); $('#payment-error').textContent=''; $('#payment-dialog').showModal(); });
$('#team-list').addEventListener('click',async event => {
  const button = event.target.closest('button'); if(!button || !state) return;
  const {edit,toggle,remove} = button.dataset;
  try {
    if(edit) openMember(state.members.find(member => member.id === edit));
    if(toggle) await perform({type:'toggle',id:toggle});
    if(remove && confirm('Remover esta pessoa da equipe? Os avisos preparados continuarão no histórico.')) await perform({type:'remove',id:remove});
  } catch(error) { toast(error.message); }
});
$('#notices').addEventListener('click',event => {
  const link = event.target.closest('[data-open-notice]');
  if(link) perform({type:'openNotice',id:link.dataset.openNotice}).catch(error => toast(`O link foi acionado, mas não foi possível registrar o acesso: ${error.message}`));
});
for(const id of ['search','filter-date','filter-amount']) $(`#${id}`).addEventListener('input',renderPayments);
$('#filter-store').addEventListener('change',renderPayments);
$('#clear-filters').addEventListener('click',() => { for(const id of ['search','filter-store','filter-date','filter-amount']) $(`#${id}`).value=''; renderPayments(); });
$('#cashier-store').addEventListener('change',renderCashier);
$('#cashier-terminal').addEventListener('input',renderCashier);
$('#notice-filter').addEventListener('change',renderNotices);
$('#refresh').addEventListener('click',() => refresh().catch(error => toast(error.message)));
$('#logout').addEventListener('click',async () => { try { await api('logout',{}); showAuth(false); } catch(error) { toast(error.message); } });
window.addEventListener('hashchange',navigate);
setInterval(() => { if(!document.hidden && state && !document.querySelector('dialog[open]')) refresh().catch(() => {}); },15000);
async function boot() {
  try {
    const session = await api('session');
    if(!session.authenticated) { showAuth(session.setupRequired); return; }
    currentUser=session.username; state=await api('state'); $('#auth-screen').hidden=true; $('#app-shell').hidden=false; render(); navigate();
  } catch(error) { $('#auth-title').textContent='Não conseguimos conectar.'; $('#auth-description').textContent=`${error.message} Confira o servidor e recarregue a página.`; }
}
boot();
