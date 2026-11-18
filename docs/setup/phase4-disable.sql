-- Reversible disable; retains all Phase 4 records and all existing platform data.
begin;
update public.rs_phase4_schema set enabled=false where version=1;
drop trigger if exists rs_phase4_telemetry_event on public.telemetry;
notify pgrst,'reload schema';
commit;
-- To re-enable after review: update public.rs_phase4_schema set enabled=true
-- where version=1; then rerun the complete v1 installer to restore its trigger.
