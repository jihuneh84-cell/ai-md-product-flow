-- Product Development Flow initial Supabase schema
-- Run this once in Supabase SQL Editor before the first signup.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  position text,
  department text,
  role text not null default 'user' check (role in ('admin', 'user')),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_date date,
  current_step_id text,
  completed_step_ids text[] not null default '{}',
  owners jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  dates jsonb not null default '{}'::jsonb,
  files jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  space text not null,
  category text,
  series_name text,
  tag_price numeric,
  price numeric,
  age_target numeric,
  image_url text,
  planning_image_url text,
  estimated_tag_price numeric,
  status text,
  current_stage text,
  launch_target_date date,
  source_type text,
  project_id uuid references public.projects(id) on delete set null,
  external_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.has_product_flow_profiles()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles limit 1);
$$;

create or replace function public.is_product_flow_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_approved = true
  );
$$;

grant execute on function public.has_product_flow_profiles() to anon, authenticated;
grant execute on function public.is_product_flow_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists projects_created_at_idx on public.projects (created_at desc);
create index if not exists products_created_at_idx on public.products (created_at desc);
create index if not exists products_project_id_idx on public.products (project_id);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.products enable row level security;

drop policy if exists "profiles_authenticated_select" on public.profiles;
create policy "profiles_authenticated_select"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.is_product_flow_admin());

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_self_or_admin_update" on public.profiles;
create policy "profiles_self_or_admin_update"
on public.profiles for update
to authenticated
using (auth.uid() = id or public.is_product_flow_admin())
with check (auth.uid() = id or public.is_product_flow_admin());

drop policy if exists "projects_authenticated_all" on public.projects;
create policy "projects_authenticated_all"
on public.projects for all
to authenticated
using (public.is_product_flow_admin())
with check (public.is_product_flow_admin());

drop policy if exists "products_authenticated_all" on public.products;
create policy "products_authenticated_all"
on public.products for all
to authenticated
using (public.is_product_flow_admin())
with check (public.is_product_flow_admin());

insert into storage.buckets (id, name, public)
values
  ('project-files', 'project-files', true),
  ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "project_files_authenticated_upload" on storage.objects;
create policy "project_files_authenticated_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'project-files' and public.is_product_flow_admin());

drop policy if exists "project_files_authenticated_update" on storage.objects;
create policy "project_files_authenticated_update"
on storage.objects for update
to authenticated
using (bucket_id = 'project-files' and public.is_product_flow_admin())
with check (bucket_id = 'project-files' and public.is_product_flow_admin());

drop policy if exists "project_files_authenticated_delete" on storage.objects;
create policy "project_files_authenticated_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'project-files' and public.is_product_flow_admin());

drop policy if exists "product_images_authenticated_upload" on storage.objects;
create policy "product_images_authenticated_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and public.is_product_flow_admin());

drop policy if exists "product_images_authenticated_update" on storage.objects;
create policy "product_images_authenticated_update"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and public.is_product_flow_admin())
with check (bucket_id = 'product-images' and public.is_product_flow_admin());

drop policy if exists "product_images_authenticated_delete" on storage.objects;
create policy "product_images_authenticated_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and public.is_product_flow_admin());
