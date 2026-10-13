# Android API contract

The future Kotlin client can use Supabase Kotlin (Auth + Postgrest plugins) or any HTTPS client. This project does not include a compiled Android app. No frontend-only rule is required for database integrity.

## Authentication

Use the same project URL and public publishable/anon key as the web app. Sign in through Supabase Auth with email/password. All table and RPC calls include the signed-in user's access token. The SDK should refresh sessions automatically. Never put a service-role/secret key in an APK.

HTTP equivalents:

```text
POST {SUPABASE_URL}/auth/v1/token?grant_type=password
apikey: {PUBLIC_KEY}
Content-Type: application/json

{"email":"your-user@example.com","password":"user-entered-password"}
```

For subsequent calls:

```text
apikey: {PUBLIC_KEY}
Authorization: Bearer {USER_ACCESS_TOKEN}
Content-Type: application/json
```

Each authenticated account owns one isolated workspace. Web and Android must sign in as the same account to share its data. A company-wide team model would require an organization-membership migration; separate users do not automatically share records.

## Shared endpoints

| Operation | Endpoint | Request JSON |
|---|---|---|
| Load consistent snapshot | `POST /rest/v1/rpc/get_workspace` | `{}` |
| Create client | `POST /rest/v1/clients` | Client fields, excluding id/owner_id/created_at |
| Update client | `PATCH /rest/v1/clients?id=eq.{id}` | Changed contact fields |
| Receive serialized stock | `POST /rest/v1/rpc/receive_stock` | Parameters below |
| Register client + site + hardware | `POST /rest/v1/rpc/register_site` | Parameters below |
| Assign hardware to existing site | `POST /rest/v1/rpc/assign_components` | Parameters below |
| Update installation | `PATCH /rest/v1/installations?id=eq.{id}` | site_name, status, notes, commissioning_date, capacity_kw, system_type |
| Fault / replacement (v2) | `POST /rest/v1/rpc/process_rma` | component ID, reason, optional replacement |
| Read dynamic warranties | `GET /rest/v1/component_warranties?select=*` | None |

For create/update/delete table requests, add `Prefer: return=representation` if you need the affected rows. All operations obey RLS. Use UUID strings and ISO calendar dates (`YYYY-MM-DD`). Timestamps use ISO 8601 with an offset. Numeric database values may arrive as JSON numbers; use an appropriate decimal type for KES prices. Lists are arrays, including empty arrays; text contact fields default to empty strings.

`get_workspace` returns:

```json
{
  "clients": [],
  "installations": [],
  "inventory_items": [],
  "inventory_units": [],
  "site_components": []
}
```

The exact entity fields are defined in `src/lib/types.ts` and the SQL migration. Kotlin serializable data classes should use `@SerialName` for snake_case JSON names, or define matching snake_case fields.

### Receive stock

For a new product:

```json
{
  "p_item_id": null,
  "p_item": {"item_type":"Inverter","brand":"Deye","model":"SUN-8K","unit_price":185000,"low_stock_threshold":5,"is_serialized":true,"default_warranty_months":60},
  "p_serials": ["DEYE-UNIT-0001", "DEYE-UNIT-0002"],
  "p_received_date": "2026-10-12"
}
```

For an existing product, provide `p_item_id` and set `p_item` to null. `p_received_date` is optional and defaults to the Africa/Nairobi business date. Returns the product UUID. One batch accepts 1–10,000 serials. All serials are normalized to uppercase. Any duplicate rejects and rolls back the whole receipt.

### Register an installation

```json
{
  "p_client_id": null,
  "p_client": {"name":"Example client","phone":"","email":"","location_address":"Nairobi","gps_coordinates":""},
  "p_installation": {"site_name":"Example residence","system_type":"Hybrid","commissioning_date":"2026-10-12","status":"Active","notes":"","capacity_kw":8},
  "p_components": [{"inventory_item_id":"PRODUCT_UUID","serial_number":"DEYE-UNIT-0001","warranty_months":60,"installed_date":"2026-10-12"}]
}
```

For an existing client, provide `p_client_id` and set `p_client` to null. Returns the installation UUID. All new records and assignments commit atomically. Never emulate this RPC with independent client-side writes, since a failure could leave a partially registered site.

### Assign existing hardware

```json
{
  "p_installation_id":"SITE_UUID",
  "p_components":[{"inventory_item_id":"PRODUCT_UUID","serial_number":"DEYE-UNIT-0002","warranty_months":60,"installed_date":"2026-10-12"}]
}
```

Returns void. Serials must exist in `inventory_units`, belong to the matching product and owner, and be unassigned. For a list of available units, filter `inventory_units` to `state = Available`; historical components and faulty units remain in the ledger. Do not trust this client-side list as an allocation lock; the backend revalidates at commit.

## Dates in Kotlin

Use `java.time.LocalDate.parse(commissioningDate).plusMonths(warrantyMonths.toLong())`. Java's `plusMonths` clamps month ends like PostgreSQL and this frontend. Use `LocalDate.now(ZoneId.of("Africa/Nairobi"))` as the local business date and `ChronoUnit.DAYS.between(today, expiry)` for remaining days. Classify red below 30 days, green when `expiry.isAfter(today.plusMonths(6))`, and amber otherwise. Expired is `daysRemaining < 0`. Query the `component_warranties` view if you prefer database-calculated dates.

## Errors and offline behavior

- `23505`: a serial is already registered/deployed. Refetch availability; don't blindly retry the same allocation.
- `23503`: a referenced record is missing or belongs to another account.
- `42501`: insufficient privileges or a row policy denied the operation.
- `PGRST202`: the required RPC is missing; apply the migration.
- Expired JWT: refresh the Auth session; do not fall back to an anonymous write.

The web mutation layer does not automatically retry writes. Stock operations are transactional but do not accept a dedicated idempotency key. On an ambiguous network timeout, reload the workspace and reconcile the serial/site before manually retrying. A future offline Android client should keep read-only cached views and queue user-reviewed commands with idempotency identifiers added to the backend, not blindly replay stock writes.

## Version 2 API additions (supersedes v1 stock/return behavior)

New snapshot arrays: `component_events` and `notification_reads`. Inventory products include `is_serialized` and `default_warranty_months`; units include nullable `serial_number` and `state` (Available/Deployed/Faulty). Components include `inventory_unit_id`, `status` (Installed/Returned_Faulty/Replaced), nullable `replaced_by_component_id`, and `created_at`.

`receive_stock` now accepts `p_quantity` (integer, default 0). For serialized products, supply `p_serials` as before. For non-serialized products, send `p_serials: []` and `p_quantity: 10`. New `p_item` objects accept `is_serialized` (default false) and `default_warranty_months`. Warehouse unit IDs are generated for all quantities, even when serial numbers are null.

Component input objects support `quantity` (default 1, maximum 1000). A serialized input must have exactly one unit and an available serial number. An anonymous quantity input has `serial_number: null`. If `warranty_months` is omitted in a database RPC, the product's configured default is used.

### Fault and replacement

`POST /rest/v1/rpc/process_rma`

```json
{
  "p_component_id": "ORIGINAL_COMPONENT_UUID",
  "p_reason": "RMA-2026-001: failed output test",
  "p_replacement": {
    "inventory_item_id": "REPLACEMENT_PRODUCT_UUID",
    "serial_number": "NEW-UNIQUE-SERIAL",
    "warranty_months": 60,
    "installed_date": "2026-10-12",
    "quantity": 1
  }
}
```

Set `p_replacement` to null to mark Returned_Faulty now and replace later. Call the same RPC later with the replacement. It returns `component_id`, `replacement_component_id` (nullable), and `status`. Both units must belong to the signed-in account; replacement product type must match the original. The replacement is allocated from Available stock in the same transaction as the old status update and audit insert. Failure rolls back everything. History and faulty units cannot be manually deleted or re-added to stock through the public API.

The original v1 DELETE endpoint for a warehouse return is no longer granted. It is replaced by the explicit fault/RMA operation, which quarantines stock and preserves history. Do not decrement stock directly or delete the old row when replacing hardware.

### Read notifications

`POST /rest/v1/rpc/mark_notifications_read`

```json
{"p_keys":["stock:PRODUCT_UUID:0","warranty:COMPONENT_UUID:2031-10-12:urgent"]}
```

Up to 1000 keys per call; acknowledgement is idempotent. The domain-level alert construction is documented in `src/lib/notifications.ts` and can be mirrored in Kotlin. It is derived from the current snapshot, not generated by a background scheduler. The alert title and category are not trusted as access-control inputs. Notification reads are account scoped.

For Kotlin warranty progress, compute total calendar days from commissioning to expiry, and clamp `remainingDays / totalDays * 100` to 0–100. A zero-month warranty has 0% remaining. Use only Installed components for current coverage summaries; Returned_Faulty and Replaced are historical. RMA replacement warranty dates remain anchored to the site's original commissioning date.
