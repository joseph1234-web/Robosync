-- Deployed 2026-11-19. Preserve server-side command expiry and controller fencing.
-- The controller lease now ends no later than the approved command deadline.
-- Do not replay old/expired commands after reconnect.
CREATE OR REPLACE FUNCTION rs_io_private.request_command(p_id uuid, p_channel uuid, p_controller uuid, p_boot text, p_operation text, p_value jsonb, p_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d uuid;owner uuid;old rs_io_private.commands;lease rs_io_private.controller_leases;contact rs_io_private.device_state;
begin select device_id into d from public.channels where id=p_channel;owner:=rs_io_private.require_owner(d);if p_id is null or p_controller is null or p_boot is null or p_boot!~'^[a-f0-9]{16}$' or p_value is null or octet_length(p_value::text)>8192 or p_operation is null or p_deadline is null or p_deadline<=now() or p_deadline>now()+interval '10 seconds' then raise exception using errcode='22023',message='Invalid command or expired deadline';end if;
 select * into old from rs_io_private.commands where id=p_id;if found then if old.owner_id<>owner or old.channel_id<>p_channel or old.controller<>p_controller or old.boot<>p_boot or old.operation<>p_operation or old.requested<>p_value or old.deadline<>p_deadline then raise exception using errcode='PT409',message='Command identity conflicts';end if;return to_jsonb(old)-'owner_id';end if;
 if p_operation='schedule' and ((p_value->>'at')::timestamptz<now()+interval '5 seconds' or (p_value->>'at')::timestamptz>now()+interval '24 hours') then raise exception using errcode='22023',message='Schedule must start 5 seconds to 24 hours ahead';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_controller::text,3));if exists(select 1 from rs_io_private.controller_fences where controller=p_controller and owner_id=auth.uid()) then raise exception using errcode='PT409',message='Controller session closed';end if;select * into contact from rs_io_private.device_state where device_id=d for update;if contact.last_boot is distinct from p_boot then raise exception using errcode='PT409',message='Board restarted; refresh before controlling';end if;perform rs_io_private.check_output(d,p_channel,p_value,p_operation);if (select count(*) from rs_io_private.commands where device_id=d and accepted_at>now()-interval '1 minute')>=300 then raise exception using errcode='PT429',message='Command rate limited';end if;
 select * into lease from rs_io_private.controller_leases where device_id=d for update;if found and lease.until_at>now() and (lease.controller<>p_controller or lease.owner_id<>owner) then raise exception using errcode='PT409',message='Another controller holds the short output lease';end if;insert into rs_io_private.controller_leases values(d,p_controller,owner,least(p_deadline,now()+interval '10 seconds')) on conflict(device_id) do update set controller=excluded.controller,owner_id=excluded.owner_id,until_at=excluded.until_at;
 insert into rs_io_private.commands(id,device_id,channel_id,owner_id,controller,boot,operation,requested,deadline) values(p_id,d,p_channel,owner,p_controller,p_boot,p_operation,p_value,p_deadline) returning * into old;return to_jsonb(old)-'owner_id';end $function$
;
