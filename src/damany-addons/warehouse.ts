import type {InventoryItem, InventoryUnit, Snapshot} from '../lib/types';
import {parseDay} from '../lib/warranty';
export interface WarehouseAccess {owner_id: string; role: 'admin' | 'viewer'; is_owner: boolean}
export interface WarehouseLocation {id: string; name: string; is_main: boolean; created_at: string}
export interface WarehouseMember {user_id: string; email: string; role: 'admin' | 'viewer'; is_owner: boolean}
export type WarehouseItem = InventoryItem & {sku?: string | null};
export type WarehouseUnit = Omit<InventoryUnit, 'state'> & {location_id: string; state: InventoryUnit['state'] | 'Dispatched'};
export type WarehouseSnapshot = Omit<Snapshot, 'inventory_items' | 'inventory_units'> & {inventory_items: WarehouseItem[]; inventory_units: WarehouseUnit[]};
export interface MovementInput {request_id: string; kind: 'Receipt' | 'Dispatch' | 'Transfer'; is_sale: boolean; business_date: string; source_id: string | null; target_id: string | null; party: string; reference: string; notes: string; lines: {item_id: string; quantity: number; serials: string[]; unit_sale_cents: number}[]}
export interface WarehouseOperation extends Omit<MovementInput, 'lines' | 'request_id'> {id: string; actor_email: string; actor_id: string; sale_total_cents: number; created_at: string; payload: MovementInput}
export interface WarehouseMovement {id: number; operation_id: string | null; unit_id: string; item_id: string; item_name: string; serial_number: string | null; event_type: string; from_state: string | null; to_state: string; from_location: string | null; to_location: string | null; business_date: string; actor_email: string; unit_sale_cents: number; recorded_at: string}
export function parseWarehouseCode(raw: string): {sku: string; serial: string; plain: string} {
  const text = raw.trim(); if (!text || text.length > 1000) throw new Error('Scan a product code or serial number of up to 1,000 characters.');
  if (text.startsWith('{')) {
    let object: unknown; try {object = JSON.parse(text);} catch {throw new Error('This QR code contains invalid JSON. Use SKU/serial text or {"sku":"…","serial":"…"}.');}
    const value = object as {sku?: unknown; serial?: unknown};
    if (!value || (value.sku !== undefined && typeof value.sku !== 'string') || (value.serial !== undefined && typeof value.serial !== 'string')) throw new Error('The QR SKU and serial must be text.');
    const sku = String(value.sku || '').trim().toUpperCase(), serial = String(value.serial || '').trim().toUpperCase();
    if ((!sku && !serial) || sku.length > 100 || serial.length > 200) throw new Error('QR must contain a SKU (up to 100 characters) or serial (up to 200 characters).');
    return {sku, serial, plain: ''};
  }
  if (/^https?:\/\//i.test(text)) throw new Error('This QR code is a web link. Enter its product SKU/serial instead; links are not opened.');
  if (text.length > 200) throw new Error('Use a SKU or serial of up to 200 characters.');
  return {sku: '', serial: '', plain: text.toUpperCase()};
}
export function movementSummary(rows: WarehouseMovement[]) {
  return rows.reduce((result, row) => {
    if (row.event_type === 'Receipt') result.received++;
    if (row.event_type === 'Transfer') result.transferred++;
    if (row.event_type === 'Sale') {result.sold++; result.sale_cents += Number(row.unit_sale_cents);}
    if (row.event_type === 'Dispatch') result.dispatched++;
    if (row.event_type === 'Installation') result.installed++;
    if (row.event_type === 'Fault return') result.faulty++;
    return result;
  }, {received: 0, transferred: 0, sold: 0, dispatched: 0, installed: 0, faulty: 0, sale_cents: 0});
}
export function validateReportPeriod(from: string, to: string) {const days = (parseDay(to).getTime() - parseDay(from).getTime()) / 86400000; if (days < 0 || days > 366) throw new Error('Choose an end date on/after the start, within 366 days.');}
export function warehouseCSV(rows: Record<string, string | number>[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (value: string | number) => {let text = String(value); if (typeof value === 'string' && /^\s*[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`;};
  return '\ufeff' + [keys.map(escape).join(','), ...rows.map(row => keys.map(key => escape(row[key] ?? '')).join(','))].join('\r\n');
}
export function warehouseError(error: unknown) {
  const e = error as {code?: string; message?: string};
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(e?.code || '')) return `${e.message || 'A required database table or function could not be found.'} [${e.code}]`;
  if (e?.code === '23505') return 'This SKU, serial or location is already registered. Check the code and existing records.';
  return e?.message || 'The warehouse action could not be completed.';
}
