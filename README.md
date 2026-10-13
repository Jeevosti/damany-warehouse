# Solara — Solar Company Management System

React + Vite + Tailwind CSS + Lucide React, backed by Supabase Auth/PostgreSQL. Version 2.1 adds a dedicated email/password login, password recovery, and logout. Version 2 includes serialized and quantity-based inventory, client/site warranty summaries, RMA replacement history, in-app notifications, and a red/charcoal visual theme with light/dark/system preferences.

## Run the application

Use Node.js 22.12+ and npm or pnpm.

```bash
npm install
npm run dev
```

The tested versions are recorded in `pnpm-lock.yaml`. For a reproducible install, use the pinned pnpm version with `pnpm install --frozen-lockfile`. `pnpm-workspace.yaml` allows the required esbuild installation script. Supabase JS and the optional Supabase CLI are pinned.

The hosted version is preconfigured for the connected project, **Jeevosti's Project** (`dgxuaibxpujbugjabreo`). Both SQL migrations have already been applied there. Existing `pos_…` tables used by other applications were not modified. No demo business records were inserted into Supabase.

The first screen is now **Sign in**. Use an email/password user from this project's **Supabase Authentication**. This is an application user, not necessarily your Supabase Dashboard account. No shared password or administrator secret is included. If needed, create an application user in Authentication → Users. Separate app accounts have isolated workspaces; this is not yet a company-wide shared staff model.

After signing in, demo mode remains available under Settings with clearly labeled fictional sample data and browser-local persistence. Demo changes never automatically copy into Supabase. Version 1 demo records upgrade in place without being reset.

## Connect a different Supabase project

1. For a fresh project, run both files in `supabase/migrations/` in filename order, or use the bundled `public/downloads/solara-schema.sql` in SQL Editor. These files create new tables and intentionally fail rather than overwrite existing tables with matching names.
2. If this system's version 1 schema is already installed, run **only** `20261012120842_advanced_inventory_rma_notifications.sql`.
3. Create an email/password app user in Supabase Authentication. For an internal company deployment, disable public self-signup in the project's Auth settings.
4. Before signing in, open **Connection settings** below the login form, enter the new project URL and public publishable/legacy anon key, and save. Then sign in with a user from the new project. Signed-in users can also change the project in Settings. Never paste a secret or service-role key into frontend configuration.

For a separate build, copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. On Windows, use File Explorer or PowerShell to copy the file. Build-time environment values override `src/services/defaultConnection.ts`; a connection explicitly saved in the browser takes precedence. The included default URL/key are public client configuration, not administrator credentials. Security comes from Supabase Auth and RLS.

## Login and account setup

The application has its own red-and-black login page. The dashboard, queries, navigation, and demo cannot mount until an app session is available. Passwords are sent directly to Supabase Auth; this code does not store or log them. Restored sessions are checked with Auth; sign-out clears the private query cache and returns to login. Account ownership policies in PostgreSQL remain the security boundary, including when the login page is publicly reachable.

1. In your chosen Supabase project, open **Authentication → Users → Add user → Create new user**. Create the app user's email and password. This is separate from a Supabase Dashboard or ChatGPT account. If creating the user manually with a password, enable Auto Confirm User as appropriate so they can sign in immediately.
2. For an internal system, disable public signups in Authentication settings. The app has no self-registration form.
3. Under **Authentication → URL Configuration**, set **Site URL** to your production website. Add the exact password recovery URL to **Redirect URLs**:
   - `https://solara-operations.stevekumeiya2030.chatgpt.site/?auth=recovery` for the hosted Solara site.
   - `https://starlit-liger-adba2c.netlify.app/?auth=recovery` for that Netlify deployment, or replace it with your actual Netlify/custom domain.
4. Use **Forgot password?** on the login page to request a reset. The email link opens the new-password form, which requires matching passwords of at least 12 characters. Supabase's own configured password policy is also enforced. Email delivery and redirect allowlisting must be configured in the Supabase project.
5. Use **Sign out** at the top right or in Settings, especially on a shared computer. Sessions persist in this browser until signed out or expired.

No default app password is created. There is no change to existing accounts or records. Separate accounts still have separate records; shared staff access requires an explicit company membership design.

## Deploy this update to Netlify

The source archive contains `netlify.toml`, which configures the build command and publishes **dist**. For a Git deployment:

1. Put the contents of `solara-management/` at the repository root so Netlify can see `package.json` and `netlify.toml`.
2. Set build environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the same project. The variable name goes in **Key**; its URL or publishable key goes in **Value**. `NODE_VERSION` is set to `22` in `netlify.toml`.
3. Redeploy after changing these variables: Vite embeds them at build time.
4. For a manual drag-and-drop deployment, build locally with the correct `.env`, then upload the **dist** folder. Uploading the unbuilt source ZIP does not deploy a Vite application.
5. Add the deployed recovery URL to Supabase Auth as described above.

Updating the hosted Solara site does not automatically update a separate Netlify deployment. A connection saved explicitly in a browser continues to take precedence over build-time defaults; use the login's Connection settings to switch an existing browser to another project.

## Features

- Overview metrics, commissioned-installation chart, current warranty health, stock alerts, and CSV report exports.
- Clickable client cards showing each site's health and shortest remaining active component warranty.
- Client and site drill-down dialogs with hardware identity, live warranty progress, status, replacement links, and audit history.
- Atomic new-client + new-installation + hardware registration; client/site editing.
- Serialized stock receipts and keyboard-compatible barcode scanner entry; quantity receipts/assignments for non-serialized products.
- Product-specific default warranty months, adjustable before a component is assigned.
- Fault quarantine, immediate or later replacement, and successive replacement lineage.
- In-app notifications for low/out-of-stock products, upcoming/expired warranties, maintenance, and outstanding faulty returns.
- Read/unread filtering, mark-as-read, mark-all-read, and links from alerts to affected records. Read state syncs through Supabase.
- Dedicated responsive login, password visibility toggle, password reset, restored sessions, and sign-out.
- Red/black branding in both light and dark modes. Warranty/status colors remain green/amber/red.
- Responsive layouts, labeled controls, native focus-trapping dialogs, pending/error/empty states, and mutation feedback.

## Database architecture

| Table | Purpose |
|---|---|
| `clients` | Name, phone, email, location/address, GPS text, created timestamp |
| `installations` | Client FK, site name, system type, commissioning date, status, capacity, notes |
| `inventory_items` | Catalog, derived available stock, price, reorder threshold, `is_serialized`, `default_warranty_months` |
| `inventory_units` | One UUID per physical unit; nullable manufacturer serial; Available/Deployed/Faulty state |
| `site_components` | Site/product/unit links, nullable serial, warranty months, installed date, status, replacement link |
| `component_events` | Append-only assignment/fault/replacement audit with actor, reason, and timestamp |
| `notification_reads` | Account-scoped acknowledgement keys and read timestamps |

All seven tables have RLS and account ownership. Composite foreign keys include ownership to prevent cross-account relationships. The requested client → installation → component cascade constraints remain in the schema for administrator maintenance. Normal application users cannot delete hardware/audit history. Inventory products cannot be deleted while physical units reference them.

### Serialization and stock integrity

`is_serialized` defaults to false for new products. The upgrade preserves v1 serialized products and all existing component warranties. Solar-panel product defaults are 300 months; other new products default to 60 unless configured explicitly.

Every physical unit has an internal ID, even without a manufacturer serial. A serial is conditionally required when its product is serialized, globally unique when present, and normalized to uppercase. A component's serial and product must match its physical warehouse unit. Serialization cannot be enabled on a product that already has anonymous units without first labeling them through administrator migration.

`total_stock` means **currently usable and in-house**. Only Available units count. State transitions maintain the stock counter transactionally. Row locks and physical-unit uniqueness prevent double allocation. A multi-unit receipt, assignment, or combined site registration either commits fully or rolls back fully. Critical mutations use authenticated, owner-validated transactional functions in a non-exposed private schema; public invoker wrappers expose only the intended API. Direct counter/state/audit edits are denied.

The warehouse supports manual serial entry or a USB/Bluetooth scanner that types like a keyboard. Camera scanning is not implemented. Non-serialized assignments use quantity and allocate separate internal unit IDs.

### RMA workflow

1. On a site/client component, select **Report fault / RMA** and provide a reason or RMA reference.
2. Mark it **Returned_Faulty**, or choose **Install a replacement now**.
3. Select available hardware of the same type (model/brand may differ) and its required serial or anonymous unit.
4. The original becomes **Replaced** and links to the new **Installed** component. Both transitions, the stock allocation, and audit entries commit together.

Faulty units remain quarantined and never increase available stock. Original components stay visible. An already-replaced component cannot be replaced again, while a later failure of its replacement creates another link in the chain. Direct deletion/return-to-stock behavior from v1 is superseded by this history-preserving RMA workflow. Repair, vendor credit, scrap, and return-to-service dispositions are not included.

### Warranty rules

Expiry = **site commissioning date + component warranty months**, including replacement components. The form explicitly explains this rule; replacement does not automatically restart the warranty clock. The chosen term is stored with the component. This is an operational tracking rule, not a statement about any manufacturer's replacement policy.

Calendar-month additions clamp to the target month's last day, including leap years. Green means more than six calendar months remain; amber means at least 30 days and at most six months; red means fewer than 30 days, including expired. The expiry date has zero days left; a negative count is expired. The 30/60-day alert filters are inclusive and exclude expired assets, which have a separate filter.

Progress = remaining days / total coverage days, clamped to 0–100%; a zero-month term has 0% remaining. Current summaries and alerts include only Installed components. Historical hardware retains its countdown for reference, and unresolved Returned_Faulty components make the site's health red. Today uses Africa/Nairobi; date-only arithmetic is UTC-safe. The app refreshes countdowns every minute. The database `component_warranties` view follows the same calendar/time-zone rules and uses security-invoker access.

### Notifications

Notifications are derived from the current workspace snapshot. Stock-quantity changes and warranty-urgency changes generate new unread keys. Reading an alert does not resolve its underlying condition; resolved conditions disappear from the active list. Acknowledgement is idempotent and account-scoped. The app polls every minute/on focus. This release provides **in-app** notifications while open; it does not send email, background push, or closed-app mobile alerts.

## Code organization / Android readiness

```text
src/lib/          Domain types, warranties, metrics, notification rules, CSV helpers
src/services/     Supabase configuration, live API, transactional demo adapter
src/hooks/        React Query reads, mutation handling, cache invalidation
src/components/   Controls, forms, hardware/audit dialogs
src/pages/        Overview, clients, sites, stock, warranties, notifications, settings
supabase/         Ordered migrations and optional local CLI configuration
tests/            Application tests, baseline DB tests, populated upgrade/RMA tests
docs/             Android API contract and delivery verification
scripts/          Source archive packager
```

The UI calls a separate service/API layer. Kotlin can mirror the same Supabase Auth, tables, JSON entities, and RPC endpoints; no separate Node server is needed. Read `docs/ANDROID_API.md`. The same app account sees the same records on web and Android. Shared staff access would require an organization/membership authorization model; do not disable RLS to share records.

`get_workspace` returns a consistent snapshot of the account's seven collections, avoiding separate inconsistent reads. It loads the full account dataset into memory; add server pagination/aggregate endpoints for very large fleets. Writes are not automatically retried. On an ambiguous network timeout, refresh and reconcile before retrying; dedicated idempotency keys are not implemented for business mutations.

## Test and deploy

```bash
npm test
npm run test:database
npm run build
```

The test suite includes 30 application checks (13 for authentication and the login boundary), 22 baseline PostgreSQL checks, and 35 populated schema-upgrade/RMA checks. The database harness uses PGlite and a mocked Auth helper to run the actual SQL. Live schema/grant/RLS checks were also performed. See `docs/VALIDATION.md` for verification limits and pre-existing project advisories.

Serve `dist/` from an HTTPS static host. State-based navigation needs no history-route fallback. The login page can be publicly reachable; company data and the dashboard require Supabase app authentication. The hosted Solara URL is configured to use this login rather than a ChatGPT workspace sign-in.

To rebuild source downloads using Python 3:

```bash
npm run package:source
npm run build
```

The ZIP excludes `.env`, administrator credentials, Git metadata, dependencies, runtime state, and build output. It includes public project configuration, source, tests, migrations, docs, and the tested lockfile. Use Supabase backups for live records; local demo storage is not a production backup.

Official references: https://supabase.com/docs/guides/database/postgres/row-level-security · https://supabase.com/docs/guides/database/functions · https://tailwindcss.com/docs/dark-mode
