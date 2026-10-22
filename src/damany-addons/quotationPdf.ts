import type {SavedQuotation} from './solarQuotation';
import {quotationTotals, quoteLineTotal} from './solarQuotation';
import type {QuotationPdfReport} from './vendor/inventoryPdfRuntime';
import {formatDate} from '../lib/warranty';

const money = (cents: number) => (cents / 100).toLocaleString('en-KE', {minimumFractionDigits:2, maximumFractionDigits:2});
const decimal = (value: number) => value.toLocaleString('en-KE', {maximumFractionDigits:2});
export function quotationPdfReport(quote: SavedQuotation, demo = false, saved = true): QuotationPdfReport {
  const doc=quote.document,d=doc.draft,s=doc.sizing,e=d.equipment;
  const total=quotationTotals(doc.lines,doc.discount_cents,doc.tax_bps,doc.deposit_bps);
  if (!d.customer.name.trim()) throw new Error('Enter the client name before downloading the quotation.');
  const totals=[{label:'Subtotal',value:money(total.subtotal_cents)}];
  if (total.discount_cents) totals.push({label:'Discount',value:`- ${money(total.discount_cents)}`});
  totals.push({label:`Tax (${doc.tax_bps/100}% on selected items)`,value:money(total.tax_cents)});
  totals.push({label:'TOTAL PROJECT COST (KES)',value:money(total.total_cents)});
  if (doc.deposit_bps) totals.push({label:`Deposit requested (${doc.deposit_bps/100}%)`,value:money(total.deposit_cents)},{label:'Balance after deposit',value:money(total.remainder_cents)});
  return {
    issuerName:d.issuer.name,
    issuerContact:[d.issuer.phone,d.issuer.email,d.issuer.address].filter(Boolean).join('\n'),
    customerName:d.customer.name,
    customerContact:[d.customer.phone,d.customer.email,d.customer.address].filter(Boolean).join('\n'),
    number:quote.quote_number,issued:formatDate(d.issued_on),validUntil:formatDate(d.valid_until),project:d.project_title,
    banner:[demo?'DEMO - SAMPLE QUOTATION':'',saved?'':'DRAFT - NOT SAVED'].filter(Boolean).join(' | '),
    brief:d.brief ? [d.brief.scenario,d.brief.site_type,d.brief.location,d.brief.goal,d.brief.grid,d.brief.timeline,d.brief.site_notes].filter(Boolean).join(' | ') : '',
    system:`Demand: ${decimal(s.peak_kw)} kW peak / ${decimal(s.daily_kwh)} kWh per day. Solar: ${decimal((e.panel_count??s.suggested_panels)*e.panel_watts/1000)} kWp. Inverter: ${decimal(e.inverter_kw)} kW. Battery: ${decimal((s.suggested_batteries ? e.battery_count??s.suggested_batteries : 0)*e.battery_kwh)} kWh.`,
    rows:doc.lines.map(line=>({description:line.description+(line.taxable&&doc.tax_bps?' *':''),quantity:decimal(line.quantity),unitPrice:money(line.unit_price_cents??0),amount:money(quoteLineTotal(line))})),
    totals, taxNote:doc.tax_bps?'* Tax applies to marked items after their share of the discount. Unit prices exclude tax.':'',
    terms:d.terms,
    basis:`Planning assumptions: ${d.assumptions.sun_hours} peak sun hours/day; ${d.assumptions.solar_yield_percent}% solar yield; ${d.assumptions.energy_margin_percent}% energy allowance; ${d.assumptions.inverter_headroom_percent}% inverter headroom; ${d.assumptions.battery_usable_percent}% usable battery capacity; ${d.assumptions.battery_efficiency_percent}% battery-to-AC efficiency. ${d.demand.startup_kw?`Starting load: ${d.demand.startup_kw} kW.`:'Motor starting loads must be confirmed on site.'}`,
    loads:d.demand.mode==='appliances' ? d.demand.loads.map(load=>`${load.name}: ${load.quantity} x ${load.watts} W; ${load.hours} hours/day; ${load.backup_hours} backup hours; simultaneous: ${load.simultaneous?'yes':'no'}.`) : [],
  };
}
export function quotationPdfFilename(quote: SavedQuotation) {
  const clean = (text: string) => text.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,100);
  return `${clean(quote.quote_number)||'Quotation'}-${clean(quote.document.draft.customer.name)||'Client'}.pdf`;
}
export async function downloadQuotationPdf(quote: SavedQuotation, demo: boolean, saved: boolean) {
  const {createQuotationPdf}=await import('./vendor/inventoryPdfRuntime');
  const bytes=await createQuotationPdf(quotationPdfReport(quote,demo,saved));
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
  const link=document.createElement('a');link.href=url;link.download=quotationPdfFilename(quote);
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
