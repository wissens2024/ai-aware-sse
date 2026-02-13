-- initdb/03_seed.sql
-- PoC seed data for AI-Aware SSE MVP
-- Idempotent-ish (checks by names and unique constraints).
-- Requires schema already created (02_schema.sql).
\connect sse_db

SET search_path TO sse, public;

-- Run as sse_app (objects owned by sse_app already)
SET ROLE sse_app;

DO $$
DECLARE
  v_tenant_id uuid;
  v_app_chatgpt uuid;
  v_app_copilot uuid;
  v_app_gemini uuid;

  v_group_all uuid;
  v_group_dev uuid;
  v_group_fin uuid;
  v_group_approvers uuid;
BEGIN
  -- --------------------------
  -- Tenant
  -- --------------------------
  SELECT tenant_id INTO v_tenant_id
  FROM tenants
  WHERE name = 'PoC Tenant'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants(name) VALUES ('PoC Tenant')
    RETURNING tenant_id INTO v_tenant_id;
  END IF;

  -- --------------------------
  -- Groups
  -- --------------------------
  SELECT group_id INTO v_group_all
  FROM groups WHERE tenant_id=v_tenant_id AND name='AllEmployees' LIMIT 1;
  IF v_group_all IS NULL THEN
    INSERT INTO groups(tenant_id, name) VALUES (v_tenant_id, 'AllEmployees')
    RETURNING group_id INTO v_group_all;
  END IF;

  SELECT group_id INTO v_group_dev
  FROM groups WHERE tenant_id=v_tenant_id AND name='Dev' LIMIT 1;
  IF v_group_dev IS NULL THEN
    INSERT INTO groups(tenant_id, name) VALUES (v_tenant_id, 'Dev')
    RETURNING group_id INTO v_group_dev;
  END IF;

  SELECT group_id INTO v_group_fin
  FROM groups WHERE tenant_id=v_tenant_id AND name='Finance' LIMIT 1;
  IF v_group_fin IS NULL THEN
    INSERT INTO groups(tenant_id, name) VALUES (v_tenant_id, 'Finance')
    RETURNING group_id INTO v_group_fin;
  END IF;

  SELECT group_id INTO v_group_approvers
  FROM groups WHERE tenant_id=v_tenant_id AND name='SecurityApprovers' LIMIT 1;
  IF v_group_approvers IS NULL THEN
    INSERT INTO groups(tenant_id, name) VALUES (v_tenant_id, 'SecurityApprovers')
    RETURNING group_id INTO v_group_approvers;
  END IF;

  -- --------------------------
  -- Users (tenant-scoped) + group assignment
  -- --------------------------
  INSERT INTO users(tenant_id, email, display_name)
  VALUES
    (v_tenant_id, 'alice@example.com', 'Alice (Dev)'),
    (v_tenant_id, 'bob@example.com', 'Bob (Finance)'),
    (v_tenant_id, 'carol@example.com', 'Carol (Approver)')
  ON CONFLICT (tenant_id, email) DO UPDATE SET display_name = EXCLUDED.display_name;

  -- Assign: Alice -> AllEmployees, Dev; Bob -> AllEmployees, Finance; Carol -> AllEmployees, SecurityApprovers
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_all FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'alice@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_dev FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'alice@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_all FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'bob@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_fin FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'bob@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_all FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'carol@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_approvers FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'carol@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;

  -- --------------------------
  -- Apps + Domains
  -- --------------------------
  SELECT app_id INTO v_app_chatgpt
  FROM apps WHERE tenant_id=v_tenant_id AND name='ChatGPT Web' LIMIT 1;
  IF v_app_chatgpt IS NULL THEN
    INSERT INTO apps(tenant_id, name, enabled) VALUES (v_tenant_id, 'ChatGPT Web', true)
    RETURNING app_id INTO v_app_chatgpt;
  END IF;

  INSERT INTO app_domains(tenant_id, app_id, domain)
  VALUES (v_tenant_id, v_app_chatgpt, 'chatgpt.com')
  ON CONFLICT (tenant_id, domain) DO UPDATE SET app_id=EXCLUDED.app_id;

  SELECT app_id INTO v_app_copilot
  FROM apps WHERE tenant_id=v_tenant_id AND name='Microsoft Copilot Web' LIMIT 1;
  IF v_app_copilot IS NULL THEN
    INSERT INTO apps(tenant_id, name, enabled) VALUES (v_tenant_id, 'Microsoft Copilot Web', true)
    RETURNING app_id INTO v_app_copilot;
  END IF;

  INSERT INTO app_domains(tenant_id, app_id, domain)
  VALUES (v_tenant_id, v_app_copilot, 'copilot.microsoft.com')
  ON CONFLICT (tenant_id, domain) DO UPDATE SET app_id=EXCLUDED.app_id;

  SELECT app_id INTO v_app_gemini
  FROM apps WHERE tenant_id=v_tenant_id AND name='Google Gemini Web' LIMIT 1;
  IF v_app_gemini IS NULL THEN
    INSERT INTO apps(tenant_id, name, enabled) VALUES (v_tenant_id, 'Google Gemini Web', true)
    RETURNING app_id INTO v_app_gemini;
  END IF;

  INSERT INTO app_domains(tenant_id, app_id, domain)
  VALUES (v_tenant_id, v_app_gemini, 'gemini.google.com')
  ON CONFLICT (tenant_id, domain) DO UPDATE SET app_id=EXCLUDED.app_id;

  -- --------------------------
  -- Detector configs (very basic defaults)
  -- --------------------------
  INSERT INTO detector_configs(tenant_id, type, enabled, config_json, version)
  VALUES (
    v_tenant_id,
    'PII',
    true,
    jsonb_build_object(
      'email',  jsonb_build_object('enabled', true),
      'phone',  jsonb_build_object('enabled', true, 'country', 'KR'),
      'rrn_kr', jsonb_build_object('enabled', true),
      'thresholds', jsonb_build_object('block_count', 3, 'warn_count', 1)
    ),
    1
  )
  ON CONFLICT (tenant_id, type)
  DO UPDATE SET enabled=EXCLUDED.enabled, config_json=EXCLUDED.config_json, updated_at=now(), version=detector_configs.version+1;

  INSERT INTO detector_configs(tenant_id, type, enabled, config_json, version)
  VALUES (
    v_tenant_id,
    'SECRETS',
    true,
    jsonb_build_object(
      'generic_api_key', jsonb_build_object('enabled', true),
      'aws_access_key',  jsonb_build_object('enabled', true),
      'github_token',    jsonb_build_object('enabled', true),
      'thresholds', jsonb_build_object('block_count', 1)
    ),
    1
  )
  ON CONFLICT (tenant_id, type)
  DO UPDATE SET enabled=EXCLUDED.enabled, config_json=EXCLUDED.config_json, updated_at=now(), version=detector_configs.version+1;

  INSERT INTO detector_configs(tenant_id, type, enabled, config_json, version)
  VALUES (
    v_tenant_id,
    'CODE',
    true,
    jsonb_build_object(
      'enabled', true,
      'signals', jsonb_build_object('code_fence', true, 'keywords', true),
      'thresholds', jsonb_build_object('warn_chars', 1500)
    ),
    1
  )
  ON CONFLICT (tenant_id, type)
  DO UPDATE SET enabled=EXCLUDED.enabled, config_json=EXCLUDED.config_json, updated_at=now(), version=detector_configs.version+1;

  -- --------------------------
  -- Policy templates
  -- Notes:
  -- - policies.unique(tenant_id, name) exists, so ON CONFLICT is safe.
  -- - scope_json stores app ids as strings; your policy engine can interpret these ids.
  -- --------------------------

  -- (1) Block secrets on paste/submit to AI apps
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  )
  VALUES (
    v_tenant_id,
    'Block Secrets on AI Text',
    'If secrets detected, block AI paste/submit. Approval allowed.',
    10,
    true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object(
      'any', jsonb_build_array(
        jsonb_build_object('detector', 'SECRETS', 'op', 'count_gte', 'value', 1)
      )
    ),
    jsonb_build_object(
      'type', 'BLOCK',
      'message', '비밀키/토큰(Secrets) 포함 가능성이 있어 전송이 차단되었습니다.',
      'allow_approval_request', true
    ),
    1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json,
    condition_json=EXCLUDED.condition_json,
    action_json=EXCLUDED.action_json,
    updated_at=now(),
    version=policies.version+1;

  -- (2) Block if PII count >= 3 (paste/submit), allow approval
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  )
  VALUES (
    v_tenant_id,
    'Block High PII on AI Text',
    'If PII signals are high, block and allow approval.',
    20,
    true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object(
      'any', jsonb_build_array(
        jsonb_build_object('detector', 'PII', 'op', 'count_gte', 'value', 3)
      )
    ),
    jsonb_build_object(
      'type', 'BLOCK',
      'message', '개인정보(PII) 다량 포함 가능성이 있어 전송이 차단되었습니다.',
      'allow_approval_request', true
    ),
    1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json,
    condition_json=EXCLUDED.condition_json,
    action_json=EXCLUDED.action_json,
    updated_at=now(),
    version=policies.version+1;

  -- (3) Dev group: warn on large code-ish content at PASTE only (소스코드는 보통 붙여넣기이므로 PASTE 단계에서만 경고; SUBMIT은 통과)
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  )
  VALUES (
    v_tenant_id,
    'Dev Warn Large Code Paste',
    'Dev group: warn when pasting large code-like text. Paste only; submit is not re-checked for this.',
    50,
    true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text),
      'groups', jsonb_build_array('Dev'),
      'event_types', jsonb_build_array('PASTE')
    ),
    jsonb_build_object(
      'all', jsonb_build_array(
        jsonb_build_object('detector', 'CODE', 'op', 'score_gte', 'value', 1),
        jsonb_build_object('content', 'length_gte', 'value', 1500)
      )
    ),
    jsonb_build_object(
      'type', 'WARN',
      'message', '코드/대량 텍스트로 보입니다. 민감정보가 없는지 확인 후 진행하세요.',
      'require_reason', false
    ),
    1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json,
    condition_json=EXCLUDED.condition_json,
    action_json=EXCLUDED.action_json,
    updated_at=now(),
    version=policies.version+1;

  -- (3b) Dev group: warn when attaching source-code files (by extension; content not analyzed)
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  )
  VALUES (
    v_tenant_id,
    'Dev Warn Code File Upload',
    'Dev group: warn when uploading source code files (.js, .ts, .py, etc.).',
    45,
    true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text),
      'groups', jsonb_build_array('Dev'),
      'event_types', jsonb_build_array('UPLOAD_SELECT','UPLOAD_SUBMIT')
    ),
    jsonb_build_object(
      'any', jsonb_build_array(
        jsonb_build_object('file', 'ext_in', 'value', jsonb_build_array('js','ts','jsx','tsx','py','java','go','c','cpp','h','hpp','cs','rb','php','vue','svelte','mjs','cjs')))
    ),
    jsonb_build_object(
      'type', 'WARN',
      'message', '소스 코드 파일 첨부입니다. 민감정보·비공개 코드가 없는지 확인 후 진행하세요.',
      'require_reason', false
    ),
    1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json,
    condition_json=EXCLUDED.condition_json,
    action_json=EXCLUDED.action_json,
    updated_at=now(),
    version=policies.version+1;

  -- (4) Finance: require approval on spreadsheet-like uploads
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  )
  VALUES (
    v_tenant_id,
    'Finance Require Approval for CSV/XLSX Upload',
    'Finance group: require approval for csv/xlsx uploads to AI web.',
    30,
    true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text),
      'groups', jsonb_build_array('Finance'),
      'event_types', jsonb_build_array('UPLOAD_SELECT','UPLOAD_SUBMIT')
    ),
    jsonb_build_object(
      'any', jsonb_build_array(
        jsonb_build_object('file', 'ext_in', 'value', jsonb_build_array('csv','xlsx','xls')),
        jsonb_build_object('file', 'mime_in', 'value', jsonb_build_array(
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ))
      )
    ),
    jsonb_build_object(
      'type', 'REQUIRE_APPROVAL',
      'message', '스프레드시트 파일 업로드는 승인 후 허용됩니다.',
      'approver_group', 'SecurityApprovers',
      'ttl_seconds', 7200
    ),
    1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json,
    condition_json=EXCLUDED.condition_json,
    action_json=EXCLUDED.action_json,
    updated_at=now(),
    version=policies.version+1;

  -- (5) PII 일부 마스킹: PII 탐지 시 마스킹 규칙에 따라 치환 후 전송 (일부분 마스킹)
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  )
  VALUES (
    v_tenant_id,
    'PII Mask Partial',
    'PII 탐지 시 이름/생년월일/전화번호 등을 일부만 마스킹하여 전송.',
    55,
    false,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object(
      'all', jsonb_build_array(
        jsonb_build_object('detector', 'PII', 'op', 'count_gte', 'value', 1)
      )
    ),
    jsonb_build_object(
      'type', 'MASK',
      'message', '개인정보가 일부 마스킹되어 전송됩니다.',
      'require_reason', false,
      'mask', jsonb_build_object(
        'name', 'first_char_only',
        'birthdate', 'year_only',
        'phone', 'middle_masked',
        'email', 'domain_hidden',
        'rrn', 'back_masked'
      )
    ),
    1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json,
    condition_json=EXCLUDED.condition_json,
    action_json=EXCLUDED.action_json,
    updated_at=now(),
    version=policies.version+1;

  -- (6) PII 익명화: PII 탐지 시 다른 값으로 치환(형식 유지, 식별 제거). 마스킹과 선택 가능
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  )
  VALUES (
    v_tenant_id,
    'PII Anonymize Partial',
    'PII 탐지 시 이름/생년월일 등을 익명화(다른 값으로 치환)하여 전송. 형식 유지.',
    54,
    false,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object(
      'all', jsonb_build_array(
        jsonb_build_object('detector', 'PII', 'op', 'count_gte', 'value', 1)
      )
    ),
    jsonb_build_object(
      'type', 'ANONYMIZE',
      'message', '개인정보가 익명화되어 전송됩니다.',
      'require_reason', false,
      'anonymize', jsonb_build_object(
        'name', 'replace_with_random_name',
        'birthdate', 'replace_with_random_date',
        'phone', 'replace_with_random_phone',
        'email', 'replace_with_random_local_domain',
        'rrn', 'replace_with_random_rrn'
      )
    ),
    1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json,
    condition_json=EXCLUDED.condition_json,
    action_json=EXCLUDED.action_json,
    updated_at=now(),
    version=policies.version+1;

END $$;

RESET ROLE;
