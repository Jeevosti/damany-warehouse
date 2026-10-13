-- Solara / PostgreSQL 15+ / Supabase. Run once in the SQL editor or via supabase db push.
-- Data is scoped to the authenticated account. Web and Android use the same RLS rules.
begin;
create table public.clients (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) > 0), phone text not null default '', email text not null default '',
 location_address text not null default '', gps_coordinates text not null default '',
 created_at timestamptz not null default now(), unique(id,owner_id)
);
create table public.installations (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 client_id uuid not null, site_name text not null check(length(trim(site_name))>0),
 system_type text not null default 'Hybrid', commissioning_date date not null,
 status text not null default 'Active' check(status in ('Active','Pending Maintenance','Commissioning','Inactive')),
 notes text not null default '', capacity_kw numeric(12,2) not null default 0 check(capacity_kw>=0),
 created_at timestamptz not null default now(), unique(id,owner_id),
 foreign key(client_id,owner_id) references public.clients(id,owner_id) on delete cascade
);
create table public.inventory_items (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 item_type text not null check(length(trim(item_type))>0), brand text not null check(length(trim(brand))>0), model text not null default '',
 total_stock integer not null default 0 check(total_stock>=0),
 unit_price numeric(14,2) not null default 0 check(unit_price>=0),
 low_stock_threshold integer not null default 5 check(low_stock_threshold>=0), unique(id,owner_id)
);
-- Every physical unit is registered before deployment; this is the in-house serial ledger.
create table public.inventory_units (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 inventory_item_id uuid not null,
 serial_number text not null unique check(length(trim(serial_number))>0 and serial_number=upper(trim(serial_number))),
 received_date date not null default current_date,
 unique(serial_number,inventory_item_id,owner_id),
 foreign key(inventory_item_id,owner_id) references public.inventory_items(id,owner_id) on delete restrict
);
create table public.site_components (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 installation_id uuid not null, inventory_item_id uuid not null,
 serial_number text not null unique, warranty_months integer not null check(warranty_months between 0 and 1200), installed_date date not null,
 foreign key(installation_id,owner_id) references public.installations(id,owner_id) on delete cascade,
 foreign key(inventory_item_id,owner_id) references public.inventory_items(id,owner_id) on delete restrict,
 foreign key(serial_number,inventory_item_id,owner_id) references public.inventory_units(serial_number,inventory_item_id,owner_id) on delete restrict
);
create index clients_owner_idx on public.clients(owner_id);
create index installations_client_idx on public.installations(client_id,owner_id);
create index installations_owner_idx on public.installations(owner_id);
create index inventory_items_owner_idx on public.inventory_items(owner_id);
create index inventory_units_item_idx on public.inventory_units(inventory_item_id,owner_id);
create index inventory_units_owner_idx on public.inventory_units(owner_id);
create index components_installation_idx on public.site_components(installation_id,owner_id);
create index components_item_idx on public.site_components(inventory_item_id,owner_id);
create index components_owner_idx on public.site_components(owner_id);

alter table public.clients enable row level security;
alter table public.installations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_units enable row level security;
alter table public.site_components enable row level security;
create policy account_rows on public.clients to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy account_rows on public.installations to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy account_rows on public.inventory_items to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy account_rows on public.inventory_units to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy account_rows on public.site_components to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

-- Trigger functions are privileged only to maintain derived stock. No direct RPC access.
create function public.adjust_stock_for_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  update public.inventory_items set total_stock=total_stock+1 where id=new.inventory_item_id and owner_id=new.owner_id;
  return new;
 else
  update public.inventory_items set total_stock=total_stock-1 where id=old.inventory_item_id and owner_id=old.owner_id;
  return old;
 end if;
end $$;
create trigger inventory_unit_stock after insert or delete on public.inventory_units for each row execute function public.adjust_stock_for_unit();
create function public.adjust_stock_for_component() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  -- UPDATE acquires the product row lock. Competing allocations cannot oversell.
  update public.inventory_items set total_stock=total_stock-1 where id=new.inventory_item_id and owner_id=new.owner_id and total_stock>0;
  if not found then raise exception 'This item has no warehouse stock available.'; end if;
  return new;
 else
  update public.inventory_items set total_stock=total_stock+1 where id=old.inventory_item_id and owner_id=old.owner_id;
  return old;
 end if;
end $$;
create trigger deployed_stock after insert or delete on public.site_components for each row execute function public.adjust_stock_for_component();
revoke all on function public.adjust_stock_for_unit(),public.adjust_stock_for_component() from public,anon,authenticated;

-- Restrict writes at the column level; clients cannot change stock counters or ownership.
revoke all on public.clients,public.installations,public.inventory_items,public.inventory_units,public.site_components from anon,authenticated;
grant select on public.clients,public.installations,public.inventory_items,public.inventory_units,public.site_components to authenticated;
grant insert(name,phone,email,location_address,gps_coordinates),update(name,phone,email,location_address,gps_coordinates),delete on public.clients to authenticated;
grant insert(client_id,site_name,system_type,commissioning_date,status,notes,capacity_kw),update(site_name,system_type,commissioning_date,status,notes,capacity_kw),delete on public.installations to authenticated;
grant insert(item_type,brand,model,unit_price,low_stock_threshold),update(item_type,brand,model,unit_price,low_stock_threshold) on public.inventory_items to authenticated;
grant insert(inventory_item_id,serial_number,received_date) on public.inventory_units to authenticated;
grant insert(installation_id,inventory_item_id,serial_number,warranty_months,installed_date),delete,update(warranty_months,installed_date) on public.site_components to authenticated;

create function public.receive_stock(p_item_id uuid default null,p_item jsonb default null,p_serials text[] default '{}',p_received_date date default current_date)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_item uuid:=p_item_id; v_serial text;
begin
 if auth.uid() is null then raise exception 'Sign in to receive stock.'; end if;
 if cardinality(p_serials)=0 or cardinality(p_serials)>10000 then raise exception 'Supply 1 to 10000 serial numbers.'; end if;
 if v_item is null then
  insert into public.inventory_items(item_type,brand,model,unit_price,low_stock_threshold)
  values(p_item->>'item_type',p_item->>'brand',coalesce(p_item->>'model',''),(p_item->>'unit_price')::numeric,coalesce((p_item->>'low_stock_threshold')::int,5)) returning id into v_item;
 end if;
 if not exists(select 1 from public.inventory_items where id=v_item) then raise exception 'Item not found or not accessible.'; end if;
 foreach v_serial in array p_serials loop
  insert into public.inventory_units(inventory_item_id,serial_number,received_date) values(v_item,upper(trim(v_serial)),p_received_date);
 end loop;
 return v_item;
end $$;

create function public.register_site(p_client_id uuid default null,p_client jsonb default null,p_installation jsonb default null,p_components jsonb default '[]')
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_client uuid:=p_client_id; v_site uuid; v_component jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to register a site.'; end if;
 if v_client is null then
  insert into public.clients(name,phone,email,location_address,gps_coordinates)
  values(p_client->>'name',coalesce(p_client->>'phone',''),coalesce(p_client->>'email',''),coalesce(p_client->>'location_address',''),coalesce(p_client->>'gps_coordinates','')) returning id into v_client;
 end if;
 if not exists(select 1 from public.clients where id=v_client) then raise exception 'Client not found or not accessible.'; end if;
 insert into public.installations(client_id,site_name,system_type,commissioning_date,status,notes,capacity_kw)
 values(v_client,p_installation->>'site_name',p_installation->>'system_type',(p_installation->>'commissioning_date')::date,coalesce(p_installation->>'status','Active'),coalesce(p_installation->>'notes',''),coalesce((p_installation->>'capacity_kw')::numeric,0)) returning id into v_site;
 for v_component in select value from jsonb_array_elements(p_components) loop
  insert into public.site_components(installation_id,inventory_item_id,serial_number,warranty_months,installed_date)
  values(v_site,(v_component->>'inventory_item_id')::uuid,upper(trim(v_component->>'serial_number')),(v_component->>'warranty_months')::int,(v_component->>'installed_date')::date);
 end loop;
 return v_site;
end $$;

create function public.assign_components(p_installation_id uuid,p_components jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_component jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to assign hardware.'; end if;
 if not exists(select 1 from public.installations where id=p_installation_id) then raise exception 'Site not found or not accessible.'; end if;
 for v_component in select value from jsonb_array_elements(p_components) loop
  insert into public.site_components(installation_id,inventory_item_id,serial_number,warranty_months,installed_date)
  values(p_installation_id,(v_component->>'inventory_item_id')::uuid,upper(trim(v_component->>'serial_number')),(v_component->>'warranty_months')::int,(v_component->>'installed_date')::date);
 end loop;
end $$;
-- Snapshot is a single PostgreSQL statement, avoiding inconsistent cross-table reads.
create function public.get_workspace() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'clients',coalesce((select jsonb_agg(t order by created_at desc) from public.clients t),'[]'::jsonb),
  'installations',coalesce((select jsonb_agg(t order by created_at desc) from public.installations t),'[]'::jsonb),
  'inventory_items',coalesce((select jsonb_agg(t order by brand,model) from public.inventory_items t),'[]'::jsonb),
  'inventory_units',coalesce((select jsonb_agg(t order by serial_number) from public.inventory_units t),'[]'::jsonb),
  'site_components',coalesce((select jsonb_agg(t order by installed_date desc) from public.site_components t),'[]'::jsonb)
 );
$$;
-- Security-invoker view preserves underlying RLS. Countdown is computed, never stored.
create view public.component_warranties with(security_invoker=true) as
 select c.*,i.commissioning_date,
 (i.commissioning_date + make_interval(months=>c.warranty_months))::date as warranty_expires_on,
 (i.commissioning_date + make_interval(months=>c.warranty_months))::date - (now() at time zone 'Africa/Nairobi')::date as days_remaining
 from public.site_components c join public.installations i on i.id=c.installation_id and i.owner_id=c.owner_id;
revoke all on public.component_warranties from anon;
grant select on public.component_warranties to authenticated;
revoke all on function public.receive_stock(uuid,jsonb,text[],date),public.register_site(uuid,jsonb,jsonb,jsonb),public.assign_components(uuid,jsonb),public.get_workspace() from public,anon;
grant execute on function public.receive_stock(uuid,jsonb,text[],date),public.register_site(uuid,jsonb,jsonb,jsonb),public.assign_components(uuid,jsonb),public.get_workspace() to authenticated;
commit;
