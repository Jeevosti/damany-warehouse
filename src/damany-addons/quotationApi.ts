import {supabase} from '../services/supabase';
import {prepareQuotation, quotationNumber, quotationTotals} from './solarQuotation';
import type {QuoteDraft, QuoteStatus, SavedQuotation} from './solarQuotation';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function quotationApi(mode: 'demo' | 'live', userId: string) {
  const storageKey = `damany-quotations-v1:${userId}`;
  function client() {const db = supabase(); if (!db) throw new Error('Sign in to save a quotation.'); return db;}
  function read(): SavedQuotation[] {const data = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (!Array.isArray(data)) throw new Error('Saved demo quotations could not be read.'); return data;}
  function write(data: SavedQuotation[]) {localStorage.setItem(storageKey, JSON.stringify(data));}
  return {
    async load(): Promise<SavedQuotation[]> {
      if (!userId) throw new Error('Sign in to view quotations.');
      if (mode === 'demo') return read();
      // Explicit pagination avoids silently hiding records at the Data API row cap.
      const rows: SavedQuotation[] = [];
      for (let offset = 0; ; offset += 100) {
        const {data, error} = await client().from('installation_quotations').select('id,quote_number,status,document,total_cents,created_at').order('created_at', {ascending: false}).order('id').range(offset, offset + 99);
        if (error) throw error;
        rows.push(...(data as SavedQuotation[]));
        if (data.length < 100) return rows;
      }
    },
    async save(id: string, draft: QuoteDraft): Promise<SavedQuotation> {
      if (!userId) throw new Error('Sign in to save a quotation.');
      const document = prepareQuotation(draft), total = quotationTotals(document.lines, document.discount_cents, document.tax_bps, document.deposit_bps).total_cents;
      if (mode === 'demo') {
        const rows = read(), previous = rows.find(row => row.id === id);
        if (previous) {if (canonical(previous.document) !== canonical(document)) throw new Error('This quotation was already saved. Create a revised copy.'); return previous;}
        const row: SavedQuotation = {id, quote_number: quotationNumber(id), status: 'Prepared', document, total_cents: total, created_at: new Date().toISOString()};
        write([row, ...rows]); return row;
      }
      const {data, error} = await client().from('installation_quotations').insert({id, document}).select('id,quote_number,status,document,total_cents,created_at').single();
      if (!error) return data as SavedQuotation;
      if (error.code === '23505') {
        const result = await client().from('installation_quotations').select('id,quote_number,status,document,total_cents,created_at').eq('id', id).maybeSingle();
        if (!result.error && result.data && canonical(result.data.document) === canonical(document)) return result.data as SavedQuotation;
      }
      throw error;
    },
    async setStatus(id: string, status: QuoteStatus): Promise<void> {
      if (!['Prepared', 'Sent', 'Accepted', 'Declined'].includes(status)) throw new Error('Choose a valid quotation status.');
      if (mode === 'demo') {const rows = read(), row = rows.find(item => item.id === id); if (!row) throw new Error('Quotation not found.'); row.status = status; write(rows); return;}
      const {data, error} = await client().from('installation_quotations').update({status}).eq('id', id).select('id').single();
      if (error) throw error; if (!data) throw new Error('Quotation not found.');
    },
  };
}
