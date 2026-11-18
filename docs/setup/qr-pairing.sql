-- RoboSynct QR pairing v1. Run once in this project's Supabase SQL Editor.
-- Extends the existing RoboSynct schema. No passwords, API keys, or tokens here.
-- Anonymous RPC access is intentional and capability-scoped; no private table
-- is exposed. Phones get a revocable dashboard grant, never an Auth session.
begin;

do $$
begin
  if to_regclass('public.projects') is null or to_regclass('public.widgets') is null then
    raise exception 'Install the RoboSynct database foundation first.';
  end if;
  if to_regclass('public.rs_pairing_schema') is null and (
    to_regclass('public.rs_pair_requests') is not null or
    to_regclass('public.rs_mobile_connections') is not null or
    exists(select 1 from pg_namespace where nspname='rs_pairing_private') or
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'rs_pairing_%' or p.proname in('rs_mobile_dashboard','rs_mobile_arrange','rs_mobile_disconnect')))
  ) then raise exception 'Existing pairing names found. Setup stopped without changing them.';end if;
end $$;

create schema if not exists rs_pairing_private;
revoke all on schema rs_pairing_private from public,anon,authenticated;
create table if not exists public.rs_pairing_schema(version integer primary key check(version=1));
insert into public.rs_pairing_schema values(1) on conflict do nothing;
create table if not exists public.rs_pair_requests(
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_hash text not null,
  claim_hash text,
  device_label text,
  match_code text,
  status text not null default 'pending' check(status in('pending','claimed','approved','denied','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '5 minutes'
);
create table if not exists public.rs_mobile_connections(
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null,
  token_hash text not null,
  can_arrange boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days',
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists rs_pair_requests_project on public.rs_pair_requests(project_id,created_at desc);
create index if not exists rs_pair_requests_owner on public.rs_pair_requests(owner_id);
create index if not exists rs_mobile_connections_project on public.rs_mobile_connections(project_id);
create index if not exists rs_mobile_connections_owner on public.rs_mobile_connections(owner_id);
alter table public.rs_pairing_schema enable row level security;
alter table public.rs_pair_requests enable row level security;
alter table public.rs_mobile_connections enable row level security;
revoke all on public.rs_pairing_schema,public.rs_pair_requests,public.rs_mobile_connections from public,anon,authenticated;

create or replace function rs_pairing_private.hash_token(p_token text) returns text
language sql immutable strict set search_path='' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex')
$$;
create or replace function rs_pairing_private.require_owner(p_project_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid()) then
    raise exception 'Project access denied.' using errcode='42501';
  end if;
end $$;
create or replace function rs_pairing_private.require_connection(p_id uuid,p_token text)
returns public.rs_mobile_connections language plpgsql security definer set search_path='' as $$
declare c public.rs_mobile_connections;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Connection unavailable.' using errcode='42501';end if;
  select * into c from public.rs_mobile_connections where id=p_id for update;
  if not found or c.token_hash<>rs_pairing_private.hash_token(p_token) or c.revoked_at is not null or c.expires_at<=now()
    or not exists(select 1 from public.projects p where p.id=c.project_id and p.owner_id=c.owner_id) then
    raise exception 'Connection unavailable.' using errcode='42501';
  end if;
  update public.rs_mobile_connections set last_used_at=now() where id=c.id;
  return c;
end $$;

create or replace function public.rs_pairing_create(p_project_id uuid,p_request_id uuid,p_invite_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rs_pair_requests;
begin
  perform rs_pairing_private.require_owner(p_project_id);
  if p_invite_token is null or p_invite_token !~ '^[a-f0-9]{64}$' or p_request_id is null then raise exception 'Invalid pairing request.';end if;
  -- Serialize per project so limits cannot be raced by concurrent creation.
  perform 1 from public.projects where id=p_project_id for update;
  select * into r from public.rs_pair_requests where id=p_request_id;
  if found then
    if r.project_id<>p_project_id or r.owner_id<>auth.uid() or r.invite_hash<>rs_pairing_private.hash_token(p_invite_token) then raise exception 'Invalid pairing request.';end if;
    return jsonb_build_object('id',r.id,'status',case when r.expires_at<=now() and r.status in('pending','claimed') then 'expired' else r.status end,'expires_at',r.expires_at);
  end if;
  delete from public.rs_pair_requests where project_id=p_project_id and created_at<now()-interval '1 day' and status<>'approved';
  if (select count(*) from public.rs_pair_requests where project_id=p_project_id and created_at>now()-interval '15 minutes')>=20 then raise exception 'Pairing request limit reached. Try again later.';end if;
  if (select count(*) from public.rs_mobile_connections where project_id=p_project_id and revoked_at is null and expires_at>now())>=10 then raise exception 'This project already has ten active phones. Revoke an old connection first.';end if;
  insert into public.rs_pair_requests(id,project_id,owner_id,invite_hash) values(p_request_id,p_project_id,auth.uid(),rs_pairing_private.hash_token(p_invite_token)) returning * into r;
  return jsonb_build_object('id',r.id,'status',r.status,'expires_at',r.expires_at);
end $$;

create or replace function public.rs_pairing_status(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rs_pair_requests;
begin
  select * into r from public.rs_pair_requests where id=p_request_id;
  if not found then raise exception 'Pairing request unavailable.' using errcode='42501';end if;
  perform rs_pairing_private.require_owner(r.project_id);
  if r.owner_id<>auth.uid() then raise exception 'Pairing request unavailable.' using errcode='42501';end if;
  return jsonb_build_object('id',r.id,'status',case when r.expires_at<=now() and r.status in('pending','claimed') then 'expired' else r.status end,'expires_at',r.expires_at,'device_label',r.device_label,'match_code',r.match_code);
end $$;

create or replace function public.rs_pairing_claim(p_request_id uuid,p_invite_token text,p_device_token text,p_device_label text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rs_pair_requests; h text;
begin
  if p_invite_token is null or p_device_token is null or p_invite_token !~ '^[a-f0-9]{64}$' or p_device_token !~ '^[a-f0-9]{64}$' or p_device_token=p_invite_token
    or p_device_label is null or char_length(trim(p_device_label)) not between 1 and 80 then raise exception 'Pairing request unavailable.' using errcode='42501';end if;
  select * into r from public.rs_pair_requests where id=p_request_id for update;
  if not found or r.invite_hash<>rs_pairing_private.hash_token(p_invite_token) or r.expires_at<=now() or r.status not in('pending','claimed') then raise exception 'Pairing request unavailable.' using errcode='42501';end if;
  h=rs_pairing_private.hash_token(p_device_token);
  if r.status='claimed' and r.claim_hash<>h then raise exception 'This code was already scanned. Generate a new code in the browser.' using errcode='42501';end if;
  if r.status='pending' then
    update public.rs_pair_requests set claim_hash=h,device_label=trim(p_device_label),match_code=lpad(((('x'||substr(h,1,8))::bit(32)::bigint)%1000000)::text,6,'0'),status='claimed' where id=r.id returning * into r;
  end if;
  return jsonb_build_object('status',r.status,'match_code',r.match_code,'expires_at',r.expires_at);
end $$;

create or replace function public.rs_pairing_decide(p_request_id uuid,p_code text,p_approve boolean,p_allow_arrange boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rs_pair_requests;c public.rs_mobile_connections;
begin
  select * into r from public.rs_pair_requests where id=p_request_id for update;
  if not found then raise exception 'Pairing request unavailable.' using errcode='42501';end if;
  perform rs_pairing_private.require_owner(r.project_id);
  if r.owner_id<>auth.uid() or p_code is null or p_code<>r.match_code then raise exception 'The confirmation code did not match.' using errcode='42501';end if;
  if r.status='approved' then
    select * into c from public.rs_mobile_connections where id=r.id;
    if not found or c.revoked_at is not null or c.expires_at<=now() then raise exception 'This connection ended. Generate a new QR.';end if;
    return jsonb_build_object('status','approved','connection_id',c.id,'expires_at',c.expires_at,'can_arrange',c.can_arrange);
  end if;
  if r.status<>'claimed' or r.expires_at<=now() then raise exception 'This pairing request expired or was cancelled.';end if;
  if not coalesce(p_approve,false) then update public.rs_pair_requests set status='denied' where id=r.id;return jsonb_build_object('status','denied');end if;
  perform 1 from public.projects where id=r.project_id for update;
  if (select count(*) from public.rs_mobile_connections where project_id=r.project_id and revoked_at is null and expires_at>now())>=10 then raise exception 'This project already has ten active phones.';end if;
  insert into public.rs_mobile_connections(id,project_id,owner_id,device_label,token_hash,can_arrange)
    values(r.id,r.project_id,r.owner_id,r.device_label,r.claim_hash,coalesce(p_allow_arrange,false)) returning * into c;
  update public.rs_pair_requests set status='approved' where id=r.id;
  return jsonb_build_object('status','approved','connection_id',c.id,'expires_at',c.expires_at,'can_arrange',c.can_arrange);
end $$;

create or replace function public.rs_pairing_cancel(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rs_pair_requests;
begin
  select * into r from public.rs_pair_requests where id=p_request_id for update;
  if not found then return jsonb_build_object('status','unavailable');end if;
  perform rs_pairing_private.require_owner(r.project_id);
  if r.owner_id<>auth.uid() then raise exception 'Pairing request unavailable.' using errcode='42501';end if;
  if r.status in('pending','claimed') then update public.rs_pair_requests set status='cancelled' where id=r.id;return jsonb_build_object('status','cancelled');end if;
  return jsonb_build_object('status',r.status);
end $$;

create or replace function public.rs_pairing_result(p_request_id uuid,p_device_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rs_pair_requests;c public.rs_mobile_connections;
begin
  if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' then raise exception 'Pairing request unavailable.' using errcode='42501';end if;
  select * into r from public.rs_pair_requests where id=p_request_id;
  if not found or r.claim_hash is null or r.claim_hash<>rs_pairing_private.hash_token(p_device_token) then raise exception 'Pairing request unavailable.' using errcode='42501';end if;
  if r.status='approved' then
    select * into c from public.rs_mobile_connections where id=r.id;
    if not found or c.revoked_at is not null or c.expires_at<=now() then return jsonb_build_object('status','revoked');end if;
    return jsonb_build_object('status','approved','connection_id',c.id,'project_id',c.project_id,'expires_at',c.expires_at,'can_arrange',c.can_arrange);
  end if;
  return jsonb_build_object('status',case when r.expires_at<=now() and r.status in('pending','claimed') then 'expired' else r.status end,'match_code',r.match_code,'expires_at',r.expires_at);
end $$;

create or replace function public.rs_pairing_connections(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform rs_pairing_private.require_owner(p_project_id);
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'device_label',c.device_label,'can_arrange',c.can_arrange,'created_at',c.created_at,'expires_at',c.expires_at,'last_used_at',c.last_used_at,'revoked_at',c.revoked_at) order by c.created_at desc)
    from (select * from public.rs_mobile_connections where project_id=p_project_id and owner_id=auth.uid() order by created_at desc limit 50)c),'[]'::jsonb);
end $$;

create or replace function public.rs_pairing_revoke(p_connection_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.rs_mobile_connections;
begin
  select * into c from public.rs_mobile_connections where id=p_connection_id for update;
  if not found then raise exception 'Connection unavailable.' using errcode='42501';end if;
  perform rs_pairing_private.require_owner(c.project_id);
  if c.owner_id<>auth.uid() then raise exception 'Connection unavailable.' using errcode='42501';end if;
  update public.rs_mobile_connections set revoked_at=coalesce(revoked_at,now()) where id=c.id;
  return jsonb_build_object('status','revoked');
end $$;

create or replace function public.rs_mobile_dashboard(p_connection_id uuid,p_device_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.rs_mobile_connections;d public.widgets;p public.projects;sources jsonb;event_rows jsonb;elements jsonb;
begin
  c=rs_pairing_private.require_connection(p_connection_id,p_device_token);
  select * into p from public.projects where id=c.project_id;
  select * into d from public.widgets where id=c.project_id and project_id=c.project_id and widget_type='note';
  elements=case when jsonb_typeof(d.config->'widgets')='array' then d.config->'widgets' else '[]'::jsonb end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'device',jsonb_build_object('id',dev.id,'label',dev.label,'board_model',dev.board_model,'config',jsonb_build_object('mode',dev.config->>'mode')),
    'channel',jsonb_build_object('id',ch.id,'device_id',ch.device_id,'channel_key',ch.channel_key,'title',ch.title,'unit',ch.unit,'value_type',ch.value_type,'direction',ch.direction),
    'readings',coalesce((select jsonb_agg(to_jsonb(t) order by t.recorded_at,t.id) from(select id,channel_id,value_num,value_text,value_bool,recorded_at,received_at,quality from public.telemetry where channel_id=ch.id order by recorded_at desc,id desc limit 100)t),'[]'::jsonb)
  ) order by ch.id),'[]'::jsonb) into sources
  from(select chan.* from public.channels chan join public.devices device on device.id=chan.device_id
    where device.project_id=c.project_id and chan.id::text in(select value->>'channel_id' from jsonb_array_elements(elements)) order by chan.id limit 24)ch
  join public.devices dev on dev.id=ch.device_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc,e.id desc),'[]'::jsonb) into event_rows
    from(select ev.id,ev.device_id,ev.event_type,ev.severity,ev.title,ev.occurred_at,ev.acknowledged_at,jsonb_build_object('source',ev.detail->'source') as detail
      from public.events ev join public.devices dev on dev.id=ev.device_id where dev.project_id=c.project_id order by ev.occurred_at desc,ev.id desc limit 50)e;
  return jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'description',p.description),'dashboard',case when d.id is null then null else jsonb_build_object('id',d.id,'project_id',d.project_id,'widget_type',d.widget_type,'config',d.config,'revision',d.revision)end,
    'sources',sources,'events',event_rows,'can_arrange',c.can_arrange,'refreshed_at',now(),'limits',jsonb_build_object('samples_per_stream',100,'events',50));
end $$;

create or replace function public.rs_mobile_disconnect(p_connection_id uuid,p_device_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.rs_mobile_connections;
begin
  c=rs_pairing_private.require_connection(p_connection_id,p_device_token);
  update public.rs_mobile_connections set revoked_at=now() where id=c.id;
  return jsonb_build_object('status','revoked');
end $$;

-- Optional phone editing changes only ordering and size of existing widgets.
-- It cannot replace bindings, add a camera URL, edit rules, or delete records.
create or replace function public.rs_mobile_arrange(p_connection_id uuid,p_device_token text,p_base_revision integer,p_save_token uuid,p_layout jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.rs_mobile_connections;d public.widgets;item jsonb;w jsonb;result jsonb='[]'::jsonb;seen text[]='{}';cols integer;h integer;job_hash text;
begin
  c=rs_pairing_private.require_connection(p_connection_id,p_device_token);
  if not c.can_arrange then raise exception 'This connection can view the dashboard only.' using errcode='42501';end if;
  if p_layout is null or jsonb_typeof(p_layout)<>'array' or jsonb_array_length(p_layout)>24 or pg_column_size(p_layout)>16384 or p_save_token is null then raise exception 'Invalid dashboard layout.';end if;
  select * into d from public.widgets where id=c.project_id and project_id=c.project_id for update;
  if not found or d.widget_type<>'note' or (d.config->>'kind') is distinct from 'dashboard_layout' or coalesce(d.config->>'schema_version','') not in('1','2','3','4') or jsonb_typeof(d.config->'widgets') is distinct from 'array' then raise exception 'Save a supported dashboard in the website first.';end if;
  job_hash=rs_pairing_private.hash_token(p_layout::text);
  if d.config->>'save_token'=p_save_token::text and d.config->>'mobile_save_hash'=job_hash then return jsonb_build_object('revision',d.revision,'config',d.config);end if;
  if p_base_revision is null or d.revision<>p_base_revision then raise exception 'DASHBOARD_CHANGED: reload before saving.' using errcode='40001';end if;
  if jsonb_array_length(p_layout)<>jsonb_array_length(d.config->'widgets') then raise exception 'Phone layout must keep all existing widgets.';end if;
  for item in select value from jsonb_array_elements(p_layout) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string' or (item->>'id')=any(seen) or jsonb_typeof(item->'columns') is distinct from 'number' or jsonb_typeof(item->'height') is distinct from 'number' then raise exception 'Invalid widget dimensions.';end if;
    if (item->>'columns')::numeric<>trunc((item->>'columns')::numeric) or (item->>'height')::numeric<>trunc((item->>'height')::numeric) then raise exception 'Use whole-number dimensions.';end if;
    cols=(item->>'columns')::integer;h=(item->>'height')::integer;
    if cols not between 3 and 12 or not(h=0 or h between 160 and 960) then raise exception 'Invalid widget dimensions.';end if;
    select value into w from jsonb_array_elements(d.config->'widgets') where value->>'id'=item->>'id';
    if w is null then raise exception 'A widget does not belong to this dashboard.';end if;
    seen=array_append(seen,item->>'id');
    if d.config->>'schema_version'='4' then
      w=w||jsonb_build_object('phone',coalesce(w->'phone','{}'::jsonb)||jsonb_build_object('span',case when cols<=4 then 4 when cols<=6 then 6 else 12 end,'position',cardinality(seen)-1,'height',h));
    else
      w=w||jsonb_build_object('width',case when cols=12 then 'full' else 'half' end,'size',jsonb_build_object('columns',cols,'height',h));
    end if;
    result=result||jsonb_build_array(w);
  end loop;
  update public.widgets set revision=revision+1,config=config||(case when d.config->>'schema_version'='4' then jsonb_build_object('custom_phone_layout',true) else '{}'::jsonb end)||jsonb_build_object('schema_version',case when d.config->>'schema_version'='4' then 4 else 3 end,'widgets',result,'save_token',p_save_token::text,'mobile_save_hash',job_hash)
    where id=d.id and project_id=c.project_id and revision=p_base_revision returning * into d;
  if not found then raise exception 'DASHBOARD_CHANGED: reload before saving.' using errcode='40001';end if;
  return jsonb_build_object('revision',d.revision,'config',d.config);
end $$;

-- Remove inherited/default execution before exposing the exact RPC surface.
revoke all on all functions in schema rs_pairing_private from public,anon,authenticated;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in('rs_pairing_create','rs_pairing_status','rs_pairing_claim','rs_pairing_decide','rs_pairing_cancel','rs_pairing_result','rs_pairing_connections','rs_pairing_revoke','rs_mobile_dashboard','rs_mobile_arrange','rs_mobile_disconnect') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.proname in('rs_pairing_claim','rs_pairing_result','rs_mobile_dashboard','rs_mobile_arrange','rs_mobile_disconnect') then
      execute format('grant execute on function %s to anon,authenticated',f.signature);
    else execute format('grant execute on function %s to authenticated',f.signature);end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
select 'RoboSynct QR pairing v1 installed. Existing project RLS is unchanged.' as result;
