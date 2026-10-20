import type {InventoryItem, Snapshot} from '../lib/types';
import type {InventoryPdfReport} from './vendor/inventoryPdfRuntime';
import {today} from '../lib/warranty';

const amount = (cents: number) => (cents / 100).toLocaleString('en-KE', {minimumFractionDigits: 2, maximumFractionDigits: 2});

export function inventoryPdfReport(data: Snapshot, items: InventoryItem[], filter: string, query: string, now = new Date()): InventoryPdfReport {
  const deployed = new Map<string, number>();
  for (const component of data.site_components) if (component.status === 'Installed') deployed.set(component.inventory_item_id, (deployed.get(component.inventory_item_id) || 0) + 1);
  const stockCents = items.reduce((sum, item) => sum + item.total_stock * Math.round(Number(item.unit_price) * 100), 0);
  const filterLabel = filter === 'all' ? 'All products' : filter === 'low' ? 'Low stock' : filter;
  return {
    generatedAt: new Intl.DateTimeFormat('en-GB', {timeZone: 'Africa/Nairobi', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'}).format(now) + ' EAT',
    scope: `${items.length} products | ${filterLabel}${query.trim() ? ` | Search: ${query.trim().slice(0, 180)}${query.trim().length > 180 ? '...' : ''}` : ''} | All warehouse/shop locations`,
    available: items.reduce((sum, item) => sum + item.total_stock, 0),
    deployed: items.reduce((sum, item) => sum + (deployed.get(item.id) || 0), 0),
    stockValue: amount(stockCents),
    rows: items.map(item => {
      const sku = (item as InventoryItem & {sku?: string | null}).sku;
      const price = Math.round(Number(item.unit_price) * 100);
      return {
        product: `${item.brand} ${item.model}${sku ? `\nCode: ${sku}` : ''}`.trim(),
        type: item.item_type,
        available: String(item.total_stock),
        deployed: String(deployed.get(item.id) || 0),
        unitPrice: amount(price),
        stockValue: amount(price * item.total_stock),
        status: item.total_stock === 0 ? 'Out of stock' : item.total_stock <= item.low_stock_threshold ? 'Running low' : 'In stock',
      };
    }),
  };
}

export async function downloadInventoryPdf(data: Snapshot, items: InventoryItem[], filter: string, query: string) {
  const {createInventoryPdf} = await import('./vendor/inventoryPdfRuntime');
  const bytes = await createInventoryPdf(inventoryPdfReport(data, items, filter, query));
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: 'application/pdf'}));
  const link = document.createElement('a');
  link.href = url; link.download = `damany-inventory-${today()}.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
