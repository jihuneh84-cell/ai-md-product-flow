-- Online Business Workspace + Product Development Flow integration
-- Run this in the Supabase project used by Online Business Workspace.
-- This script is idempotent and does not delete existing data.

create extension if not exists "pgcrypto";

-- Keep the existing workspace profiles table, but add fields used by product flow if missing.
alter table public.profiles
add column if not exists role text;

alter table public.profiles
add column if not exists is_admin boolean not null default false;

alter table public.profiles
add column if not exists is_approved boolean not null default false;

alter table public.profiles
add column if not exists position text;

alter table public.profiles
add column if not exists department text;

-- Product flow tables.
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

-- Messenger tables.
create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null default '전체',
  body text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  attachment jsonb,
  user_name text,
  user_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  message text,
  link text,
  type text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists projects_created_at_idx on public.projects (created_at desc);
create index if not exists products_created_at_idx on public.products (created_at desc);
create index if not exists products_project_id_idx on public.products (project_id);
create index if not exists messenger_messages_channel_created_at_idx on public.messenger_messages (channel, created_at desc);
create index if not exists messenger_messages_recipient_created_at_idx on public.messenger_messages (recipient_id, created_at desc);
create index if not exists notifications_user_created_at_idx on public.notifications (user_id, created_at desc);

-- Helper functions used by the product flow login and policies.
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
      and is_approved = true
      and (
        is_admin = true
        or lower(coalesce(role, '')) = 'admin'
        or role = '관리자'
        or lower(coalesce(email, '')) = lower('jhhwang1@emons.co.kr')
      )
  );
$$;

grant execute on function public.has_product_flow_profiles() to anon, authenticated;
grant execute on function public.is_product_flow_admin() to authenticated;

-- Approve the product flow master without changing existing workspace data more than needed.
update public.profiles
set
  is_admin = true,
  is_approved = true,
  role = coalesce(role, '관리자')
where lower(email) = lower('jhhwang1@emons.co.kr');

-- Storage buckets.
insert into storage.buckets (id, name, public)
values
  ('project-files', 'project-files', true),
  ('product-images', 'product-images', true),
  ('messenger-files', 'messenger-files', false)
on conflict (id) do nothing;

alter table public.projects enable row level security;
alter table public.products enable row level security;
alter table public.messenger_messages enable row level security;
alter table public.notifications enable row level security;

-- Product flow data is limited to product flow admins for now.
drop policy if exists "product_flow_projects_admin_all" on public.projects;
create policy "product_flow_projects_admin_all"
on public.projects for all
to authenticated
using (public.is_product_flow_admin())
with check (public.is_product_flow_admin());

drop policy if exists "product_flow_products_admin_all" on public.products;
create policy "product_flow_products_admin_all"
on public.products for all
to authenticated
using (public.is_product_flow_admin())
with check (public.is_product_flow_admin());

-- Allow the master/admin to see approved workspace users for assignee lists.
drop policy if exists "product_flow_profiles_admin_select" on public.profiles;
create policy "product_flow_profiles_admin_select"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_product_flow_admin());

-- Messenger: approved users can read all-channel messages; direct messages are visible only to sender/recipient.
drop policy if exists "messenger_select_approved" on public.messenger_messages;
create policy "messenger_select_approved"
on public.messenger_messages for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_approved = true
  )
  and (
    recipient_id is null
    or user_id = auth.uid()
    or recipient_id = auth.uid()
  )
);

drop policy if exists "messenger_insert_approved_self" on public.messenger_messages;
create policy "messenger_insert_approved_self"
on public.messenger_messages for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_approved = true
  )
);

drop policy if exists "messenger_update_own_attachment_cleanup" on public.messenger_messages;
create policy "messenger_update_own_attachment_cleanup"
on public.messenger_messages for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Notifications are private per user.
drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "approved users can create notifications" on public.notifications;
create policy "approved users can create notifications"
on public.notifications for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_approved = true
  )
);

drop policy if exists "users can update own notifications" on public.notifications;
create policy "users can update own notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Storage policies.
drop policy if exists "project_files_product_admin_upload" on storage.objects;
create policy "project_files_product_admin_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'project-files' and public.is_product_flow_admin());

drop policy if exists "project_files_product_admin_update" on storage.objects;
create policy "project_files_product_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'project-files' and public.is_product_flow_admin())
with check (bucket_id = 'project-files' and public.is_product_flow_admin());

drop policy if exists "project_files_product_admin_delete" on storage.objects;
create policy "project_files_product_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'project-files' and public.is_product_flow_admin());

drop policy if exists "product_images_product_admin_upload" on storage.objects;
create policy "product_images_product_admin_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and public.is_product_flow_admin());

drop policy if exists "product_images_product_admin_update" on storage.objects;
create policy "product_images_product_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and public.is_product_flow_admin())
with check (bucket_id = 'product-images' and public.is_product_flow_admin());

drop policy if exists "product_images_product_admin_delete" on storage.objects;
create policy "product_images_product_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and public.is_product_flow_admin());

drop policy if exists "users can insert own messenger files" on storage.objects;
create policy "users can insert own messenger files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'messenger-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users can delete own messenger files" on storage.objects;
create policy "users can delete own messenger files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'messenger-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Realtime registration. Ignore when already registered.
do $$
begin
  alter publication supabase_realtime add table public.projects;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.products;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messenger_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

select
  'profiles' as table_name,
  count(*) as row_count
from public.profiles
union all
select 'projects', count(*) from public.projects
union all
select 'products', count(*) from public.products
union all
select 'messenger_messages', count(*) from public.messenger_messages
union all
select 'notifications', count(*) from public.notifications;
