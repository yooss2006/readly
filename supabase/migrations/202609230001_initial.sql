-- Run in the Supabase SQL editor before starting the app.
create extension if not exists pgcrypto;

create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table public.app_state (
  id boolean primary key default true check (id),
  firecrawl_paused boolean not null default false
);
insert into public.app_state (id) values (true);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  normalized_url text not null unique,
  title text,
  overview text,
  points jsonb,
  audio_path text,
  active_job uuid,
  active_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (points is null or jsonb_typeof(points) = 'array')
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id),
  user_id uuid not null references auth.users(id),
  day_key date not null,
  month_key date not null,
  phase text not null check (phase in ('summary', 'audio')),
  requested_audio boolean not null,
  charged boolean not null default false,
  reserved_krw integer not null default 0 check (reserved_krw >= 0),
  spent_krw integer not null default 0 check (spent_krw >= 0),
  status text not null default 'active' check (status in ('active', 'done', 'failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index generation_jobs_daily on public.generation_jobs(user_id, day_key);
create index generation_jobs_monthly on public.generation_jobs(month_key);

alter table public.allowed_emails enable row level security;
alter table public.app_state enable row level security;
alter table public.articles enable row level security;
alter table public.generation_jobs enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('readly-audio', 'readly-audio', false, 10485760, array['audio/mpeg'])
on conflict (id) do nothing;

create or replace function public.begin_generation(
  p_user uuid, p_url text, p_mode text, p_summary_reserve integer, p_audio_reserve integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_article public.articles%rowtype;
  v_job_id uuid;
  v_phase text;
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_total integer;
  v_daily integer;
  v_reserve integer;
  v_paused boolean;
begin
  if p_mode not in ('summary', 'both') or p_summary_reserve < 0 or p_audio_reserve < 0 then
    raise exception 'invalid generation parameters';
  end if;
  -- This row lock serializes budget, daily quota, and per-URL lease decisions.
  select firecrawl_paused into v_paused from public.app_state where id = true for update;
  if not exists (
    select 1 from auth.users u join public.allowed_emails a on a.email = lower(u.email)
    where u.id = p_user and u.email_confirmed_at is not null
  ) then
    return jsonb_build_object('state', 'not_invited');
  end if;

  insert into public.articles(normalized_url) values (p_url) on conflict (normalized_url) do nothing;
  select * into v_article from public.articles where normalized_url = p_url for update;
  if v_article.overview is not null and (p_mode = 'summary' or v_article.audio_path is not null) then
    return jsonb_build_object('state', 'cached', 'article', to_jsonb(v_article));
  end if;
  if v_article.active_job is not null then
    if v_article.active_until > now() then
      return jsonb_build_object('state', 'pending', 'article', to_jsonb(v_article));
    end if;
    -- A timed-out invocation may already have billed externally. Retain its full
    -- unused reservation as a conservative cost until manually reconciled.
    update public.generation_jobs
      set spent_krw = spent_krw + reserved_krw, reserved_krw = 0,
          status = 'failed', finished_at = now()
      where id = v_article.active_job and status = 'active';
    update public.articles set active_job = null, active_until = null where id = v_article.id;
  end if;
  v_phase := case when v_article.overview is null then 'summary' else 'audio' end;
  if v_phase = 'summary' and v_paused then
    return jsonb_build_object('state', 'scrape_paused');
  end if;
  v_reserve := case when v_phase = 'audio' then p_audio_reserve
    else p_summary_reserve + case when p_mode = 'both' then p_audio_reserve else 0 end end;

  select count(*) into v_daily from public.generation_jobs
    where user_id = p_user and day_key = v_day
      and (charged or (status = 'active' and not charged));
  if v_daily >= 5 then return jsonb_build_object('state', 'daily_limit'); end if;
  select coalesce(sum(spent_krw + case when status = 'active' then reserved_krw else 0 end), 0)
    into v_total from public.generation_jobs where month_key = v_month;
  if v_total >= 24000 or v_total + v_reserve > 24000 then
    return jsonb_build_object('state', 'monthly_limit');
  end if;

  insert into public.generation_jobs(article_id, user_id, day_key, month_key, phase, requested_audio, reserved_krw)
  values (v_article.id, p_user, v_day, v_month, v_phase, p_mode = 'both', v_reserve)
  returning id into v_job_id;
  update public.articles set active_job = v_job_id, active_until = now() + interval '10 minutes'
    where id = v_article.id;
  return jsonb_build_object('state', 'started', 'job_id', v_job_id,
    'phase', v_phase, 'article', to_jsonb(v_article));
end;
$$;

create or replace function public.complete_summary(
  p_job uuid, p_title text, p_overview text, p_points jsonb,
  p_actual_krw integer, p_audio_reserve integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.generation_jobs%rowtype;
  v_article public.articles%rowtype;
  v_continue boolean;
begin
  perform 1 from public.app_state where id = true for update;
  select * into v_job from public.generation_jobs where id = p_job for update;
  if v_job.status != 'active' or v_job.phase != 'summary' or
     p_actual_krw < 0 or p_audio_reserve < 0 or
     jsonb_typeof(p_points) != 'array' or length(trim(p_overview)) = 0 then
    raise exception 'invalid summary completion';
  end if;
  select * into v_article from public.articles where id = v_job.article_id for update;
  if v_article.active_job is distinct from p_job or v_article.active_until <= now() then
    raise exception 'generation lease expired';
  end if;
  v_continue := v_job.requested_audio;
  if p_actual_krw + (case when v_continue then p_audio_reserve else 0 end) > v_job.reserved_krw then
    raise exception 'reserved cost exceeded';
  end if;
  update public.articles set title = left(p_title, 500), overview = p_overview,
    points = p_points, updated_at = now(),
    active_job = case when v_continue then active_job else null end,
    active_until = case when v_continue then active_until else null end
    where id = v_article.id;
  update public.generation_jobs set charged = true, spent_krw = spent_krw + p_actual_krw,
    reserved_krw = case when v_continue then p_audio_reserve else 0 end,
    phase = case when v_continue then 'audio' else 'summary' end,
    status = case when v_continue then 'active' else 'done' end,
    finished_at = case when v_continue then null else now() end
    where id = p_job;
  select * into v_article from public.articles where id = v_article.id;
  return jsonb_build_object('phase', case when v_continue then 'audio' else 'done' end,
    'article', to_jsonb(v_article));
end;
$$;

create or replace function public.complete_audio(
  p_job uuid, p_path text, p_actual_krw integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.generation_jobs%rowtype;
  v_article public.articles%rowtype;
begin
  perform 1 from public.app_state where id = true for update;
  select * into v_job from public.generation_jobs where id = p_job for update;
  if v_job.status != 'active' or v_job.phase != 'audio' or
     p_actual_krw < 0 or p_actual_krw > v_job.reserved_krw or p_path = '' then
    raise exception 'invalid audio completion';
  end if;
  select * into v_article from public.articles where id = v_job.article_id for update;
  if v_article.active_job is distinct from p_job or v_article.active_until <= now() then
    raise exception 'generation lease expired';
  end if;
  update public.articles set audio_path = p_path, active_job = null,
    active_until = null, updated_at = now() where id = v_article.id;
  update public.generation_jobs set charged = true, spent_krw = spent_krw + p_actual_krw,
    reserved_krw = 0, status = 'done', finished_at = now() where id = p_job;
  select * into v_article from public.articles where id = v_article.id;
  return jsonb_build_object('article', to_jsonb(v_article));
end;
$$;

create or replace function public.fail_generation(
  p_job uuid, p_incurred_krw integer, p_pause_firecrawl boolean default false
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.generation_jobs%rowtype;
begin
  perform 1 from public.app_state where id = true for update;
  select * into v_job from public.generation_jobs where id = p_job for update;
  if v_job.status != 'active' or p_incurred_krw < 0 then return; end if;
  update public.generation_jobs set spent_krw = spent_krw + p_incurred_krw,
    reserved_krw = 0, status = 'failed', finished_at = now() where id = p_job;
  update public.articles set active_job = null, active_until = null
    where id = v_job.article_id and active_job = p_job;
  if p_pause_firecrawl then
    update public.app_state set firecrawl_paused = true where id = true;
  end if;
end;
$$;

revoke all on function public.begin_generation(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_summary(uuid, text, text, jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_audio(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.fail_generation(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.begin_generation(uuid, text, text, integer, integer) to service_role;
grant execute on function public.complete_summary(uuid, text, text, jsonb, integer, integer) to service_role;
grant execute on function public.complete_audio(uuid, text, integer) to service_role;
grant execute on function public.fail_generation(uuid, integer, boolean) to service_role;
