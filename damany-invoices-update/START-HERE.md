# Add credit invoices to Damany

This update adds a **Credit invoices** page to the existing React/Supabase app.
It records sales where customers receive goods or services now and pay later.
It does not process card charges, send messages, or move warehouse stock.
Amounts use KES, matching the current app. Quantities are whole units and prices
support two decimal places. Tax calculation and tax-authority submission are
not included. Include any agreed charges as clearly described invoice items.

## 1. Add the update to your project

1. Download and extract **damany-invoices-update.zip**.
2. Put its **damany-invoices-update** folder inside your website project folder.
   It should be next to **package.json**, **src**, and **public**.
3. Open that website project folder in VS Code.
4. Select **Terminal → New Terminal**.
5. Run:

   ```bash
   node damany-invoices-update/install-credit-invoices.mjs --check
   ```

   This checks compatibility without changing files. If it cannot identify your
   app safely, stop and share the error and your current `src/App.tsx`.

6. When the check passes, install:

   ```bash
   node damany-invoices-update/install-credit-invoices.mjs
   ```

The installer adds the new files and makes small changes to `src/App.tsx` and
`src/lib/types.ts`. It backs up both original files under
`invoice-update-backups`. Your name, logo, Netlify configuration, environment
variables, login code, and existing pages are preserved. The update does not
need any new npm packages. If local dependencies are missing, run `pnpm install`.

## 2. Add the invoice tables in Supabase

1. Open the Supabase project connected to **your Netlify website**. Its project
   reference should match your site's `VITE_SUPABASE_URL`.
2. Open **SQL Editor**, then create a new query.
3. In VS Code, open:

   ```text
   supabase/migrations/202610140001_credit_invoices.sql
   ```

4. Copy the entire contents into the Supabase query and run it **once**.
5. Wait for the query to succeed before deploying the website update.

Run only this new invoice SQL file on the existing database. Do not rerun the
original full schema. The new file adds three invoice tables, checked write
functions, and a private numbering counter. Existing customer, stock, site,
warranty, and login data are not rewritten. Keep `credit_private` out of the
Data API's exposed schemas (the default public schema setting already does this).

Invoices follow the app's existing account ownership: each signed-in account
can access its own customers and invoices. This update does not introduce a
shared company/staff account model. Invoice records prevent deletion of a
referenced customer so historical invoices retain a valid customer link.

If the SQL reports an existing `credit_private` schema, the upgrade may already
be installed. Do not delete tables; share the error if unsure.

## 3. Check and deploy

Run in your website terminal:

```bash
pnpm run build
pnpm test
node tests/credit-invoices-database.mjs
```

The last command uses an isolated local test database and sample records. It
does not connect to your Supabase project or change your customer data.

If these pass, upload the changed files. These commands use your existing
capital-M **Main** branch:

```bash
git add src/App.tsx src/lib/types.ts src/lib/creditInvoices.ts src/services/creditInvoices.ts src/pages/Invoices.tsx src/credit-invoices.css
git add supabase/migrations/202610140001_credit_invoices.sql tests/credit-invoices.test.ts tests/credit-invoices-database.mjs docs/CREDIT-INVOICES-SETUP.md
git commit -m "Add customer credit invoices and payment tracking"
git push origin Main
```

Netlify will rebuild if automatic deployments from **Main** are enabled. Wait
for a successful deployment, then refresh your site and open **Credit invoices**.
The installer folder and backup folder do not need to be pushed to GitHub.

## 4. Use the new page

1. Add a customer in **Clients** if necessary.
2. Open **Credit invoices → New invoice**.
3. Choose the customer, enter your business name, invoice date, due date, and
   items. You can add payment instructions in Notes.
4. Save. The invoice receives a number such as **INV-2026-00001**.
5. When money arrives, open the invoice and choose **Record payment**. Enter
   the amount, date, payment method, and optional M-Pesa/bank reference.
6. The remaining balance and status update automatically. Part payments are
   supported; invoices become overdue after the due date in Nairobi time.
7. Use **Print / save PDF**, then choose your browser's **Save as PDF** option
   to download a copy. No invoice is emailed automatically.

An invoice copies the customer's contact details when issued, so later customer
edits do not change an earlier invoice. Monetary totals are calculated again in
the database. Direct edits to invoice totals and payment records are blocked.

To correct a payment entry, choose **Reverse** and give a reason. This corrects
the record; it does not transfer a refund. To cancel an invoice, reverse any
payments first, then choose **Void invoice**. The history remains visible.

You can try these steps in **Demo mode** first. Demo invoices are stored only
in your browser, separately for the signed-in account, and prints are marked
as sample records. Switch to Live workspace for actual business records.

## Validation and limits

The update was built against the exported app with its custom login page.
The production build and local application/database checks passed. Checks cover
exact cents, dates, partial payments, retries, overpayments, account separation,
anonymous access, audit corrections, and preserving existing stock.

The browser layout, actual print dialog, live Supabase RPC calls, and Netlify
deployment have not been exercised here. The current GitHub/Netlify copy and
its Supabase project were not accessible for this update. The installer checks
the app structure before changing anything and stops on unfamiliar changes.

## Undo the website integration

To remove the navigation/page integration locally, restore `src/App.tsx` and
`src/lib/types.ts` from the timestamped `invoice-update-backups` folder, build,
commit and deploy. Leave the new database tables in place to preserve any real
invoices or payment history. Do not drop them as part of a website rollback.
