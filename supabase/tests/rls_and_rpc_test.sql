-- Run against a scratch DB after stub_supabase.sql + the migration:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_rpc_test.sql
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set G1 'aaaaaaaa-0000-0000-0000-000000000001'
\set G2 'aaaaaaaa-0000-0000-0000-000000000002'
insert into auth.users values (:'A'), (:'B');

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond,false) then raise exception 'ASSERT FAILED: %', msg; end if; raise notice 'ok: %', msg; end $$;

-- ---------- family A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select public.ensure_family('たかもり') as fam_a \gset
select pg_temp.assert(public.ensure_family() = :'fam_a', 'ensure_family is idempotent');
insert into players(family_id, display_name) values (:'fam_a','パパ'),(:'fam_a','ママ'),(:'fam_a','かいと');
select id as papa from players where display_name='パパ' \gset
select id as mama from players where display_name='ママ' \gset
select id as kaito from players where display_name='かいと' \gset

do $$ begin
  insert into players(family_id, display_name) values (public.current_family_id(),'パパ');
  raise exception 'dup name allowed';
exception when unique_violation then raise notice 'ok: duplicate name rejected'; end $$;

-- duplicate player in one game rejected
do $$ begin
  perform public.start_game(gen_random_uuid(), array[(select id from players where display_name='パパ'),(select id from players where display_name='パパ')]);
  raise exception 'dup participant allowed';
exception when invalid_parameter_value then raise notice 'ok: duplicate participant rejected'; end $$;

select public.start_game(:'G1', array[:'papa',:'mama',:'kaito']::uuid[]);
select public.start_game(:'G1', array[:'papa',:'mama',:'kaito']::uuid[]);  -- retry
select pg_temp.assert((select count(*) from game_participants where session_id=:'G1')=3, 'start_game idempotent, 3 participants');
select pg_temp.assert((select sum(current_points) from game_participants where session_id=:'G1')=0, 'game starts at 0');

select public.save_progress(:'G1', jsonb_build_object(:'papa', 35, :'mama', -20, :'kaito', 100));
select pg_temp.assert((select current_points from game_participants where player_id=:'mama' and session_id=:'G1')=0, 'progress floored at 0');
select pg_temp.assert((select total_points from player_totals where player_id=:'papa')=0, 'in-progress points not in totals');

-- direct writes to game tables are blocked
do $$ begin
  update game_participants set final_points = 999;
  raise exception 'direct update allowed';
exception when insufficient_privilege then raise notice 'ok: direct update of game_participants blocked'; end $$;

select * from public.complete_game(:'G1', jsonb_build_object(:'papa', 35, :'mama', 10, :'kaito', 100));
-- second call (double tap / retry with different numbers) must not change anything
select * from public.complete_game(:'G1', jsonb_build_object(:'papa', 5000, :'mama', 5000, :'kaito', 5000));
select pg_temp.assert((select total_points from player_totals where player_id=:'papa')=35, 'complete_game idempotent (papa=35)');
select pg_temp.assert((select total_points from player_totals where player_id=:'kaito')=100, 'kaito=100');
select public.save_progress(:'G1', jsonb_build_object(:'papa', 1));
select pg_temp.assert((select final_points from game_participants where player_id=:'papa' and session_id=:'G1')=35, 'save_progress ignored after completion');

select public.start_game(:'G2', array[:'papa',:'kaito']::uuid[]);
select * from public.complete_game(:'G2', jsonb_build_object(:'papa', 15, :'kaito', -5));
select pg_temp.assert((select total_points from player_totals where player_id=:'papa')=50, 'totals recomputed from completed games (50)');
select pg_temp.assert((select total_points from player_totals where player_id=:'kaito')=100, 'negative final floored at 0');

-- ---------- family B cannot see or touch A ----------
select set_config('my.fam_a', :'fam_a', false);
select set_config('request.jwt.claim.sub', :'B', false);
select public.ensure_family() as fam_b \gset
select pg_temp.assert(:'fam_b' <> :'fam_a', 'B gets its own family');
select pg_temp.assert((select count(*) from players)=0, 'B cannot read A players');
select pg_temp.assert((select count(*) from game_sessions)=0, 'B cannot read A sessions');
select pg_temp.assert((select count(*) from completed_results)=0, 'B cannot read A results');
select pg_temp.assert((select count(*) from player_totals)=0, 'B cannot read A totals');
select pg_temp.assert((select count(*) from families)=1, 'B sees only own family');
do $$ begin
  insert into players(family_id, display_name) values (current_setting('my.fam_a')::uuid, 'しんにゅう');
  raise exception 'cross-family insert allowed';
exception when insufficient_privilege then raise notice 'ok: cross-family insert blocked (RLS)'; end $$;
update players set display_name='x' where id = :'papa';
do $$ begin
  perform * from public.complete_game('aaaaaaaa-0000-0000-0000-000000000001', '{}'::jsonb);
  raise exception 'cross-family complete allowed';
exception when no_data_found then raise notice 'ok: cross-family complete blocked'; end $$;
do $$ begin
  perform public.delete_player((select '00000000-0000-0000-0000-000000000000'::uuid));
  raise exception 'should fail';
exception when no_data_found then raise notice 'ok: delete unknown player fails'; end $$;
select public.abandon_game(:'G1');
select pg_temp.assert(not exists(select 1 from players where id=:'papa'), 'B still cannot see papa');

-- ---------- anon has nothing ----------
reset role; set role anon;
do $$ begin
  perform count(*) from public.players;
  raise exception 'anon read allowed';
exception when insufficient_privilege then raise notice 'ok: anon blocked'; end $$;

-- ---------- back to A: name intact, delete cascades ----------
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.assert((select display_name from players where id=:'papa')='パパ', 'B update had no effect');
select pg_temp.assert((select status from game_sessions where id=:'G1')='completed', 'B abandon had no effect');
select public.delete_player(:'kaito');
select pg_temp.assert(not exists(select 1 from completed_results where player_id=:'kaito'), 'kaito history removed');
select pg_temp.assert((select total_points from player_totals where player_id=:'papa')=50, 'others unaffected');
select public.delete_player(:'papa');
select public.delete_player(:'mama');
select pg_temp.assert((select count(*) from game_sessions)=0, 'empty sessions cleaned up');
\echo ALL TESTS PASSED
