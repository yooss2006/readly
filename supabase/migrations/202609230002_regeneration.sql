-- Run after 202609230001_initial.sql.
alter table public.generation_jobs
  add column regeneration boolean not null default false;

create table public.regeneration_requests (
  article_id uuid primary key references public.articles(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  requested_by_email text not null,
  created_at timestamptz not null default now()
);
alter table public.regeneration_requests enable row level security;

create or replace function public.request_regeneration(p_user uuid, p_article uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_article public.articles%rowtype;
  v_email text;
  v_inserted uuid;
begin
  perform 1 from public.app_state where id = true for update;
  select lower(u.email) into v_email from auth.users u
    join public.allowed_emails a on a.email = lower(u.email)
    where u.id = p_user and u.email_confirmed_at is not null;
  if v_email is null or v_email = 'yoofh2006@gmail.com' then
    return jsonb_build_object('state', 'not_allowed');
  end if;
  select * into v_article from public.articles where id = p_article for update;
  if not found or v_article.overview is null then
    return jsonb_build_object('state', 'not_found');
  end if;
  if v_article.active_job is not null and v_article.active_until > now() then
    return jsonb_build_object('state', 'in_progress');
  end if;
  insert into public.regeneration_requests(article_id, requested_by, requested_by_email)
    values (p_article, p_user, v_email)
    on conflict (article_id) do nothing
    returning article_id into v_inserted;
  return jsonb_build_object('state', case when v_inserted is null then 'existing' else 'requested' end);
end;
$$;

create or replace function public.begin_regeneration(
  p_user uuid, p_article uuid, p_summary_reserve integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_article public.articles%rowtype;
  v_job_id uuid;
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_total integer;
  v_daily integer;
  v_paused boolean;
begin
  if p_summary_reserve < 0 then raise exception 'invalid regeneration parameters'; end if;
  select firecrawl_paused into v_paused from public.app_state where id = true for update;
  if not exists (
    select 1 from auth.users u join public.allowed_emails a on a.email = lower(u.email)
    where u.id = p_user and lower(u.email) = 'yoofh2006@gmail.com'
      and u.email_confirmed_at is not null
  ) then
    return jsonb_build_object('state', 'not_invited');
  end if;
  select * into v_article from public.articles where id = p_article for update;
  if not found or v_article.overview is null then
    return jsonb_build_object('state', 'not_found');
  end if;
  if v_article.active_job is not null then
    if v_article.active_until > now() then
      return jsonb_build_object('state', 'pending', 'article', to_jsonb(v_article));
    end if;
    update public.generation_jobs
      set spent_krw = spent_krw + reserved_krw, reserved_krw = 0,
          status = 'failed', finished_at = now()
      where id = v_article.active_job and status = 'active';
    update public.articles set active_job = null, active_until = null where id = v_article.id;
  end if;
  if v_paused then return jsonb_build_object('state', 'scrape_paused'); end if;
  select count(*) into v_daily from public.generation_jobs
    where user_id = p_user and day_key = v_day
      and (charged or (status = 'active' and not charged));
  if v_daily >= 5 then return jsonb_build_object('state', 'daily_limit'); end if;
  select coalesce(sum(spent_krw + case when status = 'active' then reserved_krw else 0 end), 0)
    into v_total from public.generation_jobs where month_key = v_month;
  if v_total >= 24000 or v_total + p_summary_reserve > 24000 then
    return jsonb_build_object('state', 'monthly_limit');
  end if;
  insert into public.generation_jobs(
    article_id, user_id, day_key, month_key, phase, requested_audio, reserved_krw, regeneration
  ) values (v_article.id, p_user, v_day, v_month, 'summary', false, p_summary_reserve, true)
  returning id into v_job_id;
  update public.articles set active_job = v_job_id, active_until = now() + interval '10 minutes'
    where id = v_article.id;
  return jsonb_build_object('state', 'started', 'job_id', v_job_id,
    'phase', 'summary', 'article', to_jsonb(v_article));
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
    audio_path = case when v_job.regeneration then null else audio_path end,
    active_job = case when v_continue then active_job else null end,
    active_until = case when v_continue then active_until else null end
    where id = v_article.id;
  update public.generation_jobs set charged = true, spent_krw = spent_krw + p_actual_krw,
    reserved_krw = case when v_continue then p_audio_reserve else 0 end,
    phase = case when v_continue then 'audio' else 'summary' end,
    status = case when v_continue then 'active' else 'done' end,
    finished_at = case when v_continue then null else now() end
    where id = p_job;
  if v_job.regeneration then
    delete from public.regeneration_requests where article_id = v_article.id;
  end if;
  select * into v_article from public.articles where id = v_article.id;
  return jsonb_build_object('phase', case when v_continue then 'audio' else 'done' end,
    'article', to_jsonb(v_article));
end;
$$;

revoke all on function public.request_regeneration(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_regeneration(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.request_regeneration(uuid, uuid) to service_role;
grant execute on function public.begin_regeneration(uuid, uuid, integer) to service_role;
