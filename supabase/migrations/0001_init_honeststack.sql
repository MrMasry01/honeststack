-- ============================================================
-- HonestStack — initial schema (0001_init_honeststack)
-- Automated FIFA World Cup 2026 short-form video engine.
-- Apply once to a fresh Supabase project.
-- Every domain table is RLS'd on owner_id = auth.uid().
-- Engine writes (skill / Make / MCP) must set owner_id explicitly.
-- ============================================================

create extension if not exists pgcrypto;

-- ---- helper: updated_at -------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---- profiles (1 row per auth user) ------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- user_roles --------------------------------------------
create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'editor' check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;
create policy "user_roles_self" on public.user_roles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- target_accounts (handles we scrape) -------------------
create table public.target_accounts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  platform   text not null check (platform in ('twitter','rss')),
  handle     text not null,
  label      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.target_accounts enable row level security;
create policy "target_accounts_owner" on public.target_accounts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger trg_target_accounts_updated before update on public.target_accounts
  for each row execute function public.set_updated_at();
create index idx_target_accounts_owner on public.target_accounts(owner_id);

-- ---- raw_sources (scraped items) ---------------------------
create table public.raw_sources (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null default auth.uid(),
  source_type          text not null check (source_type in ('twitter','rss')),
  source_handle        text,
  external_id          text,
  url                  text,
  author               text,
  content              text,
  media_urls           text[] not null default '{}',
  dedup_hash           text not null,
  verified             boolean not null default false,
  verification_sources text[] not null default '{}',
  time_bucket          text check (time_bucket in ('00-06','06-12','12-18','18-24')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (owner_id, dedup_hash)
);
alter table public.raw_sources enable row level security;
create policy "raw_sources_owner" on public.raw_sources
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger trg_raw_sources_updated before update on public.raw_sources
  for each row execute function public.set_updated_at();
create index idx_raw_sources_owner_created on public.raw_sources(owner_id, created_at desc);

-- ---- content_ideas (drafted video angles) ------------------
create table public.content_ideas (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid(),
  source_id       uuid references public.raw_sources(id) on delete set null,
  hook            text,
  angle           text,
  format          text not null default 'short_video' check (format in ('carousel','short_video','static')),
  platforms       text[] not null default '{}',
  urgency         integer not null default 3 check (urgency between 1 and 5),
  status          text not null default 'draft' check (status in ('draft','ready','scheduled','posted')),
  language        text not null default 'ar-EG',
  time_bucket     text check (time_bucket in ('00-06','06-12','12-18','18-24')),
  script_segments jsonb,
  brief           jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.content_ideas enable row level security;
create policy "content_ideas_owner" on public.content_ideas
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger trg_content_ideas_updated before update on public.content_ideas
  for each row execute function public.set_updated_at();
create index idx_content_ideas_owner_status on public.content_ideas(owner_id, status);
create index idx_content_ideas_owner_bucket on public.content_ideas(owner_id, time_bucket);

-- ---- assets (rendered media) -------------------------------
create table public.assets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  idea_id    uuid references public.content_ideas(id) on delete cascade,
  kind       text not null default 'short_video' check (kind in ('carousel','short_video','static')),
  media      jsonb,
  caption    text,
  hashtags   text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assets enable row level security;
create policy "assets_owner" on public.assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger trg_assets_updated before update on public.assets
  for each row execute function public.set_updated_at();
create index idx_assets_owner_idea on public.assets(owner_id, idea_id);

-- ---- posts_queue (scheduled posts) -------------------------
create table public.posts_queue (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid(),
  asset_id         uuid references public.assets(id) on delete cascade,
  platform         text not null check (platform in ('instagram','youtube','tiktok')),
  publish_at       timestamptz,
  status           text not null default 'pending' check (status in ('pending','publishing','posted','failed')),
  external_post_id text,
  external_url     text,
  posted_at        timestamptz,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.posts_queue enable row level security;
create policy "posts_queue_owner" on public.posts_queue
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger trg_posts_queue_updated before update on public.posts_queue
  for each row execute function public.set_updated_at();
create index idx_posts_queue_owner_status_time on public.posts_queue(owner_id, status, publish_at);

-- ---- post_metrics (analytics) ------------------------------
create table public.post_metrics (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  post_id     uuid not null references public.posts_queue(id) on delete cascade,
  views       integer not null default 0,
  likes       integer not null default 0,
  comments    integer not null default 0,
  shares      integer not null default 0,
  saves       integer not null default 0,
  measured_at timestamptz not null default now()
);
alter table public.post_metrics enable row level security;
create policy "post_metrics_owner" on public.post_metrics
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index idx_post_metrics_post on public.post_metrics(post_id, measured_at desc);

-- ---- brand_settings (per-owner brand kit) ------------------
create table public.brand_settings (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default auth.uid() unique,
  brand_name            text,
  primary_color         text,
  accent_color          text,
  logo_url              text,
  font_family           text,
  voice_style           text,
  voice_id              text,
  make_generate_webhook text,
  make_publish_webhook  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.brand_settings enable row level security;
create policy "brand_settings_owner" on public.brand_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger trg_brand_settings_updated before update on public.brand_settings
  for each row execute function public.set_updated_at();

-- ---- storage: public 'assets' bucket -----------------------
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

create policy "assets_bucket_public_read" on storage.objects
  for select using (bucket_id = 'assets');
create policy "assets_bucket_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'assets');
create policy "assets_bucket_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'assets');
create policy "assets_bucket_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'assets');
