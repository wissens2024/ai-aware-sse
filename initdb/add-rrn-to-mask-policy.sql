-- 기존 PII Mask Partial 정책에 주민번호(rrn) 마스킹 규칙 추가
-- 이미 시드(03_seed)에 rrn이 포함된 버전을 넣었다면 불필요. 기존 DB만 업데이트할 때 실행.
-- DBeaver: sse_db 연결 후 실행. 또는 docker exec -i <container> psql -U sse_app -d sse_db < initdb/add-rrn-to-mask-policy.sql

SET search_path TO sse, public;

UPDATE policies
SET action_json = jsonb_set(
  COALESCE(action_json, '{}'::jsonb),
  '{mask,rrn}',
  '"back_masked"',
  true
)
WHERE name = 'PII Mask Partial'
  AND tenant_id = (SELECT tenant_id FROM tenants WHERE name = 'PoC Tenant' LIMIT 1);

-- 적용 여부 확인 (선택)
SELECT name, action_json->'mask' AS mask_rules
FROM policies
WHERE name = 'PII Mask Partial'
  AND tenant_id = (SELECT tenant_id FROM tenants WHERE name = 'PoC Tenant' LIMIT 1);
