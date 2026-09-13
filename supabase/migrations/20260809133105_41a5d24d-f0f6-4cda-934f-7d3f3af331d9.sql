create table public.item_fingerprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  defining_key text not null,
  fingerprint_hash text not null,
  item_count integer not null default 0,
  observations integer not null default 1,
  cycles integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, defining_key)
);
create index item_fingerprints_group_idx on public.item_fingerprints (kind, defining_key, fingerprint_hash);

grant all on public.item_fingerprints to service_role;
alter table public.item_fingerprints enable row level security;
create policy "own fingerprints read" on public.item_fingerprints
  for select to authenticated using (auth.uid() = user_id);
grant select on public.item_fingerprints to authenticated;

create table public.content_clusters (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  defining_key text not null,
  fingerprint_hash text not null,
  member_user_ids uuid[] not null default '{}',
  member_count integer not null default 0,
  confidence_score numeric not null default 0,
  observations integer not null default 0,
  cycles integer not null default 0,
  status text not null default 'candidate',
  break_reason text,
  last_representative uuid,
  last_confirmed_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, defining_key)
);
create index content_clusters_status_idx on public.content_clusters (status);

grant all on public.content_clusters to service_role;
alter table public.content_clusters enable row level security;

create table public.cluster_events (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid references public.content_clusters(id) on delete cascade,
  kind text not null,
  defining_key text not null,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index cluster_events_created_idx on public.cluster_events (created_at desc);

grant all on public.cluster_events to service_role;
alter table public.cluster_events enable row level security;

create trigger item_fingerprints_touch before update on public.item_fingerprints
  for each row execute function public.touch_updated_at();
create trigger content_clusters_touch before update on public.content_clusters
  for each row execute function public.touch_updated_at();