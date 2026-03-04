/**
 * PII 마스킹/익명화 — dlp-core 래퍼
 *
 * Extension에서 사용하는 마스킹/익명화 API.
 * dlp-core의 detect() + mask() / anonymize()를 조합.
 *
 * 기존 applyMask(text, rules) / applyAnonymize(text, rules) 인터페이스 유지 (하위 호환).
 */

import {
  detect,
  mask as coreMask,
  anonymize as coreAnonymize,
  Finding,
  MaskConfig,
  AnonymizeConfig,
  DetectOptions,
} from 'dlp-core';

export type MaskRules = Record<string, string>;
export type AnonymizeRules = Record<string, string>;

/**
 * 기존 MaskRules (필드명 기반) → dlp-core MaskConfig (FindingType 기반) 변환
 */
function toMaskConfig(rules: MaskRules): MaskConfig {
  const fieldToType: Record<string, string> = {
    name: 'PII_NAME',
    birthdate: 'PII_DOB',
    phone: 'PII_MOBILE',
    landline: 'PII_PHONE',
    email: 'PII_EMAIL',
    rrn: 'PII_RRN',
    driver_license: 'PII_DRIVER',
    biz_no: 'PII_BIZNO',
    card: 'PII_CARD',
    account: 'PII_ACCOUNT',
    passport: 'PII_PASSPORT',
    address: 'PII_ADDRESS',
  };

  const maskMethodMap: Record<string, string> = {
    first_char_only: 'first_char_only',
    year_only: 'year_only',
    middle_masked: 'middle_masked',
    landline_masked: 'landline_masked',
    domain_hidden: 'domain_hidden',
    back_masked: 'back_masked',
    driver_license_masked: 'driver_masked',
    biz_no_masked: 'bizno_masked',
    card_masked: 'card_masked',
    account_masked: 'account_masked',
    passport_masked: 'passport_masked',
    address_masked: 'address_masked',
  };

  const config: MaskConfig = {};
  for (const [field, method] of Object.entries(rules)) {
    const type = fieldToType[field];
    const mappedMethod = maskMethodMap[method] ?? method;
    if (type) {
      config[type as keyof MaskConfig] = mappedMethod;
    }
  }
  return config;
}

/**
 * 기존 AnonymizeRules → dlp-core AnonymizeConfig 변환
 */
function toAnonymizeConfig(rules: AnonymizeRules): AnonymizeConfig {
  const fieldToType: Record<string, string> = {
    name: 'PII_NAME',
    birthdate: 'PII_DOB',
    phone: 'PII_MOBILE',
    email: 'PII_EMAIL',
    rrn: 'PII_RRN',
  };

  const anonMethodMap: Record<string, string> = {
    replace_with_random_name: 'random_name',
    replace_with_random_date: 'random_date',
    replace_with_random_phone: 'random_phone',
    replace_with_random_local_domain: 'random_email',
    replace_with_random_rrn: 'random_rrn',
  };

  const config: AnonymizeConfig = {};
  for (const [field, method] of Object.entries(rules)) {
    const type = fieldToType[field];
    const mappedMethod = anonMethodMap[method] ?? method;
    if (type) {
      config[type as keyof AnonymizeConfig] = mappedMethod;
    }
  }
  return config;
}

/**
 * 마스킹 적용 (하위 호환 API)
 *
 * @param text - 원본 텍스트
 * @param rules - 필드명 기반 마스킹 규칙 (기존 정책 action_json.mask)
 * @param detectOptions - 탐지 옵션 (프로파일 등)
 */
export function applyMask(
  text: string,
  rules: MaskRules | null | undefined,
  detectOptions?: DetectOptions,
): string {
  if (!rules || typeof rules !== 'object') return text;

  const findings = detect(text, detectOptions);
  const config = toMaskConfig(rules);
  const result = coreMask(text, findings, config);
  return result.maskedText;
}

/**
 * 익명화 적용 (하위 호환 API)
 */
export function applyAnonymize(
  text: string,
  rules: AnonymizeRules | null | undefined,
  detectOptions?: DetectOptions,
): string {
  if (!rules || typeof rules !== 'object') return text;

  const findings = detect(text, detectOptions);
  const config = toAnonymizeConfig(rules);
  const result = coreAnonymize(text, findings, config);
  return result.maskedText;
}

/**
 * 직접 Finding 기반 마스킹 (새 API)
 */
export function maskWithFindings(
  text: string,
  findings: Finding[],
  config?: MaskConfig,
): string {
  return coreMask(text, findings, config).maskedText;
}

// Re-export dlp-core types for extension usage
export { detect, Finding, MaskConfig, DetectOptions } from 'dlp-core';
