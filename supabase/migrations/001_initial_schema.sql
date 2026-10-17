-- Royal Gold Club · contrato inicial de datos
-- Ejecutar en Supabase SQL Editor después de habilitar Auth.

create extension if not exists pgcrypto;

create type public.member_presence as enum ('offline', 'online', 'playing');
create type public.table_status as enum ('waiting', 'playing', 'finished', 'closed');
create type public.member_status as enum ('invited', 'joined', 'left', 'disconnected');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'revoked', 'expired');
create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 2 and 60),
  avatar_url text,
  presence public.member_presence not null default 'offline',
  chips bigint not null default 1250 check (chips >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  preferences jsonb not null default '{"sound":true,"animations":true,"reducedMotion":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_catalog (
  id text primary key,
  name text not null,
  min_players integer not null check (min_players >= 1),
  max_players integer not null check (max_players >= min_players),
  estimated_minutes integer,
  enabled boolean not null default true,
  rules_version text not null default '1.0.0',
  metadata jsonb not null default '{}'::jsonb
);

insert into public.game_catalog (id, name, min_players, max_players, estimated_minutes) values
  ('uno', 'UNO', 2, 10, 20),
  ('poker', 'Texas Hold’em', 2, 9, 60),
  ('blackjack', '21 · Blackjack', 1, 7, 15),
  ('domino', 'Dominó', 2, 4, 40),
  ('rummy', 'Rummy', 2, 4, 45),
  ('crazy', 'Crazy Eights', 2, 6, 25),
  ('mica', 'Mica', 2, 6, 60)
on conflict (id) do nothing;

create table public.game_tables (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^ROYAL-[A-Z0-9]{6}$'),
  name text not null check (char_length(name) between 2 and 60),
  game_id text not null references public.game_catalog(id),
  host_id uuid not null references public.profiles(id),
  status public.table_status not null default 'waiting',
  is_private boolean not null default true,
  max_players integer not null check (max_players between 2 and 10),
  voice_enabled boolean not null default true,
  stake bigint not null default 0 check (stake >= 0),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  closed_at timestamptz
);

create table public.table_members (
  table_id uuid not null references public.game_tables(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat smallint not null check (seat >= 0),
  role text not null default 'player' check (role in ('host', 'player')),
  status public.member_status not null default 'joined',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (table_id, user_id),
  unique (table_id, seat)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.game_tables(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id),
  invitee_id uuid not null references public.profiles(id),
  status public.invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (table_id, invitee_id)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.game_tables(id) on delete cascade,
  game_id text not null references public.game_catalog(id),
  status text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  state_version bigint not null default 0,
  public_state jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  sequence bigint not null,
  event_type text not null,
  actor_id uuid references public.profiles(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);

create table public.virtual_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 1250 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  reason text not null,
  reference_id text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  rank integer not null check (rank >= 1),
  points integer not null default 0,
  chips_delta bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (session_id, player_id)
);

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  reported_id uuid references public.profiles(id),
  table_id uuid references public.game_tables(id),
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index table_members_user_idx on public.table_members(user_id, status);
create index game_tables_status_idx on public.game_tables(status, expires_at);
create index game_sessions_table_idx on public.game_sessions(table_id, started_at desc);
create index game_events_session_idx on public.game_events(session_id, sequence);
create index notifications_user_idx on public.notifications(user_id, read_at, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger friendships_updated_at before update on public.friendships for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.game_catalog enable row level security;
alter table public.game_tables enable row level security;
alter table public.table_members enable row level security;
alter table public.invitations enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_events enable row level security;
alter table public.virtual_wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.game_results enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;

create policy profiles_public_read on public.profiles for select using (true);
create policy profiles_self_write on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy catalog_read on public.game_catalog for select using (enabled = true);
create policy tables_read on public.game_tables for select using (not is_private or host_id = auth.uid() or exists (select 1 from public.table_members m where m.table_id = id and m.user_id = auth.uid()));
create policy tables_host_write on public.game_tables for all using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy members_read on public.table_members for select using (user_id = auth.uid() or exists (select 1 from public.table_members own where own.table_id = table_id and own.user_id = auth.uid()));
create policy members_self_join on public.table_members for insert with check (user_id = auth.uid());
create policy invitations_participant_read on public.invitations for select using (inviter_id = auth.uid() or invitee_id = auth.uid());
create policy invitations_inviter_write on public.invitations for all using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());
create policy sessions_member_read on public.game_sessions for select using (exists (select 1 from public.table_members m where m.table_id = game_sessions.table_id and m.user_id = auth.uid()));
create policy results_member_read on public.game_results for select using (player_id = auth.uid() or exists (select 1 from public.game_sessions s join public.table_members m on m.table_id = s.table_id where s.id = session_id and m.user_id = auth.uid()));
create policy notifications_self_read on public.notifications for select using (user_id = auth.uid());
create policy notifications_self_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy friendships_participant_read on public.friendships for select using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy friendships_self_write on public.friendships for all using (requester_id = auth.uid() or addressee_id = auth.uid()) with check (requester_id = auth.uid() or addressee_id = auth.uid());
create policy blocks_self_read on public.blocks for select using (blocker_id = auth.uid());
create policy blocks_self_write on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy reports_self_insert on public.reports for insert with check (reporter_id = auth.uid());
