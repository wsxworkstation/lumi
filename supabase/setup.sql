-- 学迹 Studylog：Supabase 一次性设置
-- 在 Supabase → SQL Editor 新建查询，全部贴上，按 Run。重复运行也安全。
--
-- 设计：每位老师账号一行完整资料（studylog_state），rev 版本号用来检测
-- 两台设备同时修改的冲突；每天（马来西亚时间）第一次修改前，把当时的资料
-- 存入 studylog_backups（保留最近 120 份），老师可在设置页恢复。

create table if not exists public.studylog_state (
  owner uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,
  device text,
  updated_at timestamptz not null default now()
);

create table if not exists public.studylog_backups (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  rev bigint not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.studylog_backups add column if not exists reason text not null default 'daily';
create index if not exists studylog_backups_owner_time on public.studylog_backups (owner, created_at desc);

alter table public.studylog_state enable row level security;
alter table public.studylog_backups enable row level security;

-- 只开放读取自己的资料；写入一律经过下面的函数。
revoke all on public.studylog_state, public.studylog_backups from anon, authenticated;
grant select on public.studylog_state, public.studylog_backups to authenticated;

drop policy if exists "own state" on public.studylog_state;
create policy "own state" on public.studylog_state for select to authenticated
  using (owner = (select auth.uid()));
drop policy if exists "own backups" on public.studylog_backups;
create policy "own backups" on public.studylog_backups for select to authenticated
  using (owner = (select auth.uid()));

create or replace function public.studylog_save(p_data jsonb, p_base_rev bigint, p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cur_rev bigint;
  cur_data jsonb;
  next_rev bigint;
begin
  if uid is null then
    raise exception 'STUDYLOG_AUTH';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or (p_data->>'version') is distinct from '1' then
    raise exception 'STUDYLOG_INVALID';
  end if;

  select s.rev, s.data into cur_rev, cur_data
    from public.studylog_state s where s.owner = uid for update;

  if not found then
    if p_base_rev <> 0 then
      raise exception 'STUDYLOG_CONFLICT';
    end if;
    insert into public.studylog_state (owner, data, rev, device) values (uid, p_data, 1, p_device);
    return jsonb_build_object('rev', 1, 'updated_at', now());
  end if;

  if cur_rev <> p_base_rev then
    raise exception 'STUDYLOG_CONFLICT';
  end if;

  if not exists (
    select 1 from public.studylog_backups b
    where b.owner = uid and b.reason = 'daily'
      and (b.created_at at time zone 'Asia/Kuala_Lumpur')::date = (now() at time zone 'Asia/Kuala_Lumpur')::date
  ) then
    insert into public.studylog_backups (owner, rev, data, reason) values (uid, cur_rev, cur_data, 'daily');
    delete from public.studylog_backups b
      where b.owner = uid and b.id not in (
        select k.id from public.studylog_backups k where k.owner = uid order by k.created_at desc limit 120
      );
  end if;

  next_rev := cur_rev + 1;
  update public.studylog_state s
    set data = p_data, rev = next_rev, device = p_device, updated_at = now()
    where s.owner = uid;
  return jsonb_build_object('rev', next_rev, 'updated_at', now());
end;
$$;

revoke all on function public.studylog_save(jsonb, bigint, text) from public, anon;
grant execute on function public.studylog_save(jsonb, bigint, text) to authenticated;

-- 恢复旧版本之前，先把目前的资料另存一份，恢复错了还能回来。
create or replace function public.studylog_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'STUDYLOG_AUTH';
  end if;
  insert into public.studylog_backups (owner, rev, data, reason)
    select s.owner, s.rev, s.data, 'before-restore' from public.studylog_state s where s.owner = uid;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.studylog_snapshot() from public, anon;
grant execute on function public.studylog_snapshot() to authenticated;
