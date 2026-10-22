import type {InventoryItem} from '../lib/types';
import {newQuoteDraft, sizeQuotation} from './solarQuotation';
import type {QuoteBrief, QuoteDraft, QuoteEquipment, QuoteLoad} from './solarQuotation';

export const siteScenarios = ['Home', 'Business', 'Office', 'Farm', 'Institution', 'Off-Grid', 'Street Light', 'Clinic & Health', 'School', 'Telecom Site', 'Cold Room', 'Industrial'] as const;
export const quoteGoals = ['Backup during outages', 'Reduce electricity bills', 'Off-grid supply'] as const;
export const appliancePresets = [
  {name: 'Lighting', watts: 10, hours: 5}, {name: 'TV', watts: 100, hours: 4},
  {name: 'Fridge', watts: 150, hours: 8}, {name: 'Freezer', watts: 200, hours: 10},
  {name: 'Microwave', watts: 1200, hours: 0.5}, {name: 'Water Heater', watts: 3000, hours: 1},
  {name: 'Washing Machine', watts: 500, hours: 1}, {name: 'Iron', watts: 1200, hours: 0.5},
  {name: 'AC Unit', watts: 1500, hours: 6}, {name: 'Water Pump', watts: 750, hours: 2},
  {name: 'CCTV', watts: 40, hours: 24}, {name: 'Computer/Laptop', watts: 100, hours: 6},
] as const;

export function newQuoteBrief(): QuoteBrief {
  return {scenario: '', site_type: '', rooms: 0, people: 0, site_notes: '', goal: '', backup_hours: 4, location: '', grid: '', timeline: '', budget: ''};
}
export function newSimpleQuotation(): QuoteDraft {
  const draft = newQuoteDraft();
  return {...draft, brief: newQuoteBrief(), demand: {...draft.demand, loads: []}};
}
export function presetLoad(name: string, brief: QuoteBrief): QuoteLoad {
  const preset = appliancePresets.find(item => item.name === name);
  if (!preset) throw new Error('Choose an appliance or add a custom load.');
  const backup = brief.goal === 'Reduce electricity bills' ? 0 : brief.backup_hours;
  return {id: crypto.randomUUID(), ...preset, quantity: name === 'Lighting' ? Math.max(1, brief.rooms) : 1, backup_hours: Math.min(preset.hours, backup), simultaneous: true};
}
export function changeBackup(draft: QuoteDraft, goal: string, hours: number): QuoteDraft {
  const backupHours = goal === 'Reduce electricity bills' ? 0 : hours;
  return {...draft, brief: {...(draft.brief || newQuoteBrief()), goal, backup_hours: backupHours}, demand: {...draft.demand,
    backup_hours: backupHours, backup_kw: backupHours ? Math.min(draft.demand.peak_kw, draft.demand.backup_kw || draft.demand.peak_kw) : 0,
    loads: draft.demand.loads.map(load => ({...load, backup_hours: Math.min(load.hours, backupHours)})),
  }};
}

// A preview of energy requirements, never a substitute for the selected battery's
// discharge rating. Save still uses the unmodified, fully validated draft.
export function previewSizing(draft: QuoteDraft) {
  return sizeQuotation({...draft, equipment: {...draft.equipment,
    panel_watts: draft.equipment.panel_watts || 550,
    battery_kwh: draft.equipment.battery_kwh || 5.12,
    battery_output_kw: draft.equipment.battery_output_kw || 1000,
  }});
}

export type EquipmentKind = 'panel' | 'inverter' | 'battery';
export function productKind(item: InventoryItem): EquipmentKind | null {
  const type = item.item_type.toLowerCase();
  if (/inverter/.test(type)) return 'inverter';
  if (/batter|energy storage/.test(type)) return 'battery';
  if (/panel|photovoltaic|pv module/.test(type)) return 'panel';
  return null;
}
export function productRating(item: InventoryItem, kind: EquipmentKind): number | null {
  const text = `${item.brand} ${item.model}`;
  // Only explicit units are read: 5 kVA is not 5 kW and model numbers are not ratings.
  const pattern = kind === 'panel' ? /(?:^|[^\d.])(\d+(?:\.\d+)?)\s*w(?:p)?\b/ig : kind === 'inverter' ? /(?:^|[^\d.])(\d+(?:\.\d+)?)\s*kw\b/ig : /(?:^|[^\d.])(\d+(?:\.\d+)?)\s*kwh\b/ig;
  const values = [...text.matchAll(pattern)].map(match => Number(match[1]));
  const unique = [...new Set(values)];
  const max = kind === 'panel' ? 2000 : 1000;
  return unique.length === 1 && unique[0] > 0 && unique[0] <= max ? unique[0] : null;
}
export function applyQuoteProduct(draft: QuoteDraft, kind: EquipmentKind, item: InventoryItem): QuoteDraft {
  const rating = productRating(item, kind);
  const equipment: QuoteEquipment = {...draft.equipment,
    [`${kind}_name`]: `${item.brand} ${item.model}`.trim() || item.item_type,
    [`${kind}_price`]: Number(item.unit_price).toFixed(2),
  };
  if (kind === 'panel') {equipment.panel_watts = rating || 0; equipment.panel_count = null;}
  if (kind === 'inverter') {equipment.inverter_kw = rating || 0; equipment.inverter_surge_kw = 0;}
  if (kind === 'battery') {equipment.battery_kwh = rating || 0; equipment.battery_output_kw = 0; equipment.battery_count = null;}
  return {...draft, equipment};
}
export function suggestQuoteProducts(draft: QuoteDraft, items: InventoryItem[]): QuoteDraft {
  let next = structuredClone(draft);
  let inverterMinimum = 0, backup = true;
  try {const sizing = previewSizing(next); inverterMinimum = sizing.minimum_inverter_kw; backup = sizing.backup_kwh > 0;} catch {return next;}
  for (const kind of ['panel', 'inverter', 'battery'] as const) {
    if (kind === 'battery' && !backup) continue;
    // Revisiting answers must not replace a member of staff's chosen product/price.
    if (next.equipment[`${kind}_price`].trim()) continue;
    const candidates = items.filter(item => productKind(item) === kind && Number.isFinite(Number(item.unit_price)) && Number(item.unit_price) >= 0)
      .sort((a, b) => {
        const ar = productRating(a, kind), br = productRating(b, kind);
        const suitableA = ar !== null && (kind !== 'inverter' || ar >= inverterMinimum);
        const suitableB = br !== null && (kind !== 'inverter' || br >= inverterMinimum);
        return Number(suitableB) - Number(suitableA) || Number(b.total_stock > 0) - Number(a.total_stock > 0) || Number(a.unit_price) - Number(b.unit_price) || a.id.localeCompare(b.id);
      });
    if (candidates[0]) next = applyQuoteProduct(next, kind, candidates[0]);
  }
  return next;
}

export function simpleStepError(step: number, draft: QuoteDraft): string {
  const brief = draft.brief || newQuoteBrief();
  if (step === 0) {
    if (!(siteScenarios as readonly string[]).includes(brief.scenario)) return 'Choose the type of site you are powering.';
    if (brief.scenario === 'Home' && !brief.site_type) return 'Choose the home type.';
    if (brief.scenario === 'Home' && (!Number.isInteger(brief.rooms) || brief.rooms < 1 || brief.rooms > 10000)) return 'Enter the number of rooms.';
  }
  if (step === 1) {
    if (!brief.goal) return 'Choose what the solar system should do.';
    try {previewSizing(draft);} catch (error) {return error instanceof Error ? error.message : 'Check the power requirements.';}
  }
  return '';
}
