# Inventory PDF export

The bundled runtime contains pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1 and DejaVu Sans. All fonts and code are bundled locally; exporting does not upload inventory to a conversion service or fetch fonts from another website. The runtime loads only when Export PDF is clicked.

Keep `inventoryPdfRuntime.js`, `inventoryPdfRuntime.d.ts`, `PDF-LIB-LICENSE.txt`, `FONTKIT-LICENSE.txt` and `PDF-FONT-LICENSE.txt` together. No npm or package.json changes are required for this update.

The report uses an A4 landscape table, KES currency, Africa/Nairobi timestamps, repeated column headers and page numbers. Normal product rows stay on one page; very long rows continue on another page. Export follows the main Inventory product filter and search, across all stock locations. Stock value uses the products' listed unit prices.

The development repository keeps the readable renderer in `scripts/inventory-pdf-entry.mjs` and its pinned bundler in `scripts/vendor-inventory-pdf.mjs`. Product data and export selection are prepared in `src/damany-addons/inventoryPdf.ts`.
