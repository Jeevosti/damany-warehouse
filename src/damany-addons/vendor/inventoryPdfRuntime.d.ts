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
