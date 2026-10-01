-- Run this in Supabase Dashboard > SQL Editor.
-- Supabase Auth stores credentials in auth.users. This table stores only
-- user-facing profile information and links each row to its Auth account.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone_number text not null default '',
  delivery_address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Also adds the field when profiles was created using the earlier SQL version.
alter table public.profiles
  add column if not exists phone_number text not null default '';
alter table public.profiles add column if not exists delivery_address text not null default '';

alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone_number, delivery_address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone_number', ''),
    coalesce(new.raw_user_meta_data ->> 'delivery_address', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Run in Supabase Dashboard > SQL Editor as a project owner.
-- Supabase Auth owns credentials in auth.users. This script adds public profiles,
-- separate rental/store catalogs, admin-only controls, and image storage rules.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone_number text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists phone_number text not null default '',
  add column if not exists delivery_address text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone_number, delivery_address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone_number', ''),
    coalesce(new.raw_user_meta_data ->> 'delivery_address', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  approved_at timestamptz not null default now()
);

-- Public bills may show the shop's contact details, while admin profile rows stay private.
create or replace function public.get_shop_owner_details()
returns table (owner_name text, phone_number text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(p.full_name, ''), coalesce(p.phone_number, '')
  from public.admin_users as a
  join public.profiles as p on p.id = a.user_id
  order by a.approved_at, a.user_id
  limit 1;
$$;
revoke all on function public.get_shop_owner_details() from public, anon, authenticated;
grant execute on function public.get_shop_owner_details() to anon, authenticated;

create table if not exists public.delivery_areas (
  id bigint generated by default as identity primary key,
  name text not null unique,
  cash_on_delivery boolean not null default false,
  is_active boolean not null default true
);
alter table public.delivery_areas enable row level security;
grant select on public.delivery_areas to anon, authenticated;
grant insert, update, delete on public.delivery_areas to authenticated;
drop policy if exists "Delivery areas are publicly readable" on public.delivery_areas;
create policy "Delivery areas are publicly readable" on public.delivery_areas for select using (true);

alter table public.admin_users
  add column if not exists approved_at timestamptz not null default now();

alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.admin_users as administrators
    where administrators.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins manage delivery areas" on public.delivery_areas;
create policy "Admins manage delivery areas" on public.delivery_areas for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Rentals: prices, quantities, availability, descriptions, and image paths.
create table if not exists public.rental_items (
  id bigint generated by default as identity primary key,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null default 0 check (price >= 0),
  total integer not null default 0 check (total >= 0),
  available integer not null default 0 check (available >= 0 and available <= total),
  image_path text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  legacy_inventory_id text unique
);

-- Cleaning and other shop items are not rental inventory.
create table if not exists public.store_products (
  id bigint generated by default as identity primary key,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null default 0 check (price >= 0),
  total integer not null default 0 check (total >= 0),
  available integer not null default 0 check (available >= 0 and available <= total),
  image_path text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  legacy_inventory_id text unique,
  legacy_cleaning_id text unique
);

-- Preserve rows from earlier table names. Copy; never delete legacy source rows.
do $$
begin
  if to_regclass('public.inventory') is not null then
    execute $ddl$
      alter table public.inventory
      add column if not exists id bigint generated by default as identity,
      add column if not exists name text not null default '',
      add column if not exists description text not null default '',
      add column if not exists price numeric(10, 2) not null default 0,
      add column if not exists total integer not null default 0,
      add column if not exists available integer not null default 0,
      add column if not exists image_path text not null default '',
      add column if not exists is_active boolean not null default true,
      add column if not exists created_at timestamptz not null default now()
    $ddl$;

    if to_regclass('public.cleaning_products') is not null then
      execute $ddl$
        alter table public.cleaning_products
        add column if not exists legacy_inventory_id text
      $ddl$;
      execute $migration$
        insert into public.rental_items (
          name, description, price, total, available, image_path, is_active, created_at, legacy_inventory_id
        )
        select i.name, i.description, i.price, i.total, i.available,
               i.image_path, i.is_active, i.created_at, i.id::text
        from public.inventory as i
        where not exists (
          select 1 from public.cleaning_products as old_store
          where old_store.legacy_inventory_id::text = i.id::text
        )
        on conflict do nothing
      $migration$;
    else
      execute $migration$
        insert into public.rental_items (
          name, description, price, total, available, image_path, is_active, created_at, legacy_inventory_id
        )
        select name, description, price, total, available, image_path, is_active, created_at, id::text
        from public.inventory
        on conflict do nothing
      $migration$;
    end if;

    execute 'alter table public.inventory enable row level security';
    execute 'revoke all on table public.inventory from public, anon, authenticated';
  end if;

  if to_regclass('public.cleaning_products') is not null then
    execute $ddl$
      alter table public.cleaning_products
      add column if not exists id bigint generated by default as identity,
      add column if not exists name text not null default '',
      add column if not exists description text not null default '',
      add column if not exists price numeric(10, 2) not null default 0,
      add column if not exists total integer not null default 0,
      add column if not exists available integer not null default 0,
      add column if not exists image_path text not null default '',
      add column if not exists is_active boolean not null default true,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists legacy_inventory_id text
    $ddl$;

    execute $migration$
      insert into public.store_products (
        name, description, price, total, available, image_path, is_active,
        created_at, legacy_inventory_id, legacy_cleaning_id
      )
      select c.name, c.description, c.price, c.total, c.available,
             c.image_path, c.is_active, c.created_at,
             c.legacy_inventory_id::text, c.id::text
      from public.cleaning_products as c
      on conflict do nothing
    $migration$;

    execute 'alter table public.cleaning_products enable row level security';
    execute 'revoke all on table public.cleaning_products from public, anon, authenticated';
  end if;
end;
$$;

alter table public.rental_items enable row level security;
revoke all on public.rental_items from public, anon, authenticated;
grant select on public.rental_items to anon, authenticated;
grant insert, update, delete on public.rental_items to authenticated;

drop policy if exists "Anyone can view active rental items" on public.rental_items;
create policy "Anyone can view active rental items"
  on public.rental_items for select to anon, authenticated
  using (is_active);

drop policy if exists "Admins can manage rental items" on public.rental_items;
create policy "Admins can manage rental items"
  on public.rental_items for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can insert rental items" on public.rental_items;
create policy "Only admins can insert rental items"
  on public.rental_items as restrictive for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Only admins can update rental items" on public.rental_items;
create policy "Only admins can update rental items"
  on public.rental_items as restrictive for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can delete rental items" on public.rental_items;
create policy "Only admins can delete rental items"
  on public.rental_items as restrictive for delete to authenticated
  using (public.is_admin());

alter table public.store_products enable row level security;
revoke all on public.store_products from public, anon, authenticated;
grant select on public.store_products to anon, authenticated;
grant insert, update, delete on public.store_products to authenticated;

drop policy if exists "Anyone can view active store products" on public.store_products;
create policy "Anyone can view active store products"
  on public.store_products for select to anon, authenticated
  using (is_active);

drop policy if exists "Admins can manage store products" on public.store_products;
create policy "Admins can manage store products"
  on public.store_products for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can insert store products" on public.store_products;
create policy "Only admins can insert store products"
  on public.store_products as restrictive for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Only admins can update store products" on public.store_products;
create policy "Only admins can update store products"
  on public.store_products as restrictive for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only admins can delete store products" on public.store_products;
create policy "Only admins can delete store products"
  on public.store_products as restrictive for delete to authenticated
  using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('rental-items', 'rental-items', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('store-products', 'store-products', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Admins can upload rental item images" on storage.objects;
create policy "Admins can upload rental item images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rental-items' and public.is_admin());

drop policy if exists "Admins can update rental item images" on storage.objects;
create policy "Admins can update rental item images"
  on storage.objects for update to authenticated
  using (bucket_id = 'rental-items' and public.is_admin())
  with check (bucket_id = 'rental-items' and public.is_admin());

drop policy if exists "Admins can delete rental item images" on storage.objects;
create policy "Admins can delete rental item images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'rental-items' and public.is_admin());

drop policy if exists "Admins can upload store product images" on storage.objects;
create policy "Admins can upload store product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'store-products' and public.is_admin());

drop policy if exists "Admins can update store product images" on storage.objects;
create policy "Admins can update store product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'store-products' and public.is_admin())
  with check (bucket_id = 'store-products' and public.is_admin());

drop policy if exists "Admins can delete store product images" on storage.objects;
create policy "Admins can delete store product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'store-products' and public.is_admin());

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone_number text,
  created_at timestamptz,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, coalesce(p.full_name, ''), coalesce(p.phone_number, ''),
           u.created_at, (a.user_id is not null)
    from auth.users as u
    left join public.profiles as p on p.id = u.id
    left join public.admin_users as a on a.user_id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_set_user_admin(p_user_id uuid, p_make_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found';
  end if;

  if p_make_admin then
    insert into public.admin_users (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;
    return;
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot remove your own admin access';
  end if;
  if exists (select 1 from public.admin_users where user_id = p_user_id)
     and (select count(*) from public.admin_users) <= 1 then
    raise exception 'The last administrator cannot be removed';
  end if;
  delete from public.admin_users where user_id = p_user_id;
end;
$$;

revoke all on function public.admin_set_user_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_admin(uuid, boolean) to authenticated;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot delete your own account from the dashboard';
  end if;
  if exists (select 1 from public.admin_users where user_id = p_user_id) then
    raise exception 'Remove admin access before deleting this administrator';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'objects'
      and column_name = 'owner_id'
  ) then
    execute 'update storage.objects set owner_id = $1 where owner_id::text = $2'
      using (select auth.uid()), p_user_id::text;
  end if;

  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Convenient read-only database view for inspecting administrator accounts
-- in Supabase Studio. Keep access through the API revoked; the admin dashboard
-- uses the protected admin_list_users() function for its registered-user list.
create or replace view public.admin_user_details
with (security_invoker = true)
as
select
  au.user_id,
  u.email::text as email,
  coalesce(p.full_name, '') as full_name,
  coalesce(p.phone_number, '') as phone_number,
  au.approved_at
from public.admin_users as au
join auth.users as u on u.id = au.user_id
left join public.profiles as p on p.id = au.user_id;

revoke all on public.admin_user_details from public, anon, authenticated;

-- Sign-in and registration use Supabase Auth in auth.users.
-- After registering the first admin, approve that account once as project owner:
-- Replace the email below with the email used to sign in, then run this once
-- in Supabase SQL Editor as project owner. Do not expose this SQL through the app.
-- insert into public.admin_users (user_id)
-- select id from auth.users where lower(email) = lower('admin@example.com')
-- on conflict (user_id) do nothing;
