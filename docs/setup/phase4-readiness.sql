-- RoboSynct Phase4C: catalog-only inspection in the existing Supabase SQL Editor.
-- Does not install, enable, share, mutate data, or certify real-account access.
BEGIN TRANSACTION READ ONLY;

WITH expected(table_name, rls_required) AS (VALUES
  ('rs_phase4_schema', false), ('rs_classrooms', true),
  ('rs_class_members', true), ('rs_class_shares', true), ('rs_cloud_rules', true)
)
SELECT e.table_name, c.oid IS NOT NULL AS object_present,
       e.rls_required, coalesce(c.relrowsecurity, false) AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = e.table_name) AS policy_count
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name
  AND c.relkind IN ('r', 'p')
ORDER BY e.table_name;

WITH expected(function_name) AS (VALUES
  ('rs_phase4_status'), ('rs_class_list'), ('rs_class_create'),
  ('rs_class_invite'), ('rs_class_join'), ('rs_class_members'),
  ('rs_class_set_member'), ('rs_class_share'), ('rs_class_projects'),
  ('rs_class_project'), ('rs_class_audit'), ('rs_cloud_rule_save'), ('rs_cloud_rule_list')
)
SELECT e.function_name, p.oid IS NOT NULL AS object_present,
       p.prosecdef AS security_definer, p.proconfig AS fixed_settings,
       CASE WHEN p.oid IS NOT NULL AND to_regrole('anon') IS NOT NULL
         THEN has_function_privilege('anon', p.oid, 'EXECUTE') END AS anonymous_execute
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = e.function_name
ORDER BY e.function_name;

SELECT EXISTS(SELECT 1 FROM pg_trigger
  WHERE tgname = 'rs_phase4_telemetry_event'
    AND tgrelid = to_regclass('public.telemetry') AND NOT tgisinternal)
  AS ingest_trigger_present;

ROLLBACK;
