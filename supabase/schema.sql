create table if not exists public.app_state (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  template jsonb not null default '{}'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  tracker_file_name text not null default 'HR_Outreach_Tracker.xlsx',
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

alter table public.app_state add column if not exists user_id uuid references auth.users(id) on delete cascade;
create unique index if not exists app_state_user_id_key on public.app_state(user_id);

drop policy if exists "Service role can manage app state" on public.app_state;

create policy "Service role can manage app state"
  on public.app_state
  for all
  to service_role
  using (true)
  with check (true);