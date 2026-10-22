import {parseDay, today} from '../lib/warranty';

export const QUOTE_LIMIT = 9_000_000_000_000;
export type QuoteStatus = 'Prepared' | 'Sent' | 'Accepted' | 'Declined';
export interface QuoteContact {name: string; phone: string; email: string; address: string}
export interface QuoteLoad {id: string; name: string; quantity: number; watts: number; hours: number; backup_hours: number; simultaneous: boolean}
export interface QuoteDemand {mode: 'appliances' | 'known'; loads: QuoteLoad[]; peak_kw: number; daily_kwh: number; backup_kw: number; backup_hours: number; startup_kw: number}
export interface QuoteAssumptions {sun_hours: number; solar_yield_percent: number; energy_margin_percent: number; inverter_headroom_percent: number; battery_usable_percent: number; battery_efficiency_percent: number}
export interface QuoteEquipment {
  panel_name: string; panel_watts: number; panel_price: string; panel_count: number | null; panel_taxable: boolean;
  inverter_name: string; inverter_kw: number; inverter_surge_kw: number; inverter_price: string; inverter_taxable: boolean;
  battery_name: string; battery_kwh: number; battery_output_kw: number; battery_price: string; battery_count: number | null; battery_taxable: boolean;
}
export interface QuoteExtra {id: string; description: string; quantity: number; unit_price: string; taxable: boolean}
export interface QuoteBrief {
  scenario: string; site_type: string; rooms: number; people: number; site_notes: string;
  goal: string; backup_hours: number; location: string; grid: string; timeline: string; budget: string;
}
export interface QuoteDraft {
  version: 1; issuer: QuoteContact; customer: QuoteContact; project_title: string; issued_on: string; valid_until: string;
  demand: QuoteDemand; assumptions: QuoteAssumptions; equipment: QuoteEquipment; extras: QuoteExtra[];
  discount: string; tax_percent: string; deposit_percent: string; terms: string;
  brief?: QuoteBrief;
}
export interface QuoteSizing {peak_kw: number; daily_kwh: number; backup_kwh: number; backup_peak_kw: number; design_daily_kwh: number; minimum_solar_kw: number; minimum_inverter_kw: number; minimum_battery_kwh: number; suggested_panels: number; suggested_batteries: number}
export interface QuoteLine {description: string; quantity: number; unit_price_cents: number | null; taxable: boolean}
export interface QuoteTotals {subtotal_cents: number; discount_cents: number; taxable_cents: number; tax_cents: number; total_cents: number; deposit_cents: number; remainder_cents: number}
export interface QuoteDocument {version: 1; draft: QuoteDraft; sizing: QuoteSizing; lines: QuoteLine[]; discount_cents: number; tax_bps: number; deposit_bps: number}
export interface SavedQuotation {id: string; quote_number: string; status: QuoteStatus; document: QuoteDocument; total_cents: number; created_at: string}

const contact = (): QuoteContact => ({name: '', phone: '', email: '', address: ''});
export function quoteDateAfter(date: string, days = 14) {return new Date(parseDay(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);}
export function newQuoteLoad(): QuoteLoad {return {id: crypto.randomUUID(), name: '', quantity: 1, watts: 0, hours: 0, backup_hours: 0, simultaneous: true};}
export function newQuoteDraft(): QuoteDraft {
  return {version: 1, issuer: {...contact(), name: 'Damany'}, customer: contact(), project_title: 'Solar installation', issued_on: today(), valid_until: quoteDateAfter(today()),
    demand: {mode: 'appliances', loads: [newQuoteLoad()], peak_kw: 0, daily_kwh: 0, backup_kw: 0, backup_hours: 0, startup_kw: 0},
    assumptions: {sun_hours: 4, solar_yield_percent: 75, energy_margin_percent: 20, inverter_headroom_percent: 25, battery_usable_percent: 80, battery_efficiency_percent: 90},
    equipment: {panel_name: 'Solar panel', panel_watts: 550, panel_price: '', panel_count: null, panel_taxable: false, inverter_name: 'Inverter', inverter_kw: 0, inverter_surge_kw: 0, inverter_price: '', inverter_taxable: false, battery_name: 'Battery bank unit', battery_kwh: 5.12, battery_output_kw: 0, battery_price: '', battery_count: null, battery_taxable: false},
    extras: ['Mounting and fittings', 'Cables, protection and earthing', 'Installation labour and commissioning', 'Transport'].map(description => ({id: crypto.randomUUID(), description, quantity: 1, unit_price: '', taxable: false})),
    discount: '0', tax_percent: '0', deposit_percent: '0', terms: 'Estimate subject to site survey, final equipment compatibility and availability. Confirm roof space, shading, cable routes, protection, motor starting current and battery charge/discharge limits before installation. Warranty and payment terms to be agreed.'};
}
function range(value: number, min: number, max: number, label: string) {if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`); return value;}
function whole(value: number, min: number, max: number, label: string) {range(value, min, max, label); if (!Number.isInteger(value)) throw new Error(`${label} must be a whole number.`); return value;}
export function quoteCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a price with up to two decimal places, without commas.');
  const [units, fraction = ''] = value.trim().split('.');
  const cents = BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(QUOTE_LIMIT)) throw new Error('The amount is too large.');
  return Number(cents);
}
export function quotePercent(value: string) {const bps = quoteCents(value); if (bps > 10000) throw new Error('Percentages must be between 0 and 100.'); return bps;}
const checkedCents = (value: number) => whole(value, 0, QUOTE_LIMIT, 'Amount in cents');
function roundedRatio(value: bigint, divisor: bigint) {return Number((value + divisor / 2n) / divisor);}
export function quoteLineTotal(line: QuoteLine) {
  if (line.unit_price_cents === null) throw new Error(`Enter a selling price for ${line.description}. Enter 0 only if included at no extra charge.`);
  checkedCents(line.unit_price_cents); range(line.quantity, 0.01, 1000000, 'Quantity');
  const hundredths = Math.round(line.quantity * 100);
  if (Math.abs(line.quantity * 100 - hundredths) > 1e-7) throw new Error('Quantities support up to two decimal places.');
  const result = roundedRatio(BigInt(hundredths) * BigInt(line.unit_price_cents), 100n);
  return checkedCents(result);
}
export function quotationTotals(lines: QuoteLine[], discountCents: number, taxBps: number, depositBps: number): QuoteTotals {
  if (!lines.length || lines.length > 100) throw new Error('Use between 1 and 100 quotation lines.');
  checkedCents(discountCents); whole(taxBps, 0, 10000, 'Tax percentage'); whole(depositBps, 0, 10000, 'Deposit percentage');
  let subtotal = 0, taxable = 0;
  for (const line of lines) {if (!line.description.trim() || line.description.length > 300) throw new Error('Each item needs a description of up to 300 characters.'); const amount = quoteLineTotal(line); subtotal = checkedCents(subtotal + amount); if (line.taxable) taxable += amount;}
  if (discountCents > subtotal) throw new Error('The discount cannot exceed the subtotal.');
  const net = subtotal - discountCents;
  const taxableNet = subtotal ? roundedRatio(BigInt(taxable) * BigInt(net), BigInt(subtotal)) : 0;
  const tax = roundedRatio(BigInt(taxableNet) * BigInt(taxBps), 10000n);
  const total = checkedCents(net + tax);
  const deposit = roundedRatio(BigInt(total) * BigInt(depositBps), 10000n);
  return {subtotal_cents: subtotal, discount_cents: discountCents, taxable_cents: taxableNet, tax_cents: tax, total_cents: total, deposit_cents: deposit, remainder_cents: total - deposit};
}
export function sizeQuotation(draft: QuoteDraft): QuoteSizing {
  const d = draft.demand, a = draft.assumptions, e = draft.equipment;
  range(a.sun_hours, 0.5, 12, 'Peak sun hours'); range(a.solar_yield_percent, 10, 100, 'Solar yield factor');
  range(a.energy_margin_percent, 0, 100, 'Energy allowance'); range(a.inverter_headroom_percent, 0, 100, 'Inverter headroom');
  range(a.battery_usable_percent, 10, 100, 'Usable battery capacity'); range(a.battery_efficiency_percent, 10, 100, 'Battery-to-AC efficiency');
  range(e.panel_watts, 1, 2000, 'Panel wattage'); range(d.startup_kw, 0, 1000, 'Starting power');
  let peak = 0, daily = 0, backup = 0, backupPeak = 0;
  if (d.mode === 'appliances') {
    if (!d.loads.length || d.loads.length > 100) throw new Error('Add at least one appliance, up to 100 rows.');
    for (const load of d.loads) {
      if (!load.name.trim() || load.name.length > 120) throw new Error('Enter an appliance name.');
      whole(load.quantity, 1, 10000, 'Appliance quantity'); range(load.watts, 1, 100000, 'Appliance watts');
      range(load.hours, 0.01, 24, 'Daily running hours'); range(load.backup_hours, 0, 24, 'Backup running hours');
      if (load.backup_hours > load.hours) throw new Error('Backup running hours cannot exceed daily running hours.');
      const kw = load.quantity * load.watts / 1000;
      daily += kw * load.hours; backup += kw * load.backup_hours;
      if (load.simultaneous) peak += kw;
      if (load.backup_hours > 0) backupPeak += kw;
    }
    // A declared schedule may reduce the peak, but a single appliance must still fit.
    peak = Math.max(peak, ...d.loads.map(load => load.watts * load.quantity / 1000), backupPeak);
  } else if (d.mode === 'known') {
    peak = range(d.peak_kw, 0.01, 1000, 'Peak demand (kW)'); daily = range(d.daily_kwh, 0.01, 24000, 'Daily energy (kWh)');
    backupPeak = range(d.backup_kw, 0, peak, 'Backup load (kW)'); range(d.backup_hours, 0, 24, 'Backup hours');
    if ((backupPeak === 0) !== (d.backup_hours === 0)) throw new Error('Enter both backup load and hours, or set both to zero.');
    backup = backupPeak * d.backup_hours;
    if (backup > daily + 1e-9) throw new Error('Backup energy cannot exceed the stated daily energy.');
  } else throw new Error('Choose appliances or known demand.');
  range(peak, 0.01, 1000, 'Peak demand (kW)'); range(daily, 0.01, 24000, 'Daily energy (kWh)');
  if (daily > peak * 24 + 1e-9) throw new Error('Daily energy is higher than the stated peak demand could supply in 24 hours. Review simultaneous loads or known demand.');
  const designDaily = daily * (1 + a.energy_margin_percent / 100);
  const solar = designDaily / (a.sun_hours * a.solar_yield_percent / 100);
  const nominalBattery = backup * (1 + a.energy_margin_percent / 100) / (a.battery_usable_percent / 100 * a.battery_efficiency_percent / 100);
  let batteries = 0;
  if (backup > 0) {
    range(e.battery_kwh, 0.01, 1000, 'Battery unit capacity (kWh)'); range(e.battery_output_kw, 0.01, 1000, 'Battery unit continuous DC output (kW)');
    batteries = Math.ceil(Math.max(nominalBattery / e.battery_kwh, backupPeak / (e.battery_output_kw * a.battery_efficiency_percent / 100)) - 1e-10);
  }
  return {peak_kw: peak, daily_kwh: daily, backup_kwh: backup, backup_peak_kw: backupPeak, design_daily_kwh: designDaily, minimum_solar_kw: solar, minimum_inverter_kw: peak * (1 + a.inverter_headroom_percent / 100), minimum_battery_kwh: nominalBattery, suggested_panels: Math.ceil(solar * 1000 / e.panel_watts - 1e-10), suggested_batteries: batteries};
}
export function quoteEquipmentIssues(draft: QuoteDraft, sizing: QuoteSizing) {
  const e = draft.equipment, issues: string[] = [];
  if (!Number.isFinite(e.inverter_kw) || e.inverter_kw < sizing.minimum_inverter_kw - 1e-9) issues.push(`Choose an inverter with at least ${sizing.minimum_inverter_kw.toFixed(2)} kW continuous output.`);
  if (draft.demand.startup_kw > 0 && (!Number.isFinite(e.inverter_surge_kw) || e.inverter_surge_kw < draft.demand.startup_kw)) issues.push('The inverter surge rating must cover the entered starting power.');
  if ((e.panel_count ?? sizing.suggested_panels) < sizing.suggested_panels) issues.push(`Use at least ${sizing.suggested_panels} panels with the current assumptions.`);
  if ((e.battery_count ?? sizing.suggested_batteries) < sizing.suggested_batteries) issues.push(`Use at least ${sizing.suggested_batteries} battery units for the backup energy and continuous load.`);
  return issues;
}
export function quotationLines(draft: QuoteDraft, sizing: QuoteSizing): QuoteLine[] {
  const e = draft.equipment;
  const price = (value: string) => value.trim() ? quoteCents(value) : null;
  const panels = whole(e.panel_count ?? sizing.suggested_panels, 1, 1000000, 'Panel quantity');
  const batteries = sizing.suggested_batteries ? whole(e.battery_count ?? sizing.suggested_batteries, 1, 1000000, 'Battery quantity') : 0;
  const lines: QuoteLine[] = [
    {description: `${e.panel_name} · ${e.panel_watts} W`, quantity: panels, unit_price_cents: price(e.panel_price), taxable: e.panel_taxable},
    {description: `${e.inverter_name} · ${e.inverter_kw} kW continuous`, quantity: 1, unit_price_cents: price(e.inverter_price), taxable: e.inverter_taxable},
  ];
  if (batteries) lines.push({description: `${e.battery_name} · ${e.battery_kwh} kWh / ${e.battery_output_kw} kW DC per unit`, quantity: batteries, unit_price_cents: price(e.battery_price), taxable: e.battery_taxable});
  return [...lines, ...draft.extras.map(item => ({description: item.description, quantity: item.quantity, unit_price_cents: price(item.unit_price), taxable: item.taxable}))];
}
export function prepareQuotation(draft: QuoteDraft): QuoteDocument {
  for (const [label, value] of [['Company', draft.issuer.name], ['Customer', draft.customer.name], ['Project', draft.project_title]]) if (!value.trim() || value.length > 160) throw new Error(`Enter a ${label.toLowerCase()} name of up to 160 characters.`);
  for (const entry of [draft.issuer, draft.customer]) for (const value of Object.values(entry)) if (typeof value !== 'string' || value.length > 500) throw new Error('Keep contact details under 500 characters per field.');
  parseDay(draft.issued_on); parseDay(draft.valid_until);
  if (draft.issued_on > today()) throw new Error('The quotation date cannot be in the future.');
  if (draft.valid_until < draft.issued_on) throw new Error('Validity must end on or after the quotation date.');
  if (draft.terms.length > 4000) throw new Error('Keep terms under 4,000 characters.');
  const sizing = sizeQuotation(draft), issues = quoteEquipmentIssues(draft, sizing);
  if (issues.length) throw new Error(issues[0]);
  const lines = quotationLines(draft, sizing), discount = quoteCents(draft.discount), tax = quotePercent(draft.tax_percent), deposit = quotePercent(draft.deposit_percent);
  const totals = quotationTotals(lines, discount, tax, deposit);
  if (totals.total_cents <= 0) throw new Error('The project total must be greater than zero.');
  return {version: 1, draft: structuredClone(draft), sizing, lines, discount_cents: discount, tax_bps: tax, deposit_bps: deposit};
}
export function quotationNumber(id: string) {return `QUO-${id.replaceAll('-', '').slice(0, 12).toUpperCase()}`;}
export function quoteMoney(cents: number) {return new Intl.NumberFormat('en-KE', {style: 'currency', currency: 'KES'}).format(cents / 100);}
export function quoteError(error: unknown) {
  const value = error as {message?: string; code?: string};
  if (['42P01', 'PGRST205'].includes(value?.code || '') || /installation_quotations.*(exist|schema cache)/i.test(value?.message || '')) return 'Saved quotations are not set up yet. Run the installation_quotations SQL file from this update in your Supabase SQL Editor. Your current form is still available.';
  return value?.message || 'The quotation could not be saved. Please try again.';
}
