-- RoboSynct Phase4C shared-view hardening. Run AFTER the retained Phase4 v1 installer.
-- Preserves records, memberships, owner RLS and the enabled/disabled marker.
begin;
do $$ begin
 if to_regclass('public.rs_phase4_schema') is null or to_regprocedure('public.rs_class_project(uuid,uuid)') is null then raise exception 'Install the reviewed Phase4 v1 backend first.';end if;
 if to_regprocedure('rs_phase4_private.safe_shared_layout(jsonb)') is not null and obj_description(to_regprocedure('rs_phase4_private.safe_shared_layout(jsonb)'), 'pg_proc') is distinct from 'robosynct-phase4-shared-view-v2' then raise exception 'Shared-view helper name collision; no changes applied.';end if;
end $$;
create or replace function rs_phase4_private.safe_shared_layout(raw jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare widgets jsonb='[]'::jsonb;w jsonb;safe jsonb;item record;theme text;
begin
 if jsonb_typeof(raw)<>'object' or raw->>'kind'<>'dashboard_layout' or jsonb_typeof(raw->'widgets')<>'array' or jsonb_array_length(raw->'widgets')>24 then raise exception 'Unsupported shared Dashboard format.';end if;
 for w in select value from jsonb_array_elements(raw->'widgets') loop
  safe='{}'::jsonb;
  -- These are the existing display fields only. Nested config, URLs, save tokens,
  -- firmware, router and private camera fields never enter a shared response.
  for item in select key,value from jsonb_each(w) where key in('id','type','title','width','device_id','channel_id','aggregation','min','max','on_label','off_label','note') loop
   if jsonb_typeof(item.value) in('string','number','boolean','null') then safe=safe||jsonb_build_object(item.key,item.value);end if;
  end loop;
  theme=w->>'theme';if theme in('mint','midnight','ocean','violet','sunrise','contrast','inherit') then safe=safe||jsonb_build_object('theme',theme);end if;
  if jsonb_typeof(w->'size')='object' and jsonb_typeof(w->'size'->'columns')='number' and jsonb_typeof(w->'size'->'height')='number' then safe=safe||jsonb_build_object('size',jsonb_build_object('columns',w->'size'->'columns','height',w->'size'->'height'));end if;
  if w->>'type'='camera' then safe=safe||jsonb_build_object('type','note','note','Private camera access is not included in shared Dashboards.');end if;
  widgets=widgets||jsonb_build_array(safe);
 end loop;
 theme=raw->>'theme';if theme not in('mint','midnight','ocean','violet','sunrise','contrast') or theme is null then theme='mint';end if;
 return jsonb_build_object('kind','dashboard_layout','schema_version',3,'theme',theme,'widgets',widgets);
end $$;
comment on function rs_phase4_private.safe_shared_layout(jsonb) is 'robosynct-phase4-shared-view-v2';
revoke all on function rs_phase4_private.safe_shared_layout(jsonb) from public,anon,authenticated;
create or replace function public.rs_class_project(p_class uuid,p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;v_role text;p public.projects;d public.widgets;sources jsonb;event_rows jsonb;begin u=rs_phase4_private.require_class(p_class);v_role=rs_phase4_private.class_role(p_class);if not exists(select 1 from public.rs_class_shares s join public.projects x on x.id=s.project_id and x.owner_id=s.owner_id where s.class_id=p_class and s.project_id=p_project and (s.owner_id=u or v_role in('owner','teacher') or s.visibility='class')) then raise exception 'Shared project access denied.' using errcode='42501';end if;select * into p from public.projects where id=p_project;select * into d from public.widgets where id=p_project and project_id=p_project and widget_type='note';select coalesce(jsonb_agg(jsonb_build_object('device',jsonb_build_object('id',dev.id,'label',dev.label,'board_model',dev.board_model,'config',jsonb_build_object('mode',dev.config->>'mode')),'channel',jsonb_build_object('id',ch.id,'device_id',ch.device_id,'channel_key',ch.channel_key,'title',ch.title,'unit',ch.unit,'value_type',ch.value_type,'direction',ch.direction),'readings',coalesce((select jsonb_agg(to_jsonb(t) order by t.recorded_at,t.id) from(select id,channel_id,value_num,value_text,value_bool,recorded_at,received_at,quality from public.telemetry where channel_id=ch.id order by recorded_at desc,id desc limit 100)t),'[]'::jsonb))),'[]'::jsonb) into sources from (select c.* from public.channels c join public.devices v on v.id=c.device_id where v.project_id=p_project and c.id::text in(select value->>'channel_id' from jsonb_array_elements(case when jsonb_typeof(d.config->'widgets')='array' then d.config->'widgets' else '[]'::jsonb end)) order by c.id limit 24)ch join public.devices dev on dev.id=ch.device_id;select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc),'[]'::jsonb) into event_rows from(select ev.id,ev.device_id,ev.event_type,ev.severity,ev.title,ev.occurred_at,ev.acknowledged_at,jsonb_build_object('source',ev.detail->'source') as detail from public.events ev join public.devices v on v.id=ev.device_id where v.project_id=p_project order by ev.occurred_at desc,ev.id desc limit 50)e;return jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'description',p.description),'dashboard',case when d.id is null then null else jsonb_build_object('id',d.id,'revision',d.revision,'config',rs_phase4_private.safe_shared_layout(d.config)) end,'sources',sources,'events',event_rows,'shared_view_version',2,'can_arrange',false,'permissions',jsonb_build_object('view',true,'edit',false,'drive',false),'refreshed_at',now());end $$;
create or replace function public.rs_class_create_once(p_id uuid,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;r public.rs_classrooms;begin
 u=rs_phase4_private.require_enabled();if p_id is null or p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Choose a valid class name and request ID.';end if;
 select * into r from public.rs_classrooms where id=p_id;
 if found then if r.owner_id<>u or r.name<>btrim(p_name) then raise exception 'Class creation request conflicts with an existing record.' using errcode='40001';end if;return jsonb_build_object('id',r.id,'name',r.name,'role','owner');end if;
 if(select count(*) from public.rs_classrooms where owner_id=u)>=10 then raise exception 'Ten-classroom limit reached.';end if;
 insert into public.rs_classrooms(id,owner_id,name) values(p_id,u,btrim(p_name)) on conflict do nothing returning * into r;
 if not found then select * into r from public.rs_classrooms where id=p_id;if r.owner_id<>u or r.name<>btrim(p_name) then raise exception 'Class creation request conflicts with an existing record.' using errcode='40001';end if;return jsonb_build_object('id',r.id,'name',r.name,'role','owner');end if;
 insert into public.rs_class_members values(r.id,u,'teacher','active',now());insert into rs_phase4_private.audit(class_id,actor,action) values(r.id,u,'class_created');return jsonb_build_object('id',r.id,'name',r.name,'role','owner');
end $$;
revoke all on function public.rs_class_create_once(uuid,text) from public,anon;
grant execute on function public.rs_class_create_once(uuid,text) to authenticated;
create or replace function public.rs_phase4_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform rs_phase4_private.require_enabled();return jsonb_build_object('installed',true,'version',1,'classrooms',true,'cloud_rules',true,'shared_view_version',2,'classroom_create_idempotent',true,'camera_transport','private_pinned_tls_relay','motor_operations','deferred');end $$;
revoke all on function public.rs_phase4_status(),public.rs_class_project(uuid,uuid) from public,anon;
grant execute on function public.rs_phase4_status(),public.rs_class_project(uuid,uuid) to authenticated;
-- Phase4-only query planning. Access predicates retain their existing meaning.
create index if not exists rs_phase4_class_owner on public.rs_classrooms(owner_id);
create index if not exists rs_phase4_share_owner on public.rs_class_shares(owner_id);
create index if not exists rs_phase4_rule_owner on public.rs_cloud_rules(owner_id);
create index if not exists rs_phase4_rule_project on public.rs_cloud_rules(project_id);
create index if not exists rs_phase4_audit_actor on rs_phase4_private.audit(actor);
alter policy rs_member_read on public.rs_class_members using(user_id=(select auth.uid()) or rs_phase4_private.class_role(class_id) in('owner','teacher'));
alter policy rs_share_read on public.rs_class_shares using(owner_id=(select auth.uid()) or rs_phase4_private.class_role(class_id) in('owner','teacher') or visibility='class' and rs_phase4_private.class_role(class_id) is not null);
alter policy rs_cloud_rule_read on public.rs_cloud_rules using(owner_id=(select auth.uid()));
commit;
