import {beforeEach, describe, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {balanceCents, creditDueDate, invoiceStatus, invoiceTotal, moneyToCents, paidCents, validateCreditInvoice, validateCreditPayment} from '../src/lib/creditInvoices';
import type {CreateCreditInvoice, CreditInvoice} from '../src/lib/creditInvoices';
import {creditApi} from '../src/services/creditInvoices';
import {InvoiceDocument} from '../src/pages/Invoices';
import {today} from '../src/lib/warranty';
vi.mock('../src/services/supabase', () => ({supabase: () => null}));

const client = {id: 'customer-a', name: 'Test Customer', phone: '0700000000', email: 'customer@example.test', location_address: 'Nairobi', gps_coordinates: '', created_at: ''};
function draft(): CreateCreditInvoice {return {request_id: crypto.randomUUID(), client_id: client.id, issuer_name: 'Damany', issued_on: today(), due_on: creditDueDate(today()), notes: '', items: [{description: 'Cable', quantity: 3, unit_price_cents: 10010}]};}
function record(): CreditInvoice {return {id: 'invoice', invoice_number: 'INV-2026-00001', client_id: client.id, customer: client, issuer_name: 'Damany', issued_on: '2026-01-01', due_on: '2026-01-31', notes: '', total_cents: 30030, items: draft().items, payments: [], created_at: '', voided_at: null, void_reason: null};}
beforeEach(() => {const storage = new Map<string, string>(); vi.stubGlobal('localStorage', {getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value)});});

describe('credit invoice calculations', () => {
  it('preserves cents exactly and rejects ambiguous amounts', () => {
    expect(moneyToCents('0.10') + moneyToCents('0.20')).toBe(30);
    expect(moneyToCents('120.5')).toBe(12050);
    for (const value of ['', '-1', '1.001', '1,200', '1e3', 'NaN', '900000000000000']) expect(() => moneyToCents(value)).toThrow();
    expect(invoiceTotal([{description: 'Cable', quantity: 3, unit_price_cents: 10010}])).toBe(30030);
  });
  it('rejects empty, fractional, negative, zero-total and oversized invoices', () => {
    expect(() => invoiceTotal([])).toThrow();
    for (const line of [{description: '', quantity: 1, unit_price_cents: 100}, {description: 'Item', quantity: 1.5, unit_price_cents: 100}, {description: 'Item', quantity: 1, unit_price_cents: -1}, {description: 'Item', quantity: 1, unit_price_cents: 0}, {description: 'Item', quantity: 1000000, unit_price_cents: 9000000000000}]) expect(() => invoiceTotal([line])).toThrow();
  });
  it('handles calendar dates and does not mark invoices overdue on their due date', () => {
    expect(creditDueDate('2024-01-31', 30)).toBe('2024-03-01');
    const invoice = record();
    expect(invoiceStatus(invoice, '2026-01-31')).toBe('Unpaid');
    expect(invoiceStatus(invoice, '2026-02-01')).toBe('Overdue');
    expect(() => validateCreditInvoice({...draft(), issued_on: '2026-02-30'})).toThrow();
    expect(() => validateCreditInvoice({...draft(), due_on: '2020-01-01'})).toThrow();
  });
  it('handles partial payments, full payments, reversals and voids', () => {
    const invoice = record();
    const payment = {id: 'p', invoice_id: invoice.id, amount_cents: 10010, paid_on: '2026-01-20', method: 'Cash' as const, reference: '', created_at: '', reversed_at: null, reversal_reason: null};
    invoice.payments.push(payment);
    expect(paidCents(invoice)).toBe(10010); expect(balanceCents(invoice)).toBe(20020);
    expect(invoiceStatus(invoice, '2026-01-25')).toBe('Part paid');
    expect(invoiceStatus(invoice, '2026-02-01')).toBe('Overdue');
    invoice.payments.push({...payment, id: 'p2', amount_cents: 20020});
    expect(invoiceStatus(invoice, '2026-02-01')).toBe('Paid');
    invoice.payments[1].reversed_at = '2026-02-01';
    expect(balanceCents(invoice)).toBe(20020);
    invoice.voided_at = '2026-02-01'; expect(balanceCents(invoice)).toBe(0); expect(invoiceStatus(invoice)).toBe('Voided');
  });
  it('rejects overpayments, invalid payment dates and payments on void invoices', () => {
    const invoice = record(), payment = {request_id: 'p', invoice_id: invoice.id, amount_cents: 30031, paid_on: '2026-01-20', method: 'Cash' as const, reference: ''};
    expect(() => validateCreditPayment(invoice, payment, '2026-01-25')).toThrow(/balance/);
    expect(() => validateCreditPayment(invoice, {...payment, amount_cents: 1, paid_on: '2026-01-26'}, '2026-01-25')).toThrow(/date/);
    expect(() => validateCreditPayment(invoice, {...payment, amount_cents: 1, paid_on: '2025-12-31'}, '2026-01-25')).toThrow(/date/);
    invoice.voided_at = '2026-01-25'; expect(() => validateCreditPayment(invoice, {...payment, amount_cents: 1})).toThrow(/voided/);
  });
});

describe('demo credit ledger', () => {
  it('persists invoices per signed-in account and freezes customer details', async () => {
    const api = creditApi('demo', 'user-a', [client]), input = draft();
    const id = await api.create(input);
    expect((await api.load())[0].id).toBe(id);
    expect(await creditApi('demo', 'user-b', [client]).load()).toEqual([]);
    expect((await creditApi('demo', 'user-a', [{...client, name: 'Changed'}]).load())[0].customer.name).toBe('Test Customer');
    expect(await api.create(input)).toBe(id); expect(await api.load()).toHaveLength(1);
    await expect(api.create({...input, notes: 'changed'})).rejects.toThrow(/already saved/);
  });
  it('prevents duplicate payment retries, overpayments and deletion of paid balances', async () => {
    const api = creditApi('demo', 'user-a', [client]), id = await api.create(draft());
    const payment = {request_id: crypto.randomUUID(), invoice_id: id, amount_cents: 10000, paid_on: today(), method: 'M-Pesa' as const, reference: 'TEST'};
    await api.pay(payment); await api.pay(payment);
    expect((await api.load())[0].payments).toHaveLength(1);
    await expect(api.pay({...payment, request_id: crypto.randomUUID(), amount_cents: 30030})).rejects.toThrow(/balance/);
    await expect(api.voidInvoice(id, 'Wrong invoice')).rejects.toThrow(/Reverse/);
    await api.reversePayment(payment.request_id, 'Wrong entry'); await api.reversePayment(payment.request_id, 'Second retry');
    expect(balanceCents((await api.load())[0])).toBe(30030);
    await api.voidInvoice(id, 'Wrong customer');
    expect(invoiceStatus((await api.load())[0])).toBe('Voided');
    expect((await api.load())[0].payments[0].reversal_reason).toBe('Wrong entry');
  });
});

it('prints the correct balance and safely escapes customer-supplied content', () => {
  const invoice = record(); invoice.notes = '<img src=x onerror=alert(1)>'; invoice.customer = {...client, name: '<script>bad()</script>'};
  const html = renderToStaticMarkup(createElement(InvoiceDocument, {invoice, demo: true}));
  expect(html).toContain('DEMO — SAMPLE RECORD'); expect(html).toContain('Balance due'); expect(html).toContain('300.30');
  expect(html).not.toContain('<script>'); expect(html).not.toContain('<img src=x'); expect(html).toContain('&lt;img');
});
