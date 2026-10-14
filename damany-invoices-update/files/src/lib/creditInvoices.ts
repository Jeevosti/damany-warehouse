import {parseDay, today} from './warranty';

export const MAX_INVOICE_CENTS = 9_000_000_000_000;
export const paymentMethods = ['M-Pesa', 'Cash', 'Bank transfer', 'Card', 'Other'] as const;
export type PaymentMethod = typeof paymentMethods[number];
export type InvoiceStatus = 'Unpaid' | 'Part paid' | 'Paid' | 'Overdue' | 'Voided';
export interface CreditLine {description: string; quantity: number; unit_price_cents: number}
export interface CreditPayment {
  id: string; invoice_id: string; amount_cents: number; paid_on: string;
  method: PaymentMethod; reference: string; created_at: string;
  reversed_at: string | null; reversal_reason: string | null;
}
export interface CreditInvoice {
  id: string; invoice_number: string; client_id: string; issuer_name: string;
  customer: {name: string; phone: string; email: string; location_address: string};
  issued_on: string; due_on: string; notes: string; total_cents: number;
  created_at: string; voided_at: string | null; void_reason: string | null;
  items: CreditLine[]; payments: CreditPayment[];
}
export interface CreateCreditInvoice {
  request_id: string; client_id: string; issuer_name: string;
  issued_on: string; due_on: string; notes: string; items: CreditLine[];
}
export interface RecordCreditPayment {
  request_id: string; invoice_id: string; amount_cents: number;
  paid_on: string; method: PaymentMethod; reference: string;
}

// Currency is kept in whole cents, never summed as floating-point shillings.
export function moneyToCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter an amount with at most two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > MAX_INVOICE_CENTS) throw new Error('The amount is too large.');
  return result;
}
export function invoiceTotal(items: CreditLine[]): number {
  if (!items.length || items.length > 100) throw new Error('Add between 1 and 100 invoice items.');
  let result = 0;
  for (const item of items) {
    if (!item.description.trim() || item.description.length > 300) throw new Error('Each item needs a description of up to 300 characters.');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1_000_000) throw new Error('Use a whole-number quantity between 1 and 1,000,000.');
    if (!Number.isSafeInteger(item.unit_price_cents) || item.unit_price_cents < 0) throw new Error('Item prices cannot be negative.');
    result += item.quantity * item.unit_price_cents;
    if (!Number.isSafeInteger(result) || result > MAX_INVOICE_CENTS) throw new Error('The invoice total is too large.');
  }
  if (result < 1) throw new Error('The invoice total must be greater than zero.');
  return result;
}
export function validateCreditInvoice(input: CreateCreditInvoice, asOf = today()) {
  if (!input.client_id) throw new Error('Select a customer.');
  if (!input.issuer_name.trim() || input.issuer_name.length > 120) throw new Error('Enter your business name (up to 120 characters).');
  parseDay(input.issued_on); parseDay(input.due_on);
  if (input.issued_on > asOf) throw new Error('The invoice date cannot be in the future.');
  if (input.due_on < input.issued_on) throw new Error('The due date cannot be before the invoice date.');
  if (input.notes.length > 2000) throw new Error('Keep invoice notes under 2,000 characters.');
  return invoiceTotal(input.items);
}
export function paidCents(invoice: CreditInvoice) {
  return invoice.payments.filter(payment => !payment.reversed_at).reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
}
export function balanceCents(invoice: CreditInvoice) {return invoice.voided_at ? 0 : Number(invoice.total_cents) - paidCents(invoice);}
export function invoiceStatus(invoice: CreditInvoice, asOf = today()): InvoiceStatus {
  if (invoice.voided_at) return 'Voided';
  if (balanceCents(invoice) === 0) return 'Paid';
  if (invoice.due_on < asOf) return 'Overdue';
  return paidCents(invoice) > 0 ? 'Part paid' : 'Unpaid';
}
export function validateCreditPayment(invoice: CreditInvoice, input: RecordCreditPayment, asOf = today()) {
  if (invoice.voided_at) throw new Error('This invoice has been voided.');
  if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) throw new Error('Enter a payment greater than zero.');
  if (input.amount_cents > balanceCents(invoice)) throw new Error('The payment exceeds the outstanding balance. Refresh the invoice and check the amount.');
  parseDay(input.paid_on);
  if (input.paid_on < invoice.issued_on || input.paid_on > asOf) throw new Error('Choose a payment date between the invoice date and today.');
  if (!paymentMethods.includes(input.method)) throw new Error('Choose a payment method.');
  if (input.reference.length > 120) throw new Error('Keep the payment reference under 120 characters.');
}
export function creditMoney(cents: number) {return new Intl.NumberFormat('en-KE', {style: 'currency', currency: 'KES', minimumFractionDigits: 2, maximumFractionDigits: 2}).format(cents / 100);}
export function creditDueDate(issuedOn: string, days = 30) {const d = parseDay(issuedOn); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);}
export function creditError(error: unknown): string {
  const item = error as {message?: string; code?: string};
  if (['PGRST202', '42P01', '42883'].includes(item?.code || '')) return 'Invoices need a database update. Run 202610140001_credit_invoices.sql in your Supabase SQL Editor, then try again.';
  if (item?.code === '42501') return 'You do not have access to this invoice. Sign in again and try again.';
  return item?.message || 'The invoice could not be saved. Check your connection and try again.';
}
