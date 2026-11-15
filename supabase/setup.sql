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

-- ============================================================
-- 线上练习（学生版）：老师发布题目，学生选年级＋名字作答。
-- 答案（answers）只存在这里；学生只能通过下面的函数作答，读不到答案。
-- ============================================================
create table if not exists public.lumi_quizzes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  activity_id text not null,
  class_id text not null,
  level text not null,
  title text not null,
  due date,
  questions jsonb not null,
  answers jsonb not null,
  roster jsonb not null,
  open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, activity_id)
);
create table if not exists public.lumi_quiz_progress (
  quiz_id uuid not null references public.lumi_quizzes(id) on delete cascade,
  student_id text not null,
  step int not null default 0,
  wrong jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  done_at timestamptz,
  primary key (quiz_id, student_id)
);
alter table public.lumi_quizzes enable row level security;
alter table public.lumi_quiz_progress enable row level security;
revoke all on public.lumi_quizzes, public.lumi_quiz_progress from anon, authenticated;
grant select, update on public.lumi_quizzes to authenticated;
grant select on public.lumi_quiz_progress to authenticated;
drop policy if exists "own quizzes" on public.lumi_quizzes;
create policy "own quizzes" on public.lumi_quizzes for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "own quiz progress" on public.lumi_quiz_progress;
create policy "own quiz progress" on public.lumi_quiz_progress for select to authenticated
  using (exists (select 1 from public.lumi_quizzes q where q.id = quiz_id and q.owner = (select auth.uid())));

-- 老师发布或更新一份练习。答案改了的话，还没做完的学生从头开始；做完的保留。
create or replace function public.lumi_quiz_publish(p_activity text, p_class text, p_level text, p_title text, p_due date,
  p_questions jsonb, p_answers jsonb, p_roster jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  qid uuid;
  old_answers jsonb;
begin
  if uid is null then raise exception 'STUDYLOG_AUTH'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 or jsonb_typeof(p_answers) <> 'array'
     or jsonb_array_length(p_questions) <> jsonb_array_length(p_answers) or jsonb_typeof(p_roster) <> 'array' then
    raise exception 'LUMI_QUIZ_INVALID';
  end if;
  select q.id, q.answers into qid, old_answers from public.lumi_quizzes q where q.owner = uid and q.activity_id = p_activity;
  if qid is null then
    insert into public.lumi_quizzes (owner, activity_id, class_id, level, title, due, questions, answers, roster)
      values (uid, p_activity, p_class, p_level, p_title, p_due, p_questions, p_answers, p_roster) returning id into qid;
  else
    update public.lumi_quizzes q set class_id = p_class, level = p_level, title = p_title, due = p_due, questions = p_questions,
      answers = p_answers, roster = p_roster, open = true, updated_at = now() where q.id = qid;
    if old_answers is distinct from p_answers then
      delete from public.lumi_quiz_progress pr where pr.quiz_id = qid and pr.done_at is null;
    end if;
  end if;
  return jsonb_build_object('id', qid);
end;
$$;

-- 学生名单（按年级）：老师的 app 自动上传，没有练习时学生也能选年级、点名字。只有名字和内部编号。
create table if not exists public.lumi_roster (
  owner uuid primary key references auth.users(id) on delete cascade,
  levels jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.lumi_roster enable row level security;
revoke all on public.lumi_roster from anon, authenticated;

create or replace function public.lumi_roster_publish(p_levels jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'STUDYLOG_AUTH'; end if;
  if jsonb_typeof(p_levels) <> 'array' then raise exception 'LUMI_QUIZ_INVALID'; end if;
  insert into public.lumi_roster (owner, levels) values (uid, p_levels)
    on conflict (owner) do update set levels = excluded.levels, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.lumi_roster_publish(jsonb) from public, anon;
grant execute on function public.lumi_roster_publish(jsonb) to authenticated;

-- 学生入口：年级和学生名字（来自名单，以及开放练习的名单）。
create or replace function public.lumi_portal()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('level', t.level, 'students', t.students) order by t.level), '[]'::jsonb)
  from (
    select u.level, jsonb_agg(distinct u.student) as students
    from (
      select l.value ->> 'level' as level, s.value as student
        from public.lumi_roster r
        cross join lateral jsonb_array_elements(r.levels) l
        cross join lateral jsonb_array_elements(l.value -> 'students') s
      union all
      select q.level, s.value
        from public.lumi_quizzes q cross join lateral jsonb_array_elements(q.roster) s
        where q.open
    ) u
    where u.level is not null
    group by u.level
  ) t;
$$;

-- 这个学生可以做的练习（没做完的排前面）。
create or replace function public.lumi_student_quizzes(p_level text, p_student text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'due', q.due,
    'count', jsonb_array_length(q.questions), 'step', coalesce(pr.step, 0), 'done', pr.done_at is not null)
    order by (pr.done_at is not null), q.due nulls last, q.created_at desc), '[]'::jsonb)
  from public.lumi_quizzes q
  left join public.lumi_quiz_progress pr on pr.quiz_id = q.id and pr.student_id = p_student
  where q.open and q.level = p_level and q.roster @> jsonb_build_array(jsonb_build_object('id', p_student));
$$;

-- 开始或继续：返回题目（没有答案）和做到第几题。
create or replace function public.lumi_quiz_start(p_quiz uuid, p_student text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  qz public.lumi_quizzes;
  pr public.lumi_quiz_progress;
begin
  select * into qz from public.lumi_quizzes q where q.id = p_quiz and q.open;
  if qz.id is null or not qz.roster @> jsonb_build_array(jsonb_build_object('id', p_student)) then
    raise exception 'LUMI_QUIZ_NOT_FOUND';
  end if;
  insert into public.lumi_quiz_progress (quiz_id, student_id) values (p_quiz, p_student) on conflict do nothing;
  select * into pr from public.lumi_quiz_progress x where x.quiz_id = p_quiz and x.student_id = p_student;
  return jsonb_build_object('title', qz.title, 'questions', qz.questions, 'step', pr.step, 'done', pr.done_at is not null);
end;
$$;

-- 回答当前这一题：答对到下一题；答错记一次。全部答对就算交。
create or replace function public.lumi_quiz_answer(p_quiz uuid, p_student text, p_answer jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  qz public.lumi_quizzes;
  pr public.lumi_quiz_progress;
  k jsonb;
  total int;
  ok boolean;
  given jsonb;
  w jsonb;
begin
  select * into qz from public.lumi_quizzes q where q.id = p_quiz and q.open;
  if qz.id is null then raise exception 'LUMI_QUIZ_NOT_FOUND'; end if;
  select * into pr from public.lumi_quiz_progress x where x.quiz_id = p_quiz and x.student_id = p_student for update;
  if pr.quiz_id is null then raise exception 'LUMI_QUIZ_NOT_STARTED'; end if;
  total := jsonb_array_length(qz.answers);
  if pr.done_at is not null or pr.step >= total then
    return jsonb_build_object('correct', true, 'step', total, 'done', true);
  end if;
  k := qz.answers -> pr.step;
  if k ->> 'type' = 'fill' then
    ok := exists (select 1 from jsonb_array_elements_text(k -> 'accept') a(v)
      where a.v = lower(regexp_replace(trim(coalesce(p_answer #>> '{}', '')), '\s+', ' ', 'g')));
  else
    if jsonb_typeof(p_answer) <> 'array' then raise exception 'LUMI_QUIZ_INVALID'; end if;
    select coalesce(jsonb_agg(s.n order by s.n), '[]'::jsonb) into given
      from (select distinct e.v::int as n from jsonb_array_elements_text(p_answer) e(v) where e.v ~ '^[0-9]{1,2}$') s;
    ok := given = (k -> 'answer');
  end if;
  if ok then
    update public.lumi_quiz_progress x set step = pr.step + 1,
      done_at = case when pr.step + 1 >= total then now() else null end
      where x.quiz_id = p_quiz and x.student_id = p_student;
    return jsonb_build_object('correct', true, 'step', pr.step + 1, 'done', pr.step + 1 >= total);
  end if;
  w := pr.wrong;
  while jsonb_array_length(w) <= pr.step loop w := w || '0'::jsonb; end loop;
  w := jsonb_set(w, array[pr.step::text], to_jsonb((w ->> pr.step)::int + 1));
  update public.lumi_quiz_progress x set wrong = w where x.quiz_id = p_quiz and x.student_id = p_student;
  return jsonb_build_object('correct', false, 'step', pr.step, 'done', false);
end;
$$;

revoke all on function public.lumi_quiz_publish(text, text, text, text, date, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.lumi_quiz_publish(text, text, text, text, date, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.lumi_portal() from public;
revoke all on function public.lumi_student_quizzes(text, text) from public;
revoke all on function public.lumi_quiz_start(uuid, text) from public;
revoke all on function public.lumi_quiz_answer(uuid, text, jsonb) from public;
grant execute on function public.lumi_portal() to anon, authenticated;
grant execute on function public.lumi_student_quizzes(text, text) to anon, authenticated;
grant execute on function public.lumi_quiz_start(uuid, text) to anon, authenticated;
grant execute on function public.lumi_quiz_answer(uuid, text, jsonb) to anon, authenticated;
