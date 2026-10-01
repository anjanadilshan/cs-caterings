-- CS Catering Event Booking module. Run manually in Supabase SQL Editor.
-- Assumptions to verify before running: public.is_admin() exists and returns boolean;
-- public.rental_items.id is BIGINT. This script does not create or alter rental_items.
create extension if not exists pgcrypto;

create or replace function public.event_booking_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table if not exists public.event_booking_form_options (
  id uuid primary key default gen_random_uuid(),
  option_type text not null check (option_type in ('event_type','dietary_requirement')),
  label text not null check (length(trim(label)) between 1 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (option_type, label)
);

create table if not exists public.event_booking_form_layouts (
  step_number smallint primary key check (step_number between 1 and 5),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
grant select on public.event_booking_form_layouts to anon, authenticated;
grant insert, update, delete on public.event_booking_form_layouts to authenticated;

create table if not exists public.event_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) between 1 and 160),
  customer_email text not null check (customer_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  customer_phone text not null check (customer_phone ~ '^[+0-9() .-]{7,24}$'),
  alternative_phone text check (alternative_phone is null or alternative_phone ~ '^[+0-9() .-]{7,24}$'),
  preferred_contact_method text not null default 'WhatsApp' check (preferred_contact_method in ('WhatsApp','Phone Call','Email')),
  event_type text not null,
  event_date date not null,
  start_time time,
  end_time time,
  guest_count integer not null check (guest_count > 0),
  venue_name text,
  district text not null check (district in ('Ampara','Anuradhapura','Badulla','Batticaloa','Colombo','Galle','Gampaha','Hambantota','Jaffna','Kalutara','Kandy','Kegalle','Kilinochchi','Kurunegala','Mannar','Matale','Matara','Monaragala','Mullaitivu','Nuwara Eliya','Polonnaruwa','Puttalam','Ratnapura','Trincomalee','Vavuniya','Other')),
  event_address text not null check (length(trim(event_address)) > 0),
  location_instructions text,
  estimated_budget numeric(12,2) check (estimated_budget is null or estimated_budget >= 0),
  additional_requirements text,
  status text not null default 'pending' check (status in ('pending','under_review','quoted','confirmed','in_progress','completed','cancelled','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is null or end_time is null or end_time > start_time)
);

create or replace function public.event_booking_assign_reference()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  new.booking_reference := 'CSB-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(replace(new.id::text,'-',''));
  return new;
end; $$;

create or replace function public.event_booking_validate_date()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.event_date < current_date then
    raise exception 'Event date must be today or later' using errcode = '23514';
  end if;
  return new;
end; $$;

drop trigger if exists event_booking_reference_before_insert on public.event_bookings;
create trigger event_booking_reference_before_insert before insert on public.event_bookings
for each row execute function public.event_booking_assign_reference();
drop trigger if exists event_booking_validate_date_before_insert on public.event_bookings;
create trigger event_booking_validate_date_before_insert before insert on public.event_bookings
for each row execute function public.event_booking_validate_date();

create table if not exists public.booking_rental_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.event_bookings(id) on delete cascade,
  rental_item_id bigint not null references public.rental_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (booking_id, rental_item_id)
);

create or replace function public.event_booking_validate_rental_line()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare item record;
begin
  select r.available, r.price, r.is_active into item
  from public.rental_items r where r.id = new.rental_item_id for share;
  if not found or not item.is_active then
    raise exception 'Rental item is unavailable' using errcode = '23514';
  end if;
  if new.quantity > coalesce(item.available, 0) then
    raise exception 'Requested rental quantity exceeds current availability' using errcode = '23514';
  end if;
  new.unit_price := item.price;
  return new;
end; $$;
drop trigger if exists booking_rental_items_validate_before_insert on public.booking_rental_items;
create trigger booking_rental_items_validate_before_insert before insert on public.booking_rental_items
for each row execute function public.event_booking_validate_rental_line();

create table if not exists public.booking_dietary_requirements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.event_bookings(id) on delete cascade,
  requirement text not null check (length(trim(requirement)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (booking_id, requirement)
);

create table if not exists public.event_quotations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.event_bookings(id) on delete cascade,
  quotation_number text not null unique,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  additional_fee numeric(12,2) not null default 0 check (additional_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  notes text,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.event_quotations(id) on delete cascade,
  item_type text not null check (item_type in ('catering','rental','service','delivery','other','discount')),
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.booking_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.event_bookings(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now()
);

-- Safe upgrades for projects where the first version of this module is already installed.
alter table public.event_bookings
  add column if not exists estimated_total numeric(12,2) check (estimated_total is null or estimated_total >= 0);
alter table public.event_bookings
  drop constraint if exists event_bookings_event_type_check;
-- Additional service selections have been removed from the booking workflow.
drop table if exists public.booking_services;
drop table if exists public.event_services;
-- Service charges are no longer included in customer estimates.
alter table public.event_bookings drop column if exists service_charge;
drop table if exists public.event_booking_settings;
-- Catering package selection and pricing have been removed from the workflow.
alter table public.event_bookings drop column if exists catering_package_id;
drop table if exists public.catering_packages;
update public.event_booking_form_layouts l
set fields = coalesce((
  select jsonb_agg(f order by ordinal)
  from jsonb_array_elements(l.fields) with ordinality as items(f, ordinal)
  where f->>'key' not in ('catering_package_id', 'service_selection')
), '[]'::jsonb)
where exists (
  select 1 from jsonb_array_elements(l.fields) as items(f)
  where f->>'key' in ('catering_package_id', 'service_selection')
);
-- Preferred contact choices are editable in the admin form builder.
alter table public.event_bookings
  drop constraint if exists event_bookings_preferred_contact_method_check;
alter table public.booking_dietary_requirements
  drop constraint if exists booking_dietary_requirements_requirement_check;
create index if not exists event_bookings_user_created_idx on public.event_bookings(user_id, created_at desc);
create index if not exists event_bookings_status_date_idx on public.event_bookings(status, event_date);
create index if not exists booking_rental_items_booking_idx on public.booking_rental_items(booking_id);
create index if not exists booking_dietary_requirements_booking_idx on public.booking_dietary_requirements(booking_id);
create index if not exists quotation_items_quotation_idx on public.quotation_items(quotation_id);
create index if not exists booking_notes_booking_idx on public.booking_notes(booking_id);

drop trigger if exists event_bookings_updated_at on public.event_bookings;
create trigger event_bookings_updated_at before update on public.event_bookings for each row execute function public.event_booking_set_updated_at();
drop trigger if exists event_quotations_updated_at on public.event_quotations;
create trigger event_quotations_updated_at before update on public.event_quotations for each row execute function public.event_booking_set_updated_at();

alter table public.event_booking_form_options enable row level security;
alter table public.event_booking_form_layouts enable row level security;
alter table public.event_bookings enable row level security;
alter table public.booking_rental_items enable row level security;
alter table public.booking_dietary_requirements enable row level security;
alter table public.event_quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.booking_notes enable row level security;

-- Public catalog reads; only admins can manage catalog/prices.

drop policy if exists "Active booking form options are readable" on public.event_booking_form_options;
create policy "Active booking form options are readable" on public.event_booking_form_options for select to anon, authenticated using (is_active);
drop policy if exists "Admins manage booking form options" on public.event_booking_form_options;
create policy "Admins manage booking form options" on public.event_booking_form_options for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Booking form layouts are readable" on public.event_booking_form_layouts;
create policy "Booking form layouts are readable" on public.event_booking_form_layouts for select to anon, authenticated using (true);
drop policy if exists "Admins manage booking form layouts" on public.event_booking_form_layouts;
create policy "Admins manage booking form layouts" on public.event_booking_form_layouts for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Customers create own event bookings" on public.event_bookings;
create policy "Customers create own event bookings" on public.event_bookings for insert to authenticated with check (auth.uid() = user_id and status = 'pending');
drop policy if exists "Customers read own event bookings" on public.event_bookings;
create policy "Customers read own event bookings" on public.event_bookings for select to authenticated using (auth.uid() = user_id or public.is_admin());
drop policy if exists "Admins manage event bookings" on public.event_bookings;
create policy "Admins manage event bookings" on public.event_bookings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Customers create own booking rental rows" on public.booking_rental_items;
create policy "Customers create own booking rental rows" on public.booking_rental_items for insert to authenticated with check (exists (select 1 from public.event_bookings b where b.id = booking_id and b.user_id = auth.uid()));
drop policy if exists "Customers read own booking rental rows" on public.booking_rental_items;
create policy "Customers read own booking rental rows" on public.booking_rental_items for select to authenticated using (exists (select 1 from public.event_bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));
drop policy if exists "Admins manage booking rental rows" on public.booking_rental_items;
create policy "Admins manage booking rental rows" on public.booking_rental_items for all to authenticated using (public.is_admin()) with check (public.is_admin());


drop policy if exists "Customers create own dietary rows" on public.booking_dietary_requirements;
create policy "Customers create own dietary rows" on public.booking_dietary_requirements for insert to authenticated with check (exists (select 1 from public.event_bookings b where b.id = booking_id and b.user_id = auth.uid()));
drop policy if exists "Customers read own dietary rows" on public.booking_dietary_requirements;
create policy "Customers read own dietary rows" on public.booking_dietary_requirements for select to authenticated using (exists (select 1 from public.event_bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));
drop policy if exists "Admins manage dietary rows" on public.booking_dietary_requirements;
create policy "Admins manage dietary rows" on public.booking_dietary_requirements for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Customers read own quotations" on public.event_quotations;
create policy "Customers read own quotations" on public.event_quotations for select to authenticated using (exists (select 1 from public.event_bookings b where b.id = booking_id and b.user_id = auth.uid()) or public.is_admin());
drop policy if exists "Admins manage quotations" on public.event_quotations;
create policy "Admins manage quotations" on public.event_quotations for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Customers read own quotation items" on public.quotation_items;
create policy "Customers read own quotation items" on public.quotation_items for select to authenticated using (exists (select 1 from public.event_quotations q join public.event_bookings b on b.id = q.booking_id where q.id = quotation_id and b.user_id = auth.uid()) or public.is_admin());
drop policy if exists "Admins manage quotation items" on public.quotation_items;
create policy "Admins manage quotation items" on public.quotation_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins manage booking notes" on public.booking_notes;
create policy "Admins manage booking notes" on public.booking_notes for all to authenticated using (public.is_admin()) with check (public.is_admin() and admin_user_id = auth.uid());


insert into public.event_booking_form_options (option_type, label, sort_order) values
 ('event_type','Wedding',10), ('event_type','Birthday Party',20),
 ('event_type','Corporate Event',30), ('event_type','Anniversary',40),
 ('event_type','Private Party',50), ('event_type','Graduation',60),
 ('event_type','Conference',70), ('event_type','Other',80),
 ('dietary_requirement','Vegetarian',10), ('dietary_requirement','Vegan',20),
 ('dietary_requirement','Halal',30), ('dietary_requirement','No Pork',40),
 ('dietary_requirement','No Seafood',50), ('dietary_requirement','Allergy Requirements',60),
 ('dietary_requirement','Other',70)
on conflict (option_type, label) do nothing;
