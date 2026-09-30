create table if not exists public.app_state (
  id text primary key,
  profile jsonb not null default '{}'::jsonb,
  template jsonb not null default '{}'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  tracker_file_name text not null default 'HR_Outreach_Tracker.xlsx',
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "Service role can manage app state"
  on public.app_state
  for all
  to service_role
  using (true)
  with check (true);