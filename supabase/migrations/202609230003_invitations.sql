-- Run after 202609230002_regeneration.sql.
create table public.invitation_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_by uuid references auth.users(id),
  consumed_at timestamptz,
  revoked_at timestamptz,
  check ((consumed_by is null) = (consumed_at is null)),
  check (consumed_at is null or revoked_at is null)
);
create index invitation_links_created_at on public.invitation_links(created_at desc);
alter table public.invitation_links enable row level security;

create function public.create_invitation(p_owner uuid, p_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_expires_at timestamptz;
begin
  if not exists (
    select 1 from auth.users u join public.allowed_emails a on a.email = lower(u.email)
    where u.id = p_owner and lower(u.email) = 'yoofh2006@gmail.com'
      and u.email_confirmed_at is not null
  ) then
    return jsonb_build_object('state', 'not_allowed');
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invitation hash';
  end if;
  insert into public.invitation_links(token_hash, created_by)
    values (p_hash, p_owner) returning id, expires_at into v_id, v_expires_at;
  return jsonb_build_object('state', 'created', 'id', v_id, 'expires_at', v_expires_at);
end;
$$;

create function public.redeem_invitation(p_user uuid, p_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_link public.invitation_links%rowtype;
  v_email text;
  v_inserted integer;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('state', 'invalid');
  end if;
  -- Serializes two redemptions, and a concurrent revocation, for the same link.
  select * into v_link from public.invitation_links
    where token_hash = p_hash for update;
  if not found or v_link.consumed_at is not null or v_link.revoked_at is not null
    or v_link.expires_at <= clock_timestamp() then
    return jsonb_build_object('state', 'invalid');
  end if;
  select lower(email) into v_email from auth.users
    where id = p_user and email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('state', 'not_allowed'); end if;
  -- An existing member must not use someone else's invitation.
  if exists (select 1 from public.allowed_emails where email = v_email) then
    return jsonb_build_object('state', 'already_invited');
  end if;
  insert into public.allowed_emails(email) values (v_email) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('state', 'already_invited'); end if;
  update public.invitation_links set consumed_by = p_user, consumed_at = clock_timestamp()
    where id = v_link.id;
  return jsonb_build_object('state', 'redeemed');
end;
$$;

create function public.revoke_invitation(p_owner uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from auth.users u join public.allowed_emails a on a.email = lower(u.email)
    where u.id = p_owner and lower(u.email) = 'yoofh2006@gmail.com'
      and u.email_confirmed_at is not null
  ) then return jsonb_build_object('state', 'not_allowed'); end if;
  update public.invitation_links set revoked_at = clock_timestamp()
    where id = p_id and consumed_at is null and revoked_at is null and expires_at > clock_timestamp()
    returning id into v_id;
  return jsonb_build_object('state', case when v_id is null then 'not_active' else 'revoked' end);
end;
$$;

revoke all on function public.create_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_invitation(uuid, text) to service_role;
grant execute on function public.redeem_invitation(uuid, text) to service_role;
grant execute on function public.revoke_invitation(uuid, uuid) to service_role;
