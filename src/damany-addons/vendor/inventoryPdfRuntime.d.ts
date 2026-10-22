export interface InventoryPdfRow {
  product: string;
  type: string;
  available: string;
  deployed: string;
  unitPrice: string;
  stockValue: string;
  status: string;
}
export interface InventoryPdfReport {
  generatedAt: string;
  scope: string;
  available: number;
  deployed: number;
  stockValue: string;
  rows: InventoryPdfRow[];
}
/** Generates a real PDF using the bundled fonts; no remote conversion service. */
export function createInventoryPdf(report: InventoryPdfReport): Promise<Uint8Array>;
export interface QuotationPdfReport {
  issuerName: string; issuerContact: string; customerName: string; customerContact: string;
  number: string; issued: string; validUntil: string; project: string; banner: string; brief: string; system: string;
  rows: {description:string; quantity:string; unitPrice:string; amount:string}[];
  totals: {label:string; value:string}[]; taxNote:string; terms:string; basis:string; loads:string[];
}
export function createQuotationPdf(report: QuotationPdfReport): Promise<Uint8Array>;
