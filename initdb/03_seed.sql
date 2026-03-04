-- initdb/03_seed.sql
-- Seed data for AI-Aware SSE
-- Idempotent (checks by names and unique constraints).
-- Requires schema already created (02_schema.sql).
\connect sse_db

SET search_path TO sse, public;
SET ROLE sse_app;

DO $$
DECLARE
  v_tenant_id uuid;
  v_app_chatgpt uuid;
  v_app_copilot uuid;
  v_app_gemini uuid;
  v_app_claude uuid;

  v_group_all uuid;
  v_group_dev uuid;
  v_group_fin uuid;
  v_group_hr uuid;
  v_group_approvers uuid;
BEGIN
  -- --------------------------
  -- Tenant
  -- --------------------------
  SELECT tenant_id INTO v_tenant_id
  FROM tenants WHERE name = 'PoC Tenant' LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants(name) VALUES ('PoC Tenant')
    RETURNING tenant_id INTO v_tenant_id;
  END IF;

  -- --------------------------
  -- Groups (프로파일 연결)
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

  SELECT group_id INTO v_group_hr
  FROM groups WHERE tenant_id=v_tenant_id AND name='HR' LIMIT 1;
  IF v_group_hr IS NULL THEN
    INSERT INTO groups(tenant_id, name) VALUES (v_tenant_id, 'HR')
    RETURNING group_id INTO v_group_hr;
  END IF;

  SELECT group_id INTO v_group_approvers
  FROM groups WHERE tenant_id=v_tenant_id AND name='SecurityApprovers' LIMIT 1;
  IF v_group_approvers IS NULL THEN
    INSERT INTO groups(tenant_id, name) VALUES (v_tenant_id, 'SecurityApprovers')
    RETURNING group_id INTO v_group_approvers;
  END IF;

  -- --------------------------
  -- Users + group assignment
  -- --------------------------
  INSERT INTO users(tenant_id, email, display_name)
  VALUES
    (v_tenant_id, 'alice@example.com', 'Alice (Dev)'),
    (v_tenant_id, 'bob@example.com', 'Bob (Finance)'),
    (v_tenant_id, 'carol@example.com', 'Carol (Approver)'),
    (v_tenant_id, 'dave@example.com', 'Dave (HR)')
  ON CONFLICT (tenant_id, email) DO UPDATE SET display_name = EXCLUDED.display_name;

  -- Alice → AllEmployees, Dev
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_all FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'alice@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_dev FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'alice@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;

  -- Bob → AllEmployees, Finance
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_all FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'bob@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_fin FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'bob@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;

  -- Carol → AllEmployees, SecurityApprovers
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_all FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'carol@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_approvers FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'carol@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;

  -- Dave → AllEmployees, HR
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_all FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'dave@example.com'
  ON CONFLICT (tenant_id, user_id, group_id) DO NOTHING;
  INSERT INTO user_groups(tenant_id, user_id, group_id)
  SELECT v_tenant_id, u.user_id, v_group_hr FROM users u WHERE u.tenant_id = v_tenant_id AND u.email = 'dave@example.com'
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

  SELECT app_id INTO v_app_claude
  FROM apps WHERE tenant_id=v_tenant_id AND name='Claude Web' LIMIT 1;
  IF v_app_claude IS NULL THEN
    INSERT INTO apps(tenant_id, name, enabled) VALUES (v_tenant_id, 'Claude Web', true)
    RETURNING app_id INTO v_app_claude;
  END IF;
  INSERT INTO app_domains(tenant_id, app_id, domain)
  VALUES (v_tenant_id, v_app_claude, 'claude.ai')
  ON CONFLICT (tenant_id, domain) DO UPDATE SET app_id=EXCLUDED.app_id;

  -- --------------------------
  -- Detector configs
  -- --------------------------
  INSERT INTO detector_configs(tenant_id, type, enabled, config_json, version)
  VALUES (
    v_tenant_id, 'PII', true,
    jsonb_build_object(
      'profile', 'DEFAULT',
      'enabled_types', jsonb_build_array(
        'PII_RRN','PII_MOBILE','PII_PHONE','PII_EMAIL','PII_PASSPORT',
        'PII_DRIVER','PII_BIZNO','PII_CARD','PII_ACCOUNT','PII_ADDRESS',
        'PII_NAME','PII_DOB'
      )
    ), 1
  )
  ON CONFLICT (tenant_id, type)
  DO UPDATE SET enabled=EXCLUDED.enabled, config_json=EXCLUDED.config_json, updated_at=now(), version=detector_configs.version+1;

  INSERT INTO detector_configs(tenant_id, type, enabled, config_json, version)
  VALUES (
    v_tenant_id, 'SECRETS', true,
    jsonb_build_object(
      'enabled_types', jsonb_build_array(
        'SECRET_BEARER','SECRET_API_KEY','SECRET_OPENAI','SECRET_AWS','SECRET_HEX_KEY'
      )
    ), 1
  )
  ON CONFLICT (tenant_id, type)
  DO UPDATE SET enabled=EXCLUDED.enabled, config_json=EXCLUDED.config_json, updated_at=now(), version=detector_configs.version+1;

  INSERT INTO detector_configs(tenant_id, type, enabled, config_json, version)
  VALUES (
    v_tenant_id, 'CODE', true,
    jsonb_build_object('enabled', true, 'warn_length', 1500), 1
  )
  ON CONFLICT (tenant_id, type)
  DO UPDATE SET enabled=EXCLUDED.enabled, config_json=EXCLUDED.config_json, updated_at=now(), version=detector_configs.version+1;

  -- ============================================================
  -- POLICIES — 탐지 ≠ 정책 분리 설계
  --
  -- 탐지(Detection)는 dlp-core가 전체 수행.
  -- 정책(Policy)은 탐지 결과의 조합에 따라 BLOCK/MASK/WARN 결정.
  --
  -- 세분화된 detector 타입 사용:
  --   PII_RRN, PII_MOBILE, PII_EMAIL, Secrets 등
  -- 레거시 집계 타입도 호환:
  --   PII (모든 PII_* 합산), Secrets (모든 SECRET_* 합산)
  -- ============================================================

  -- ────────────────────────────
  -- P1: Secrets → 즉시 BLOCK (최우선)
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'Block Secrets',
    'Secrets(API키/토큰/AWS키) 탐지 즉시 차단. 모든 그룹 적용.',
    10, true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object('any', jsonb_build_array(
      jsonb_build_object('detector', 'Secrets', 'op', 'count_gte', 'value', 1)
    )),
    jsonb_build_object(
      'type', 'BLOCK',
      'message', '비밀키/토큰(Secrets)이 포함되어 전송이 차단되었습니다.',
      'allow_approval_request', true
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- P2: 주민등록번호 → 즉시 BLOCK (1건이라도)
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'Block RRN',
    '주민등록번호 1건 이상 탐지 시 즉시 차단.',
    15, true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object('any', jsonb_build_array(
      jsonb_build_object('detector', 'PII_RRN', 'op', 'count_gte', 'value', 1)
    )),
    jsonb_build_object(
      'type', 'BLOCK',
      'message', '주민등록번호가 포함되어 전송이 차단되었습니다.',
      'allow_approval_request', true
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- P3: PII 다량 (3건+) → BLOCK
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'Block High PII',
    'PII 3건 이상 탐지 시 차단. 승인 요청 가능.',
    20, true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object('any', jsonb_build_array(
      jsonb_build_object('detector', 'PII', 'op', 'count_gte', 'value', 3)
    )),
    jsonb_build_object(
      'type', 'BLOCK',
      'message', '개인정보(PII) 다량 포함으로 전송이 차단되었습니다.',
      'allow_approval_request', true
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- P4: Finance 카드/계좌 → BLOCK (금융권 강화)
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'Finance Block Card/Account',
    '금융그룹: 카드번호 또는 계좌번호 1건 이상 시 차단.',
    18, true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('Finance'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object('any', jsonb_build_array(
      jsonb_build_object('detector', 'PII_CARD', 'op', 'count_gte', 'value', 1),
      jsonb_build_object('detector', 'PII_ACCOUNT', 'op', 'count_gte', 'value', 1)
    )),
    jsonb_build_object(
      'type', 'BLOCK',
      'message', '카드번호 또는 계좌번호가 포함되어 전송이 차단되었습니다.',
      'allow_approval_request', true
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- P5: Finance 스프레드시트 업로드 → 승인 필요
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'Finance Require Approval CSV/XLSX',
    '금융그룹: csv/xlsx 업로드 시 승인 필요.',
    30, true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('Finance'),
      'event_types', jsonb_build_array('UPLOAD_SELECT','UPLOAD_SUBMIT')
    ),
    jsonb_build_object('any', jsonb_build_array(
      jsonb_build_object('file', 'ext_in', 'value', jsonb_build_array('csv','xlsx','xls')),
      jsonb_build_object('file', 'mime_in', 'value', jsonb_build_array(
        'text/csv','application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ))
    )),
    jsonb_build_object(
      'type', 'REQUIRE_APPROVAL',
      'message', '스프레드시트 파일 업로드는 승인 후 허용됩니다.',
      'approver_group', 'SecurityApprovers',
      'ttl_seconds', 7200
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- P6: Dev 소스코드 대량 붙여넣기 → WARN
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'Dev Warn Large Code Paste',
    'Dev그룹: 1500자+ 코드 붙여넣기 시 경고.',
    50, true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('Dev'),
      'event_types', jsonb_build_array('PASTE')
    ),
    jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('detector', 'Code', 'op', 'score_gte', 'value', 1),
      jsonb_build_object('content', 'length_gte', 'value', 1500)
    )),
    jsonb_build_object(
      'type', 'WARN',
      'message', '코드/대량 텍스트로 보입니다. 민감정보가 없는지 확인 후 진행하세요.',
      'require_reason', false
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- P7: Dev 소스코드 파일 업로드 → WARN
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'Dev Warn Code File Upload',
    'Dev그룹: 소스코드 파일(.js/.ts/.py 등) 첨부 시 경고.',
    45, true,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('Dev'),
      'event_types', jsonb_build_array('UPLOAD_SELECT','UPLOAD_SUBMIT')
    ),
    jsonb_build_object('any', jsonb_build_array(
      jsonb_build_object('file', 'ext_in', 'value', jsonb_build_array(
        'js','ts','jsx','tsx','py','java','go','c','cpp','h','hpp','cs','rb','php','vue','svelte','mjs','cjs'
      ))
    )),
    jsonb_build_object(
      'type', 'WARN',
      'message', '소스 코드 파일 첨부입니다. 민감정보·비공개 코드가 없는지 확인 후 진행하세요.',
      'require_reason', false
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- P8: PII 소량 (1~2건) → MASK (마스킹 후 전송)
  --     Block 정책에 안 걸리는 소량 PII는 마스킹
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'PII Mask Partial',
    'PII 1건+ 탐지 시 마스킹하여 전송. 이름/전화/이메일/생년월일/카드/계좌/주소 등.',
    55, false,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('detector', 'PII', 'op', 'count_gte', 'value', 1)
    )),
    jsonb_build_object(
      'type', 'MASK',
      'message', '개인정보가 마스킹되어 전송됩니다.',
      'require_reason', false,
      'mask', jsonb_build_object(
        'name', 'first_char_only',
        'birthdate', 'year_only',
        'phone', 'middle_masked',
        'landline', 'landline_masked',
        'email', 'domain_hidden',
        'rrn', 'back_masked',
        'driver_license', 'driver_license_masked',
        'biz_no', 'biz_no_masked',
        'card', 'card_masked',
        'account', 'account_masked',
        'passport', 'passport_masked',
        'address', 'address_masked'
      )
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- P9: PII 익명화 (마스킹 대안)
  -- ────────────────────────────
  INSERT INTO policies(
    tenant_id, name, description, priority, enabled,
    scope_json, condition_json, action_json, version
  ) VALUES (
    v_tenant_id,
    'PII Anonymize Partial',
    'PII 탐지 시 다른 값으로 치환(형식 유지). 마스킹과 택 1.',
    54, false,
    jsonb_build_object(
      'apps', jsonb_build_array(v_app_chatgpt::text, v_app_copilot::text, v_app_gemini::text, v_app_claude::text),
      'groups', jsonb_build_array('AllEmployees'),
      'event_types', jsonb_build_array('PASTE','SUBMIT')
    ),
    jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('detector', 'PII', 'op', 'count_gte', 'value', 1)
    )),
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
    ), 1
  )
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description=EXCLUDED.description, priority=EXCLUDED.priority, enabled=EXCLUDED.enabled,
    scope_json=EXCLUDED.scope_json, condition_json=EXCLUDED.condition_json, action_json=EXCLUDED.action_json,
    updated_at=now(), version=policies.version+1;

  -- ────────────────────────────
  -- 기존 정책 이름 정리 (이름 변경된 정책 삭제)
  -- ────────────────────────────
  DELETE FROM policies WHERE tenant_id = v_tenant_id AND name IN (
    'Block Secrets on AI Text',
    'Block High PII on AI Text',
    'Finance Require Approval for CSV/XLSX Upload'
  );

END $$;

RESET ROLE;
