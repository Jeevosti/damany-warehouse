import {supabase} from './supabase';
import type {Client} from '../lib/types';
import type {CreditInvoice, CreateCreditInvoice, RecordCreditPayment} from '../lib/creditInvoices';
import {paidCents, validateCreditInvoice, validateCreditPayment} from '../lib/creditInvoices';

type StoredInvoice = CreditInvoice & {create_payload: CreateCreditInvoice};
export function creditApi(mode: 'live' | 'demo', userId: string, clients: Client[]) {
  const key = `damany-credit-invoices-v1:${userId}`;
  const read = (): StoredInvoice[] => {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const result = JSON.parse(stored);
    if (!Array.isArray(result)) throw new Error('The saved demo invoices could not be read.');
    return result;
  };
  const write = (invoices: StoredInvoice[]) => localStorage.setItem(key, JSON.stringify(invoices));
  const rpc = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    const client = supabase();
    if (!client) throw new Error('Sign in to manage invoices.');
    const {data, error} = await client.rpc(name, args);
    if (error) throw error;
    return data as T;
  };
  return {
    async load(): Promise<CreditInvoice[]> {
      if (mode === 'live') return rpc<CreditInvoice[]>('get_credit_invoices');
      return read();
    },
    async create(input: CreateCreditInvoice): Promise<string> {
      validateCreditInvoice(input);
      if (mode === 'live') return rpc<string>('create_credit_invoice', {p_input: input});
      const invoices = read();
      const existing = invoices.find(invoice => invoice.id === input.request_id);
      if (existing) {
        if (JSON.stringify(existing.create_payload) !== JSON.stringify(input)) throw new Error('This invoice was already saved. Refresh before making another invoice.');
        return existing.id;
      }
      const customer = clients.find(client => client.id === input.client_id);
      if (!customer) throw new Error('This customer is no longer available.');
      const year = input.issued_on.slice(0, 4);
      const sequence = invoices.filter(invoice => invoice.issued_on.startsWith(year)).length + 1;
      const invoice: StoredInvoice = {
        id: input.request_id, invoice_number: `DEMO-${year}-${String(sequence).padStart(5, '0')}`,
        client_id: customer.id, customer: {name: customer.name, phone: customer.phone, email: customer.email, location_address: customer.location_address},
        issuer_name: input.issuer_name.trim(), issued_on: input.issued_on, due_on: input.due_on, notes: input.notes,
        total_cents: validateCreditInvoice(input), items: input.items.map(item => ({...item})), payments: [],
        created_at: new Date().toISOString(), voided_at: null, void_reason: null, create_payload: input,
      };
      write([invoice, ...invoices]);
      return invoice.id;
    },
    async pay(input: RecordCreditPayment): Promise<string> {
      if (mode === 'live') return rpc<string>('record_credit_payment', {p_input: input});
      const invoices = read();
      const existing = invoices.flatMap(invoice => invoice.payments).find(payment => payment.id === input.request_id);
      if (existing) {
        if (existing.invoice_id !== input.invoice_id || existing.amount_cents !== input.amount_cents || existing.paid_on !== input.paid_on || existing.method !== input.method || existing.reference !== input.reference) throw new Error('This payment was already recorded. Refresh before recording another payment.');
        return existing.id;
      }
      const invoice = invoices.find(invoice => invoice.id === input.invoice_id);
      if (!invoice) throw new Error('Invoice not found.');
      validateCreditPayment(invoice, input);
      invoice.payments.push({id: input.request_id, invoice_id: invoice.id, amount_cents: input.amount_cents, paid_on: input.paid_on, method: input.method, reference: input.reference, created_at: new Date().toISOString(), reversed_at: null, reversal_reason: null});
      write(invoices);
      return input.request_id;
    },
    async voidInvoice(id: string, reason: string) {
      if (mode === 'live') return rpc('void_credit_invoice', {p_invoice_id: id, p_reason: reason});
      if (!reason.trim() || reason.length > 500) throw new Error('Enter a reason of up to 500 characters.');
      const invoices = read(), invoice = invoices.find(item => item.id === id);
      if (!invoice) throw new Error('Invoice not found.');
      if (paidCents(invoice) > 0) throw new Error('Reverse any recorded payments before voiding this invoice.');
      if (!invoice.voided_at) {invoice.voided_at = new Date().toISOString(); invoice.void_reason = reason.trim(); write(invoices);}
    },
    async reversePayment(id: string, reason: string) {
      if (mode === 'live') return rpc('reverse_credit_payment', {p_payment_id: id, p_reason: reason});
      if (!reason.trim() || reason.length > 500) throw new Error('Enter a reason of up to 500 characters.');
      const invoices = read(), payment = invoices.flatMap(invoice => invoice.payments).find(item => item.id === id);
      if (!payment) throw new Error('Payment not found.');
      if (!payment.reversed_at) {payment.reversed_at = new Date().toISOString(); payment.reversal_reason = reason.trim(); write(invoices);}
    },
  };
}
