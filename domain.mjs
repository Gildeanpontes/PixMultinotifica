export const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export function normalizePhone(input) {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  if (!/^55[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(digits)) throw new Error('Informe um WhatsApp válido com DDD. Ex.: (63) 99999-1234.');
  return digits;
}
export function paymentMessage(payment, business) {
  return `Pix recebido • ${business}\n\nValor: ${money(payment.amount)}\nPagador: ${payment.payer}\nData: ${new Date(payment.date).toLocaleString('pt-BR')}\nReferência: ${payment.id}\n\nDEMONSTRAÇÃO — pagamento fictício, sem confirmação bancária.`;
}
