-- Additive upgrade for the existing Damany/Solara customer database.
-- Run once in the SQL Editor of the project used by your Netlify site.
-- Invoice amounts are integer KES cents. Existing stock/customer records are not modified.
begin;

create schema credit_private;
revoke all on schema credit_private from public, anon, authenticated;
grant usage on schema credit_private to authenticated;

create table credit_private.invoice_counters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_year integer not null,
  last_number bigint not null default 0,
  primary key (owner_id, invoice_year)
);
alter table credit_private.invoice_counters enable row level security;
revoke all on credit_private.invoice_counters from public, anon, authenticated;

create table public.credit_invoices (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  invoice_number text not null,
  issuer_name text not null check (length(trim(issuer_name)) between 1 and 120),
  customer jsonb not null,
  issued_on date not null,
  due_on date not null check (due_on >= issued_on),
  notes text not null default '' check (length(notes) <= 2000),
  total_cents bigint not null check (total_cents between 1 and 9000000000000),
  create_payload jsonb not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  unique (id, owner_id),
  unique (owner_id, invoice_number),
  foreign key (client_id, owner_id) references public.clients(id, owner_id),
  check ((voided_at is null and void_reason is null) or
         (voided_at is not null and length(trim(void_reason)) between 1 and 500))
);
create table public.credit_invoice_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  position integer not null check (position between 1 and 100),
  description text not null check (length(trim(description)) between 1 and 300),
  quantity integer not null check (quantity between 1 and 1000000),
  unit_price_cents bigint not null check (unit_price_cents between 0 and 9000000000000),
  unique (invoice_id, position),
  foreign key (invoice_id, owner_id) references public.credit_invoices(id, owner_id) on delete cascade
);
create table public.credit_invoice_payments (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 9000000000000),
  paid_on date not null,
  method text not null check (method in ('M-Pesa', 'Cash', 'Bank transfer', 'Card', 'Other')),
  reference text not null default '' check (length(reference) <= 120),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text,
  foreign key (invoice_id, owner_id) references public.credit_invoices(id, owner_id) on delete cascade,
  check ((reversed_at is null and reversal_reason is null) or
         (reversed_at is not null and length(trim(reversal_reason)) between 1 and 500))
);
create index credit_invoices_client_idx on public.credit_invoices(client_id, owner_id);
create index credit_invoices_due_idx on public.credit_invoices(owner_id, due_on) where voided_at is null;
create index credit_invoice_items_owner_idx on public.credit_invoice_items(owner_id, invoice_id);
create index credit_invoice_payments_owner_idx on public.credit_invoice_payments(owner_id, invoice_id);

alter table public.credit_invoices enable row level security;
alter table public.credit_invoice_items enable row level security;
alter table public.credit_invoice_payments enable row level security;
create policy credit_invoice_read on public.credit_invoices for select to authenticated using (owner_id = (select auth.uid()));
create policy credit_item_read on public.credit_invoice_items for select to authenticated using (owner_id = (select auth.uid()));
create policy credit_payment_read on public.credit_invoice_payments for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.credit_invoices, public.credit_invoice_items, public.credit_invoice_payments from public, anon, authenticated;
grant select on public.credit_invoices, public.credit_invoice_items, public.credit_invoice_payments to authenticated;

-- Only these checked routines can write the immutable ledger. Private definer
-- routines explicitly enforce ownership. Public wrappers remain SECURITY INVOKER.
create function credit_private.create_invoice(p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid(); v_id uuid := (p_input->>'request_id')::uuid;
  v_client public.clients%rowtype; v_existing public.credit_invoices%rowtype;
  v_issued date := (p_input->>'issued_on')::date; v_due date := (p_input->>'due_on')::date;
  v_item jsonb; v_total bigint := 0; v_price bigint; v_quantity integer;
  v_year integer; v_number bigint; v_position integer := 0;
begin
  if v_owner is null then raise exception 'Sign in to create invoices.' using errcode = '42501'; end if;
  if v_id is null or v_issued is null or v_due is null then raise exception 'Invoice ID and dates are required.'; end if;
  if v_issued > (now() at time zone 'Africa/Nairobi')::date then raise exception 'The invoice date cannot be in the future.'; end if;
  if v_due < v_issued then raise exception 'The due date cannot be before the invoice date.'; end if;
  v_year := extract(year from v_issued)::integer;
  insert into credit_private.invoice_counters(owner_id, invoice_year) values(v_owner, v_year) on conflict do nothing;
  perform 1 from credit_private.invoice_counters where owner_id = v_owner and invoice_year = v_year for update;
  select * into v_existing from public.credit_invoices where id = v_id;
  if found then
    if v_existing.owner_id <> v_owner then raise exception 'Invoice not accessible.' using errcode = '42501'; end if;
    if v_existing.create_payload <> p_input then raise exception 'This invoice was already saved. Refresh before creating another invoice.'; end if;
    return v_existing.id;
  end if;
  select * into v_client from public.clients where id = (p_input->>'client_id')::uuid and owner_id = v_owner;
  if not found then raise exception 'Customer not found or not accessible.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'Invoice items are required.'; end if;
  if jsonb_array_length(p_input->'items') not between 1 and 100 then raise exception 'Add between 1 and 100 invoice items.'; end if;
  for v_item in select value from jsonb_array_elements(p_input->'items') loop
    if coalesce(v_item->>'quantity', '') !~ '^[0-9]+$' or coalesce(v_item->>'unit_price_cents', '') !~ '^[0-9]+$' then raise exception 'Quantities and prices in cents must be whole numbers.'; end if;
    v_quantity := (v_item->>'quantity')::integer; v_price := (v_item->>'unit_price_cents')::bigint;
    if v_quantity not between 1 and 1000000 or v_price not between 0 and 9000000000000 then raise exception 'Invalid quantity or price.'; end if;
    if coalesce(length(trim(v_item->>'description')), 0) not between 1 and 300 then raise exception 'Each item needs a description of up to 300 characters.'; end if;
    if v_price::numeric * v_quantity + v_total > 9000000000000 then raise exception 'The invoice total is too large.'; end if;
    v_total := v_total + v_price * v_quantity;
  end loop;
  if v_total < 1 then raise exception 'The invoice total must be greater than zero.'; end if;
  update credit_private.invoice_counters set last_number = last_number + 1 where owner_id = v_owner and invoice_year = v_year returning last_number into v_number;
  insert into public.credit_invoices(id, owner_id, client_id, invoice_number, issuer_name, customer, issued_on, due_on, notes, total_cents, create_payload)
  values(v_id, v_owner, v_client.id, 'INV-' || v_year || '-' || lpad(v_number::text, greatest(5, length(v_number::text)), '0'),
    trim(p_input->>'issuer_name'), jsonb_build_object('name', v_client.name, 'phone', v_client.phone, 'email', v_client.email, 'location_address', v_client.location_address),
    v_issued, v_due, coalesce(p_input->>'notes', ''), v_total, p_input);
  for v_item in select value from jsonb_array_elements(p_input->'items') loop
    v_position := v_position + 1;
    insert into public.credit_invoice_items(owner_id, invoice_id, position, description, quantity, unit_price_cents)
    values(v_owner, v_id, v_position, trim(v_item->>'description'), (v_item->>'quantity')::integer, (v_item->>'unit_price_cents')::bigint);
  end loop;
  return v_id;
end $$;

create function credit_private.record_payment(p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid(); v_id uuid := (p_input->>'request_id')::uuid;
  v_invoice public.credit_invoices%rowtype; v_existing public.credit_invoice_payments%rowtype;
  v_amount bigint; v_paid bigint; v_date date := (p_input->>'paid_on')::date;
begin
  if v_owner is null then raise exception 'Sign in to record payments.' using errcode = '42501'; end if;
  if coalesce(p_input->>'amount_cents', '') !~ '^[0-9]+$' then raise exception 'Enter a positive payment in whole cents.'; end if;
  v_amount := (p_input->>'amount_cents')::bigint;
  -- All payment/void/reversal writes lock this invoice first. Concurrent payments
  -- therefore see the latest balance and cannot overpay it.
  select * into v_invoice from public.credit_invoices where id = (p_input->>'invoice_id')::uuid and owner_id = v_owner for update;
  if not found then raise exception 'Invoice not found or not accessible.' using errcode = '42501'; end if;
  select * into v_existing from public.credit_invoice_payments where id = v_id;
  if found then
    if v_existing.owner_id <> v_owner then raise exception 'Payment not accessible.' using errcode = '42501'; end if;
    if v_existing.invoice_id <> v_invoice.id or v_existing.amount_cents <> v_amount or v_existing.paid_on is distinct from v_date or v_existing.method is distinct from p_input->>'method' or v_existing.reference <> coalesce(p_input->>'reference', '') then
      raise exception 'This payment was already recorded. Refresh before recording another payment.';
    end if;
    return v_id;
  end if;
  if v_invoice.voided_at is not null then raise exception 'This invoice has been voided.'; end if;
  if v_id is null or v_date is null or v_date < v_invoice.issued_on or v_date > (now() at time zone 'Africa/Nairobi')::date then raise exception 'Choose a payment date between the invoice date and today.'; end if;
  select coalesce(sum(amount_cents), 0) into v_paid from public.credit_invoice_payments where invoice_id = v_invoice.id and owner_id = v_owner and reversed_at is null;
  if v_amount < 1 or v_amount > v_invoice.total_cents - v_paid then raise exception 'The payment exceeds the outstanding balance or is not positive. Refresh and check the amount.'; end if;
  insert into public.credit_invoice_payments(id, owner_id, invoice_id, amount_cents, paid_on, method, reference)
  values(v_id, v_owner, v_invoice.id, v_amount, v_date, p_input->>'method', coalesce(p_input->>'reference', ''));
  return v_id;
end $$;

create function credit_private.void_invoice(p_invoice_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_invoice public.credit_invoices%rowtype;
begin
  if v_owner is null then raise exception 'Sign in to void invoices.' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 1 and 500 then raise exception 'Enter a reason of up to 500 characters.'; end if;
  select * into v_invoice from public.credit_invoices where id = p_invoice_id and owner_id = v_owner for update;
  if not found then raise exception 'Invoice not accessible.' using errcode = '42501'; end if;
  if v_invoice.voided_at is not null then return; end if;
  if exists(select 1 from public.credit_invoice_payments where invoice_id = p_invoice_id and owner_id = v_owner and reversed_at is null) then raise exception 'Reverse any recorded payments before voiding this invoice.'; end if;
  update public.credit_invoices set voided_at = now(), void_reason = trim(p_reason) where id = p_invoice_id and owner_id = v_owner;
end $$;

create function credit_private.reverse_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_invoice_id uuid;
begin
  if v_owner is null then raise exception 'Sign in to reverse payments.' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 1 and 500 then raise exception 'Enter a reason of up to 500 characters.'; end if;
  select invoice_id into v_invoice_id from public.credit_invoice_payments where id = p_payment_id and owner_id = v_owner;
  if not found then raise exception 'Payment not accessible.' using errcode = '42501'; end if;
  perform 1 from public.credit_invoices where id = v_invoice_id and owner_id = v_owner for update;
  update public.credit_invoice_payments set reversed_at = now(), reversal_reason = trim(p_reason)
    where id = p_payment_id and owner_id = v_owner and reversed_at is null;
end $$;

create function public.create_credit_invoice(p_input jsonb) returns uuid language sql security invoker set search_path = '' as $$select credit_private.create_invoice(p_input)$$;
create function public.record_credit_payment(p_input jsonb) returns uuid language sql security invoker set search_path = '' as $$select credit_private.record_payment(p_input)$$;
create function public.void_credit_invoice(p_invoice_id uuid, p_reason text) returns void language sql security invoker set search_path = '' as $$select credit_private.void_invoice(p_invoice_id, p_reason)$$;
create function public.reverse_credit_payment(p_payment_id uuid, p_reason text) returns void language sql security invoker set search_path = '' as $$select credit_private.reverse_payment(p_payment_id, p_reason)$$;
create function public.get_credit_invoices() returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(
    (to_jsonb(i) - 'create_payload' - 'owner_id') || jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(l) - 'owner_id' order by l.position) from public.credit_invoice_items l where l.invoice_id = i.id and l.owner_id = i.owner_id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(to_jsonb(p) - 'owner_id' order by p.paid_on, p.created_at) from public.credit_invoice_payments p where p.invoice_id = i.id and p.owner_id = i.owner_id), '[]'::jsonb)
    ) order by i.created_at desc, i.invoice_number desc
  ), '[]'::jsonb) from public.credit_invoices i;
$$;

revoke all on function credit_private.create_invoice(jsonb), credit_private.record_payment(jsonb), credit_private.void_invoice(uuid,text), credit_private.reverse_payment(uuid,text) from public, anon, authenticated;
grant execute on function credit_private.create_invoice(jsonb), credit_private.record_payment(jsonb), credit_private.void_invoice(uuid,text), credit_private.reverse_payment(uuid,text) to authenticated;
revoke all on function public.create_credit_invoice(jsonb), public.record_credit_payment(jsonb), public.void_credit_invoice(uuid,text), public.reverse_credit_payment(uuid,text), public.get_credit_invoices() from public, anon, authenticated;
grant execute on function public.create_credit_invoice(jsonb), public.record_credit_payment(jsonb), public.void_credit_invoice(uuid,text), public.reverse_credit_payment(uuid,text), public.get_credit_invoices() to authenticated;
notify pgrst, 'reload schema';
commit;
