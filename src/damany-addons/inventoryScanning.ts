import {parseWarehouseCode} from './warehouse';
import type {MovementInput, WarehouseItem, WarehouseSnapshot} from './warehouse';
import {quoteCents} from './solarQuotation';

export type InventoryCartLine = {item_id: string; name: string; quantity: number; serials: string[]; price: string};
export type ScanContext = {data: WarehouseSnapshot; kind: MovementInput['kind']; source: string; selectedId?: string};

// A manufacturer's barcode identifies a product only after it has been linked to its SKU.
// A serial identifies one physical unit. Unknown codes never create guessed products.
export function resolveInventoryScan(raw: string, context: ScanContext): {item: WarehouseItem; serial: string} {
  const code = parseWarehouseCode(raw), {data, kind, selectedId} = context;
  const normalized = (value: string | null | undefined) => (value || '').trim().toUpperCase();
  const productCode = code.sku || code.plain;
  // UPC-A and its EAN-13 representation can differ by one leading zero.
  const equivalent = (value: string) => /^0\d{12}$/.test(value) ? value.slice(1) : value;
  const matches = productCode ? data.inventory_items.filter(value => equivalent(normalized(value.sku)) === equivalent(productCode)) : [];
  if (matches.length > 1) throw new Error('This barcode matches more than one product. Give the products distinct codes before scanning.');
  let item: WarehouseItem | undefined = matches[0];
  if (!item && code.plain) item = data.inventory_items.find(value => value.id.toUpperCase() === code.plain);
  const unit = data.inventory_units.find(value => !!value.serial_number && normalized(value.serial_number) === (code.serial || code.plain));
  let serial = code.serial;
  if (code.sku && !item) throw new Error(`Product code ${code.sku} is not registered. Link it to a product below or add a new product first.`);
  if (unit) {
    if (item && item.id !== unit.inventory_item_id) throw new Error('This code matches different products. Use the full SKU and serial QR label.');
    item = data.inventory_items.find(value => value.id === unit.inventory_item_id);
    serial = normalized(unit.serial_number);
  }
  if (!item && !code.sku && kind === 'Receipt') {
    const selected = data.inventory_items.find(value => value.id === selectedId);
    if (selected?.is_serialized) {item = selected; serial = code.serial || code.plain;}
  }
  if (!item) throw new Error('Code not registered. Add the product or link its barcode below. For a new unit serial, choose its serialized product first.');
  if (kind === 'Receipt' && unit) throw new Error('This serial is already in inventory. It cannot be received twice.');
  if (kind !== 'Receipt' && serial && (!unit || unit.state !== 'Available' || unit.location_id !== context.source)) throw new Error('This unit is not available at the selected source location. Check its location and dispatch history.');
  return {item, serial};
}

export function addInventoryCartLine(cart: InventoryCartLine[], item: WarehouseItem, quantity: number, serials: string[], price: string, context: ScanContext & {sale: boolean}): InventoryCartLine[] {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Enter a whole quantity from 1 to 10,000.');
  if ((item.is_serialized || serials.length > 0) && serials.length !== quantity) throw new Error('Scan or enter every unit serial for this product.');
  if (new Set(serials).size !== serials.length || serials.some(serial => !serial || serial.length > 200 || cart.some(line => line.serials.includes(serial)))) throw new Error('That serial is already in the list, or is invalid. Each unit can be added only once.');
  if (context.kind === 'Receipt' && serials.some(serial => context.data.inventory_units.some(unit => unit.serial_number?.toUpperCase() === serial))) throw new Error('A received serial is already in inventory. Check the existing unit first.');
  const existing = cart.find(line => line.item_id === item.id);
  if (existing && (!!existing.serials.length !== !!serials.length)) throw new Error('Use serials for all units of this product, or remove its existing line first.');
  if (!existing && cart.length >= 100) throw new Error('Use at most 100 products per operation.');
  if (cart.reduce((sum, line) => sum + line.quantity, 0) + quantity > 10000) throw new Error('Use at most 10,000 units per operation.');
  const nextSerials = [...(existing?.serials || []), ...serials], nextQuantity = quantity + (existing?.quantity || 0);
  if (context.kind !== 'Receipt') {
    const available = context.data.inventory_units.filter(unit => unit.inventory_item_id === item.id && unit.location_id === context.source && unit.state === 'Available' && (!nextSerials.length || nextSerials.includes(unit.serial_number || '')));
    if (available.length < nextQuantity) throw new Error('Not enough available stock at the selected source. Check the location or serials.');
  }
  // Scanning another unit must preserve a price the operator already edited.
  const nextPrice = existing?.price ?? price;
  if (context.kind === 'Dispatch' && context.sale) quoteCents(nextPrice);
  const line = {item_id: item.id, name: `${item.item_type} · ${item.brand} ${item.model}`.trim(), quantity: nextQuantity, serials: nextSerials, price: nextPrice};
  return existing ? cart.map(value => value.item_id === item.id ? line : value) : [...cart, line];
}

// Hold a label in view without counting it repeatedly. Show a clear frame for
// 800 ms before scanning another unit carrying the same product barcode.
export function cameraScanGate(rearmMs = 800) {
  let lastCode = '', missingSince: number | null = null;
  return (code: string | null, now: number): boolean => {
    if (!code) {missingSince ??= now; return false;}
    const accepted = code !== lastCode || (missingSince !== null && now - missingSince >= rearmMs);
    missingSince = null;
    if (accepted) lastCode = code;
    return accepted;
  };
}
