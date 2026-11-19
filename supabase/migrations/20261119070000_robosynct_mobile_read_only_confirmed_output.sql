-- Read-only, same-boot confirmed output values for paired mobile dashboard.
-- Does not grant any new control command privileges or expose credential secrets.
CREATE OR REPLACE FUNCTION public.rs_mobile_dashboard(p_connection_id uuid, p_device_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

    ,'confirmed_output',case when ch.direction='output' then
      (select jsonb_build_object(
        'value', cmd.result->'applied',
        'applied_at', cmd.result_at,
        'source', 'board_command_report_not_physical_feedback',
        'feedback', cmd.result->'feedback')
       from rs_io_private.device_state st
       cross join lateral jsonb_array_elements(case when jsonb_typeof(st.reported->'outputs')='array' then st.reported->'outputs' else '[]'::jsonb end) output(value)
       join rs_io_private.commands cmd on cmd.id::text=output.value->>'command'
       where st.device_id=ch.device_id and cmd.device_id=ch.device_id
         and cmd.channel_id=ch.id and cmd.boot=st.last_boot
         and cmd.state='applied' and cmd.result->>'state'='applied'
         and (ch.config->'io'->>'driver' is distinct from 'rgb' or cmd.result->'applied'=output.value->'applied')
       order by cmd.result_at desc limit 1)
     else null end
  ) order by ch.id),'[]'::jsonb) into sources
  from(select chan.* from public.channels chan join public.devices device on device.id=chan.device_id
    where device.project_id=c.project_id and chan.id::text in(select value->>'channel_id' from jsonb_array_elements(elements)) order by chan.id limit 24)ch
  join public.devices dev on dev.id=ch.device_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc,e.id desc),'[]'::jsonb) into event_rows
    from(select ev.id,ev.device_id,ev.event_type,ev.severity,ev.title,ev.occurred_at,ev.acknowledged_at,jsonb_build_object('source',ev.detail->'source') as detail
      from public.events ev join public.devices dev on dev.id=ev.device_id where dev.project_id=c.project_id order by ev.occurred_at desc,ev.id desc limit 50)e;
  return jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'description',p.description),'dashboard',case when d.id is null then null else jsonb_build_object('id',d.id,'project_id',d.project_id,'widget_type',d.widget_type,'config',d.config,'revision',d.revision)end,
    'sources',sources,'events',event_rows,'can_arrange',c.can_arrange,'refreshed_at',now(),'limits',jsonb_build_object('samples_per_stream',100,'events',50));
end $function$
;
