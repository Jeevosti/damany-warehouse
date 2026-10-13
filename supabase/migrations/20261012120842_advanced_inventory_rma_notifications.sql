-- Upgrade v1 data in place. Existing serialized records keep their identifiers and warranties.
begin;
create schema if not exists solara_private;
revoke all on schema solara_private from public,anon;
grant usage on schema solara_private to authenticated;
alter table public.inventory_items add column is_serialized boolean not null default false,
 add column default_warranty_months integer not null default 60 check(default_warranty_months between 0 and 1200);
update public.inventory_items i set is_serialized=true where exists(select 1 from public.inventory_units u where u.inventory_item_id=i.id);
update public.inventory_items set default_warranty_months=300 where item_type='Solar Panel';
alter table public.inventory_units alter column serial_number drop not null;
alter table public.inventory_units add column state text not null default 'Available' check(state in ('Available','Deployed','Faulty'));
alter table public.inventory_units add constraint inventory_units_identity unique(id,inventory_item_id,owner_id);
alter table public.site_components alter column serial_number drop not null;
alter table public.site_components add column status text not null default 'Installed' check(status in ('Installed','Returned_Faulty','Replaced')),
 add column replaced_by_component_id uuid,
 add column inventory_unit_id uuid,
 add column created_at timestamptz not null default now();
update public.site_components c set inventory_unit_id=u.id from public.inventory_units u where u.serial_number=c.serial_number and u.inventory_item_id=c.inventory_item_id and u.owner_id=c.owner_id;
alter table public.site_components alter column inventory_unit_id set not null;
alter table public.site_components add constraint components_unit_unique unique(inventory_unit_id),
 add constraint components_owned_identity unique(id,owner_id),
 add constraint components_unit_fk foreign key(inventory_unit_id,inventory_item_id,owner_id) references public.inventory_units(id,inventory_item_id,owner_id),
 add constraint replacement_owned_fk foreign key(replaced_by_component_id,owner_id) references public.site_components(id,owner_id) deferrable initially deferred,
 add constraint component_replacement_state check((status='Replaced')=(replaced_by_component_id is not null)),
 add constraint no_self_replacement check(replaced_by_component_id is distinct from id);
create unique index one_replacement_parent on public.site_components(replaced_by_component_id) where replaced_by_component_id is not null;
create index units_available_idx on public.inventory_units(owner_id,inventory_item_id,received_date,id) where state='Available';
create index components_status_idx on public.site_components(owner_id,status);
-- Replace v1 counters with a single physical-unit state ledger.
drop trigger inventory_unit_stock on public.inventory_units;
drop trigger deployed_stock on public.site_components;
drop function public.adjust_stock_for_unit();
drop function public.adjust_stock_for_component();
update public.inventory_units u set state='Deployed' where exists(select 1 from public.site_components c where c.inventory_unit_id=u.id);
update public.inventory_items i set total_stock=(select count(*) from public.inventory_units u where u.inventory_item_id=i.id and u.state='Available');

create table public.component_events(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 component_id uuid not null,event_type text not null check(event_type in ('Assigned','Returned_Faulty','Replaced')),
 replacement_component_id uuid,reason text not null default '',actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(component_id,owner_id) references public.site_components(id,owner_id) on delete cascade,
 foreign key(replacement_component_id,owner_id) references public.site_components(id,owner_id) deferrable initially deferred
);
create index component_events_owner_idx on public.component_events(owner_id,created_at desc);
create index component_events_component_idx on public.component_events(component_id,owner_id);
create index component_events_replacement_idx on public.component_events(replacement_component_id,owner_id);
create index component_events_actor_idx on public.component_events(actor_id);
alter table public.component_events enable row level security;
create policy account_event_reads on public.component_events for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.component_events from public,anon,authenticated;
grant select on public.component_events to authenticated;
insert into public.component_events(owner_id,component_id,event_type,reason,actor_id,created_at)
 select owner_id,id,'Assigned','Existing assignment retained during schema upgrade',owner_id,created_at from public.site_components;
create table public.notification_reads(
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 notification_key text not null check(length(notification_key) between 1 and 250),read_at timestamptz not null default now(),primary key(owner_id,notification_key)
);
alter table public.notification_reads enable row level security;
create policy account_notification_reads on public.notification_reads to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
revoke all on public.notification_reads from public,anon,authenticated;
grant select,insert(notification_key),update(read_at) on public.notification_reads to authenticated;

create function solara_private.enforce_unit() returns trigger language plpgsql security definer set search_path='' as $$
declare v_serialized boolean; v_delta int;
begin
 if tg_op='DELETE' then
  if old.state='Available' then update public.inventory_items set total_stock=total_stock-1 where id=old.inventory_item_id and owner_id=old.owner_id; end if;
  return old;
 end if;
 select is_serialized into v_serialized from public.inventory_items where id=new.inventory_item_id and owner_id=new.owner_id;
 if not found then raise exception 'Product not found.'; end if;
 new.serial_number:=nullif(upper(trim(new.serial_number)),'');
 if v_serialized and new.serial_number is null then raise exception 'A unique serial number is required for this product.'; end if;
 if tg_op='UPDATE' and (new.id,new.inventory_item_id,new.owner_id,new.serial_number) is distinct from (old.id,old.inventory_item_id,old.owner_id,old.serial_number) then raise exception 'Physical unit identity is immutable.'; end if;
 v_delta:=case when new.state='Available' then 1 else 0 end;
 if tg_op='UPDATE' then v_delta:=v_delta-case when old.state='Available' then 1 else 0 end; end if;
 if v_delta<>0 then update public.inventory_items set total_stock=total_stock+v_delta where id=new.inventory_item_id and owner_id=new.owner_id; end if;
 return new;
end $$;
create trigger maintain_physical_stock before insert or update or delete on public.inventory_units for each row execute function solara_private.enforce_unit();
create function solara_private.enforce_component() returns trigger language plpgsql security definer set search_path='' as $$
declare v_unit public.inventory_units; v_serialized boolean;
begin
 select * into v_unit from public.inventory_units where id=new.inventory_unit_id and owner_id=new.owner_id and inventory_item_id=new.inventory_item_id for update;
 if not found then raise exception 'Matching warehouse unit not found.'; end if;
 select is_serialized into v_serialized from public.inventory_items where id=new.inventory_item_id and owner_id=new.owner_id;
 new.serial_number:=nullif(upper(trim(new.serial_number)),'');
 if v_serialized and new.serial_number is null then raise exception 'A unique serial number is required for this product.'; end if;
 if new.serial_number is distinct from v_unit.serial_number then raise exception 'Component serial must match the warehouse unit.'; end if;
 if tg_op='INSERT' then
  if new.status<>'Installed' or v_unit.state<>'Available' then raise exception 'This physical unit is not available.'; end if;
  update public.inventory_units set state='Deployed' where id=v_unit.id;
 else
  if (new.installation_id,new.inventory_item_id,new.inventory_unit_id,new.serial_number,new.owner_id,new.warranty_months,new.installed_date) is distinct from (old.installation_id,old.inventory_item_id,old.inventory_unit_id,old.serial_number,old.owner_id,old.warranty_months,old.installed_date) then raise exception 'Installed hardware identity and warranty history are immutable.'; end if;
  if old.status='Installed' and new.status='Returned_Faulty' then update public.inventory_units set state='Faulty' where id=v_unit.id;
  elsif old.status='Returned_Faulty' and new.status='Replaced' then
   if not exists(select 1 from public.site_components r where r.id=new.replaced_by_component_id and r.owner_id=new.owner_id and r.installation_id=new.installation_id and r.status='Installed' and r.id<>new.id) then raise exception 'Replacement must be an installed component at the same site.'; end if;
  else raise exception 'Invalid component status transition.';
  end if;
 end if;
 return new;
end $$;
create trigger protect_component before insert or update on public.site_components for each row execute function solara_private.enforce_component();
-- Direct stock/history mutations are closed. Only validated transactional functions can change them.
revoke insert,update,delete on public.inventory_items,public.inventory_units,public.site_components from authenticated;
-- PostgreSQL column grants must also be revoked explicitly.
revoke insert(item_type,brand,model,unit_price,low_stock_threshold),update(item_type,brand,model,unit_price,low_stock_threshold) on public.inventory_items from authenticated;
revoke insert(inventory_item_id,serial_number,received_date) on public.inventory_units from authenticated;
revoke insert(installation_id,inventory_item_id,serial_number,warranty_months,installed_date),update(warranty_months,installed_date) on public.site_components from authenticated;
revoke delete on public.clients,public.installations from authenticated;
-- Prevent changing serialization around already-registered units; configuration is created at receipt.

create function solara_private.allocate_component(p_site uuid,p_component jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_item public.inventory_items; v_unit public.inventory_units; v_serial text; v_id uuid; v_months int;
begin
 if v_owner is null then raise exception 'Authentication required.'; end if;
 if not exists(select 1 from public.installations where id=p_site and owner_id=v_owner) then raise exception 'Installation not found or not accessible.'; end if;
 select * into v_item from public.inventory_items where id=(p_component->>'inventory_item_id')::uuid and owner_id=v_owner for update;
 if not found then raise exception 'Product not found or not accessible.'; end if;
 v_serial:=nullif(upper(trim(p_component->>'serial_number')),'');
 if v_item.is_serialized and v_serial is null then raise exception 'Scan or enter the serial number for this serialized product.'; end if;
 select * into v_unit from public.inventory_units where inventory_item_id=v_item.id and owner_id=v_owner and state='Available' and (v_serial is null or serial_number=v_serial) order by received_date,id limit 1 for update skip locked;
 if not found then raise exception 'No available stock matches the selected product and serial.'; end if;
 v_months:=coalesce((p_component->>'warranty_months')::int,v_item.default_warranty_months);
 insert into public.site_components(owner_id,installation_id,inventory_item_id,inventory_unit_id,serial_number,warranty_months,installed_date)
 values(v_owner,p_site,v_item.id,v_unit.id,v_unit.serial_number,v_months,coalesce((p_component->>'installed_date')::date,(now() at time zone 'Africa/Nairobi')::date)) returning id into v_id;
 insert into public.component_events(owner_id,component_id,event_type,reason,actor_id) values(v_owner,v_id,'Assigned','Assigned from warehouse stock',v_owner);
 return v_id;
end $$;
create function solara_private.assign_components(p_installation_id uuid,p_components jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c jsonb; v_quantity int; i int;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if not exists(select 1 from public.installations where id=p_installation_id and owner_id=auth.uid()) then raise exception 'Installation not found or not accessible.'; end if;
 for c in select value from jsonb_array_elements(p_components) order by value->>'inventory_item_id' loop
  v_quantity:=coalesce((c->>'quantity')::int,1);
  if v_quantity<1 or v_quantity>1000 then raise exception 'Assignment quantity must be between 1 and 1000.'; end if;
  if nullif(trim(c->>'serial_number'),'') is not null and v_quantity<>1 then raise exception 'A serial number identifies exactly one unit.'; end if;
  for i in 1..v_quantity loop perform solara_private.allocate_component(p_installation_id,c); end loop;
 end loop;
end $$;
drop function public.receive_stock(uuid,jsonb,text[],date);
create function solara_private.receive_stock(p_item_id uuid,p_item jsonb,p_serials text[],p_received_date date,p_quantity int) returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_item public.inventory_items; v_id uuid:=p_item_id; v_count int; i int; v_serial text;
begin
 if v_owner is null then raise exception 'Authentication required.'; end if;
 if v_id is null then
  insert into public.inventory_items(owner_id,item_type,brand,model,unit_price,low_stock_threshold,is_serialized,default_warranty_months)
  values(v_owner,p_item->>'item_type',p_item->>'brand',coalesce(p_item->>'model',''),(p_item->>'unit_price')::numeric,coalesce((p_item->>'low_stock_threshold')::int,5),coalesce((p_item->>'is_serialized')::boolean,false),coalesce((p_item->>'default_warranty_months')::int,case when p_item->>'item_type'='Solar Panel' then 300 else 60 end)) returning id into v_id;
 end if;
 select * into v_item from public.inventory_items where id=v_id and owner_id=v_owner for update;
 if not found then raise exception 'Product not found or not accessible.'; end if;
 v_count:=case when coalesce(cardinality(p_serials),0)>0 then cardinality(p_serials) else p_quantity end;
 if v_count is null or v_count<1 or v_count>10000 then raise exception 'Receive between 1 and 10000 physical units.'; end if;
 if coalesce(cardinality(p_serials),0)>0 and p_quantity>0 and p_quantity<>cardinality(p_serials) then raise exception 'Quantity must match the supplied serials.'; end if;
 if v_item.is_serialized and coalesce(cardinality(p_serials),0)<>v_count then raise exception 'Every serialized unit needs a unique serial number.'; end if;
 for i in 1..v_count loop
  v_serial:=nullif(upper(trim(p_serials[i])),'');
  insert into public.inventory_units(owner_id,inventory_item_id,serial_number,received_date) values(v_owner,v_id,v_serial,coalesce(p_received_date,(now() at time zone 'Africa/Nairobi')::date));
 end loop;
 return v_id;
end $$;
create function public.receive_stock(p_item_id uuid default null,p_item jsonb default null,p_serials text[] default '{}',p_received_date date default null,p_quantity int default 0) returns uuid language sql security invoker set search_path='' as $$ select solara_private.receive_stock(p_item_id,p_item,p_serials,p_received_date,p_quantity); $$;
create function solara_private.register_site(p_client_id uuid,p_client jsonb,p_installation jsonb,p_components jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_client uuid:=p_client_id; v_site uuid;
begin
 if v_owner is null then raise exception 'Authentication required.'; end if;
 if v_client is null then insert into public.clients(owner_id,name,phone,email,location_address,gps_coordinates) values(v_owner,p_client->>'name',coalesce(p_client->>'phone',''),coalesce(p_client->>'email',''),coalesce(p_client->>'location_address',''),coalesce(p_client->>'gps_coordinates','')) returning id into v_client; end if;
 if not exists(select 1 from public.clients where id=v_client and owner_id=v_owner) then raise exception 'Client not found or not accessible.'; end if;
 insert into public.installations(owner_id,client_id,site_name,system_type,commissioning_date,status,notes,capacity_kw) values(v_owner,v_client,p_installation->>'site_name',p_installation->>'system_type',(p_installation->>'commissioning_date')::date,coalesce(p_installation->>'status','Active'),coalesce(p_installation->>'notes',''),coalesce((p_installation->>'capacity_kw')::numeric,0)) returning id into v_site;
 perform solara_private.assign_components(v_site,p_components);return v_site;
end $$;
create or replace function public.register_site(p_client_id uuid default null,p_client jsonb default null,p_installation jsonb default null,p_components jsonb default '[]') returns uuid language sql security invoker set search_path='' as $$ select solara_private.register_site(p_client_id,p_client,p_installation,p_components); $$;
create or replace function public.assign_components(p_installation_id uuid,p_components jsonb) returns void language sql security invoker set search_path='' as $$ select solara_private.assign_components(p_installation_id,p_components); $$;

create function solara_private.process_rma(p_component_id uuid,p_reason text,p_replacement jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_old public.site_components; v_new uuid; v_type text;
begin
 if v_owner is null then raise exception 'Authentication required.'; end if;
 if length(trim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 then raise exception 'Add a fault or replacement note (1–2000 characters).'; end if;
 select * into v_old from public.site_components where id=p_component_id and owner_id=v_owner for update;
 if not found then raise exception 'Component not found or not accessible.'; end if;
 if v_old.status='Replaced' then raise exception 'This component already has a replacement.'; end if;
 if v_old.status='Returned_Faulty' and p_replacement is null then raise exception 'This component is already marked faulty.'; end if;
 if v_old.status='Installed' then
  update public.site_components set status='Returned_Faulty' where id=v_old.id;
  insert into public.component_events(owner_id,component_id,event_type,reason,actor_id) values(v_owner,v_old.id,'Returned_Faulty',trim(p_reason),v_owner);
 end if;
 if p_replacement is not null then
  if coalesce((p_replacement->>'quantity')::int,1)<>1 then raise exception 'Choose exactly one replacement unit.'; end if;
  select item_type into v_type from public.inventory_items where id=v_old.inventory_item_id;
  if not exists(select 1 from public.inventory_items where id=(p_replacement->>'inventory_item_id')::uuid and owner_id=v_owner and item_type=v_type) then raise exception 'Replacement must be an accessible product of the same hardware type.'; end if;
  v_new:=solara_private.allocate_component(v_old.installation_id,p_replacement);
  update public.site_components set status='Replaced',replaced_by_component_id=v_new where id=v_old.id;
  insert into public.component_events(owner_id,component_id,event_type,replacement_component_id,reason,actor_id) values(v_owner,v_old.id,'Replaced',v_new,trim(p_reason),v_owner);
 end if;
 return jsonb_build_object('component_id',v_old.id,'replacement_component_id',v_new,'status',case when v_new is null then 'Returned_Faulty' else 'Replaced' end);
end $$;
create function public.process_rma(p_component_id uuid,p_reason text,p_replacement jsonb default null) returns jsonb language sql security invoker set search_path='' as $$ select solara_private.process_rma(p_component_id,p_reason,p_replacement); $$;
create function public.mark_notifications_read(p_keys text[]) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if cardinality(p_keys)>1000 then raise exception 'Too many notifications.'; end if;
 insert into public.notification_reads(notification_key) select distinct unnest(p_keys) on conflict(owner_id,notification_key) do update set read_at=now();
end $$;
create or replace function public.get_workspace() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'clients',coalesce((select jsonb_agg(t order by created_at desc) from public.clients t),'[]'::jsonb),
 'installations',coalesce((select jsonb_agg(t order by created_at desc) from public.installations t),'[]'::jsonb),
 'inventory_items',coalesce((select jsonb_agg(t order by brand,model) from public.inventory_items t),'[]'::jsonb),
 'inventory_units',coalesce((select jsonb_agg(t order by received_date,id) from public.inventory_units t),'[]'::jsonb),
 'site_components',coalesce((select jsonb_agg(t order by installed_date desc) from public.site_components t),'[]'::jsonb),
 'component_events',coalesce((select jsonb_agg(t order by created_at desc,id) from public.component_events t),'[]'::jsonb),
 'notification_reads',coalesce((select jsonb_agg(t) from public.notification_reads t),'[]'::jsonb));
$$;
drop view public.component_warranties;
create view public.component_warranties with(security_invoker=true) as
 select c.*,i.commissioning_date,(i.commissioning_date+make_interval(months=>c.warranty_months))::date warranty_expires_on,
 (i.commissioning_date+make_interval(months=>c.warranty_months))::date-(now() at time zone 'Africa/Nairobi')::date days_remaining
 from public.site_components c join public.installations i on i.id=c.installation_id and i.owner_id=c.owner_id;
revoke all on public.component_warranties from public,anon;
grant select on public.component_warranties to authenticated;
revoke all on all functions in schema solara_private from public,anon,authenticated;
grant execute on function solara_private.receive_stock(uuid,jsonb,text[],date,int),solara_private.register_site(uuid,jsonb,jsonb,jsonb),solara_private.assign_components(uuid,jsonb),solara_private.process_rma(uuid,text,jsonb) to authenticated;
revoke all on function public.receive_stock(uuid,jsonb,text[],date,int),public.process_rma(uuid,text,jsonb),public.mark_notifications_read(text[]) from public,anon;
grant execute on function public.receive_stock(uuid,jsonb,text[],date,int),public.process_rma(uuid,text,jsonb),public.mark_notifications_read(text[]) to authenticated;
create function solara_private.protect_serialization() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_serialized and not old.is_serialized and exists(select 1 from public.inventory_units where inventory_item_id=new.id and serial_number is null) then raise exception 'Existing non-serialized units must be labeled before enabling serialization.'; end if;
 return new;
end $$;
create trigger product_serialization_guard before update of is_serialized on public.inventory_items for each row execute function solara_private.protect_serialization();
revoke all on function solara_private.protect_serialization() from public,anon,authenticated;
commit;
