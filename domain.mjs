export const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export function normalizePhone(input) {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  if (!/^55[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(digits)) throw new Error('Informe um WhatsApp válido com DDD. Ex.: (63) 99999-1234.');
  return digits;
}
export function paymentMessage(payment, business) {
  return `Pix recebido • ${business}\n\nValor: ${money(payment.amount)}\nPagador: ${payment.payer}\nLoja: ${payment.storeName || 'Loja principal'}\nCaixa: ${payment.terminal || 'Caixa principal'}\nData: ${new Date(payment.date).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})}\nReferência: ${payment.id}\n\nDEMONSTRAÇÃO — pagamento fictício, sem confirmação bancária.`;
}

export const businessDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export function createDemoState() {
  return { business: 'Minha empresa', stores: [{id:'principal',name:'Loja principal'}], members: [], notices: [], payments: [] };
}
export function text(value, label, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label}: informe de 1 a ${max} caracteres.`);
  return value.trim();
}
function requireStore(state, id, allowAll = false) {
  if (allowAll && id === '*') return;
  const store = state.stores.find(s => s.id === id);
  if (!store) throw new Error('Selecione uma loja cadastrada.');
  return store;
}
export function applyAction(state, action, uuid = () => crypto.randomUUID()) {
  switch (action.type) {
    case 'business': state.business = text(action.name, 'Nome da empresa', 70); break;
    case 'store': {
      const name = text(action.name, 'Nome da loja', 60);
      if (state.stores.some(s => s.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new Error('Esta loja já está cadastrada.');
      state.stores.push({id:uuid(),name}); break;
    }
    case 'member': {
      const previous = action.id ? state.members.find(m => m.id === action.id) : null;
      if (action.id && !previous) throw new Error('Pessoa não encontrada. Atualize o painel.');
      const name = text(action.name, 'Nome', 60);
      const phone = normalizePhone(text(action.phone, 'WhatsApp', 25));
      if (!['Dono(a)','Gerente','Caixa','Outro'].includes(action.role)) throw new Error('Selecione uma função válida.');
      requireStore(state, action.storeId, true);
      if (state.members.some(m => m.id !== action.id && m.phone === phone)) throw new Error('Este WhatsApp já está cadastrado na equipe.');
      const member = {id:previous?.id || uuid(),name,phone,role:action.role,storeId:action.storeId,active:previous?.active ?? true};
      if (previous) state.members[state.members.indexOf(previous)] = member; else state.members.push(member);
      break;
    }
    case 'toggle': {
      const member = state.members.find(m => m.id === action.id);
      if (!member) throw new Error('Pessoa não encontrada.');
      member.active = !member.active; break;
    }
    case 'remove': state.members = state.members.filter(m => m.id !== action.id); break;
    case 'simulate': {
      const requestId = text(action.requestId, 'Identificador da simulação', 80);
      if (state.payments.some(p => p.requestId === requestId)) return state;
      const store = requireStore(state, action.storeId);
      const payer = text(action.payer, 'Pagador');
      const amount = action.amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < .01 || amount > 1000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > .00001) throw new Error('Informe um valor entre R$ 0,01 e R$ 1.000.000,00, com até duas casas decimais.');
      const terminal = text(action.terminal, 'Nome do caixa', 40);
      const payment = {id:`DEMO-${uuid()}`,requestId,payer,amount:Math.round(amount*100)/100,date:new Date().toISOString(),storeId:store.id,storeName:store.name,terminal,status:'simulated'};
      state.payments.unshift(payment);
      const recipients = state.members.filter(m => m.active && (m.storeId === '*' || m.storeId === store.id));
      state.notices.unshift(...recipients.map(m => ({id:uuid(),paymentId:payment.id,name:m.name,role:m.role,phone:m.phone,storeId:store.id,date:payment.date,message:paymentMessage(payment,state.business),status:'prepared',openCount:0})));
      break;
    }
    case 'openNotice': {
      const notice = state.notices.find(n => n.id === action.id);
      if (!notice) throw new Error('Aviso não encontrado.');
      notice.status = 'opened'; notice.openCount++; notice.lastOpenedAt = new Date().toISOString(); break;
    }
    default: throw new Error('Operação não disponível.');
  }
  return state;
}
