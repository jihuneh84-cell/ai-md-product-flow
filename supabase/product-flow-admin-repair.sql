-- Product Development Flow visibility repair
-- Use this if existing products look missing after enabling RLS.
-- 1) Change the email below if your master login email is different.
-- 2) Run in the same Supabase project used by NEXT_PUBLIC_SUPABASE_URL.

do $$
declare
  master_email text := 'jhhwang1@emons.co.kr';
begin
  insert into public.profiles (
    id,
    email,
    name,
    position,
    department,
    role,
    is_approved
  )
  select
    users.id,
    lower(users.email),
    coalesce(users.raw_user_meta_data ->> 'name', users.email),
    '마스터',
    '온라인MD',
    'admin',
    true
  from auth.users
  where lower(users.email) = lower(master_email)
  on conflict (id) do update
  set
    email = excluded.email,
    role = 'admin',
    is_approved = true,
    updated_at = now();
end $$;

select
  'products_count' as check_name,
  count(*)::text as value
from public.products
union all
select
  'projects_count',
  count(*)::text
from public.projects
union all
select
  'master_profile',
  coalesce(email, 'not found') || ' / ' || coalesce(role, '-') || ' / approved=' || coalesce(is_approved::text, 'false')
from public.profiles
where lower(email) = lower('jhhwang1@emons.co.kr');
