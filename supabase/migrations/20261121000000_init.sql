-- ============================================================================
-- ちょうむしポイント  初期スキーマ
--   families / family_members : 家族アカウント（ログインユーザー ⇔ 家族）
--   players                   : 登録プレイヤー
--   game_sessions             : ゲームセッション（in_progress / completed）
--   game_participants         : ゲーム参加者ごとの途中ポイント・最終ポイント
-- 累計ポイントは completed セッションの final_points 合計から常に再計算する
-- （view: player_totals）。データの書き込みは RLS と SECURITY DEFINER の RPC で守る。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'わがや' check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now()
);

create table public.family_members (
  family_id   uuid not null references public.families(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (family_id, user_id)
);
create unique index family_members_one_family_per_user on public.family_members(user_id);

create table public.players (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 12
                                     and display_name = btrim(display_name)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (family_id, display_name),
  unique (id, family_id)              -- composite FK target
);

create table public.game_sessions (
  id          uuid primary key,          -- generated on the client (idempotent start)
  family_id   uuid not null references public.families(id) on delete cascade,
  status      text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, family_id),
  check ((status = 'completed') = (ended_at is not null))
);
create index game_sessions_family_status on public.game_sessions(family_id, status, ended_at);

create table public.game_participants (
  session_id      uuid not null,
  player_id       uuid not null,
  family_id       uuid not null,
  seat            smallint not null check (seat between 1 and 6),
  current_points  integer not null default 0 check (current_points between 0 and 1000000000),
  final_points    integer check (final_points between 0 and 1000000000),
  primary key (session_id, player_id),
  unique (session_id, seat),
  -- composite FKs guarantee that session, player and row belong to the same family
  foreign key (session_id, family_id) references public.game_sessions(id, family_id) on delete cascade,
  foreign key (player_id, family_id)  references public.players(id, family_id)       on delete cascade
);
create index game_participants_player on public.game_participants(player_id);
create index game_participants_family on public.game_participants(family_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_family_member(fid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = fid and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.current_family_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select m.family_id from public.family_members m where m.user_id = (select auth.uid());
$$;

create or replace function public.require_family()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare fid uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  fid := public.current_family_id();
  if fid is null then
    raise exception 'family not initialized' using errcode = 'P0002';
  end if;
  return fid;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create trigger players_touch before update on public.players
  for each row execute function public.touch_updated_at();
create trigger game_sessions_touch before update on public.game_sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.families          enable row level security;
alter table public.family_members    enable row level security;
alter table public.players           enable row level security;
alter table public.game_sessions     enable row level security;
alter table public.game_participants enable row level security;

create policy families_select on public.families for select to authenticated
  using (public.is_family_member(id));
create policy families_update on public.families for update to authenticated
  using (public.is_family_member(id)) with check (public.is_family_member(id));

create policy family_members_select on public.family_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy players_select on public.players for select to authenticated
  using (public.is_family_member(family_id));
create policy players_insert on public.players for insert to authenticated
  with check (public.is_family_member(family_id));
create policy players_update on public.players for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
-- (delete goes through delete_player() so that orphaned sessions are cleaned up)

create policy game_sessions_select on public.game_sessions for select to authenticated
  using (public.is_family_member(family_id));
create policy game_participants_select on public.game_participants for select to authenticated
  using (public.is_family_member(family_id));
-- game tables are written only through the RPCs below (no insert/update/delete policies)

-- Table privileges: nothing for anon, read + limited writes for authenticated
revoke all on public.families, public.family_members, public.players,
              public.game_sessions, public.game_participants from anon, public;
revoke all on public.families, public.family_members, public.players,
              public.game_sessions, public.game_participants from authenticated;
grant select, update (name)        on public.families          to authenticated;
grant select                       on public.family_members    to authenticated;
grant select, insert (family_id, display_name), update (display_name)
                                   on public.players           to authenticated;
grant select                       on public.game_sessions     to authenticated;
grant select                       on public.game_participants to authenticated;

-- ---------------------------------------------------------------------------
-- Views (security_invoker => RLS of the caller applies)
-- ---------------------------------------------------------------------------
create view public.completed_results with (security_invoker = true) as
  select gp.session_id, gp.player_id, gp.family_id, gp.final_points, s.ended_at
  from public.game_participants gp
  join public.game_sessions s on s.id = gp.session_id and s.family_id = gp.family_id
  where s.status = 'completed';

create view public.player_totals with (security_invoker = true) as
  select p.id as player_id, p.family_id,
         coalesce(sum(r.final_points), 0)::bigint as total_points,
         count(r.session_id)::integer             as games_played
  from public.players p
  left join public.completed_results r on r.player_id = p.id
  group by p.id, p.family_id;

revoke all on public.completed_results, public.player_totals from anon, public;
grant select on public.completed_results, public.player_totals to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Creates the family for the signed-in account on first login (idempotent).
create or replace function public.ensure_family(p_name text default null)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid()); fid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select family_id into fid from public.family_members where user_id = uid;
  if fid is null then
    insert into public.families(name) values (coalesce(nullif(btrim(p_name), ''), 'わがや'))
      returning id into fid;
    insert into public.family_members(family_id, user_id) values (fid, uid);
  end if;
  return fid;
end;
$$;

-- Starts a game. Idempotent on p_session_id. All participants start at 0.
create or replace function public.start_game(p_session_id uuid, p_player_ids uuid[])
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare fid uuid := public.require_family(); existing public.game_sessions; n int;
begin
  select * into existing from public.game_sessions where id = p_session_id;
  if found then
    if existing.family_id <> fid then raise exception 'forbidden' using errcode = '42501'; end if;
    return p_session_id;                     -- already started (retry)
  end if;

  n := coalesce(array_length(p_player_ids, 1), 0);
  if n < 1 or n > 6 then raise exception 'players must be 1..6' using errcode = '22023'; end if;
  if (select count(distinct x) from unnest(p_player_ids) x) <> n then
    raise exception 'duplicate players' using errcode = '22023';
  end if;
  if (select count(*) from public.players where family_id = fid and id = any(p_player_ids)) <> n then
    raise exception 'unknown player' using errcode = '22023';
  end if;

  insert into public.game_sessions(id, family_id) values (p_session_id, fid);
  insert into public.game_participants(session_id, player_id, family_id, seat)
    select p_session_id, x.pid, fid, x.ord::smallint
    from unnest(p_player_ids) with ordinality as x(pid, ord);
  return p_session_id;
end;
$$;

-- Saves in-game points so the game can be resumed (no effect once completed).
-- p_scores: {"<player uuid>": 12, ...}
create or replace function public.save_progress(p_session_id uuid, p_scores jsonb)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare fid uuid := public.require_family();
begin
  update public.game_participants gp
     set current_points = least(greatest(coalesce((p_scores ->> gp.player_id::text)::bigint, gp.current_points), 0), 1000000000)
    from public.game_sessions s
   where gp.session_id = p_session_id and s.id = gp.session_id
     and s.family_id = fid and gp.family_id = fid and s.status = 'in_progress';
  update public.game_sessions set updated_at = now()
   where id = p_session_id and family_id = fid and status = 'in_progress';
end;
$$;

-- Completes a game exactly once. Final points (floored at 0) are fixed and from then on
-- count toward each player's total. Calling it again returns the stored result unchanged.
create or replace function public.complete_game(p_session_id uuid, p_scores jsonb)
returns table (player_id uuid, seat smallint, final_points integer, ended_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare fid uuid := public.require_family(); s public.game_sessions;
begin
  select * into s from public.game_sessions gs where gs.id = p_session_id for update;
  if not found or s.family_id <> fid then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if s.status = 'in_progress' then
    update public.game_participants gp
       set final_points = least(greatest(coalesce((p_scores ->> gp.player_id::text)::bigint, gp.current_points), 0), 1000000000),
           current_points = least(greatest(coalesce((p_scores ->> gp.player_id::text)::bigint, gp.current_points), 0), 1000000000)
     where gp.session_id = p_session_id;
    update public.game_sessions gs set status = 'completed', ended_at = now()
     where gs.id = p_session_id;
  end if;

  return query
    select gp.player_id, gp.seat, gp.final_points, gs.ended_at
      from public.game_participants gp
      join public.game_sessions gs on gs.id = gp.session_id
     where gp.session_id = p_session_id
     order by gp.seat;
end;
$$;

-- Discards an unfinished game.
create or replace function public.abandon_game(p_session_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare fid uuid := public.require_family();
begin
  delete from public.game_sessions
   where id = p_session_id and family_id = fid and status = 'in_progress';
end;
$$;

-- Deletes a player together with their totals, history and graph data
-- (participant rows cascade; sessions left with nobody are removed too).
create or replace function public.delete_player(p_player_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare fid uuid := public.require_family();
begin
  delete from public.players where id = p_player_id and family_id = fid;
  if not found then raise exception 'player not found' using errcode = 'P0002'; end if;
  delete from public.game_sessions gs
   where gs.family_id = fid
     and not exists (select 1 from public.game_participants gp where gp.session_id = gs.id);
end;
$$;

revoke all on function public.is_family_member(uuid), public.current_family_id(), public.require_family(),
  public.ensure_family(text), public.start_game(uuid, uuid[]), public.save_progress(uuid, jsonb),
  public.complete_game(uuid, jsonb), public.abandon_game(uuid), public.delete_player(uuid)
  from public, anon;
grant execute on function public.is_family_member(uuid), public.current_family_id(),
  public.ensure_family(text), public.start_game(uuid, uuid[]), public.save_progress(uuid, jsonb),
  public.complete_game(uuid, jsonb), public.abandon_game(uuid), public.delete_player(uuid)
  to authenticated;
