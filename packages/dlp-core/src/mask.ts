/**
 * 마스킹 / 익명화 엔진
 *
 * Finding 기반으로 텍스트 내 매칭된 위치를 정확히 치환.
 * 뒤에서 앞으로 치환하여 offset 무결성 유지.
 */

import { Finding, FindingType, MaskConfig, MaskResult, AnonymizeConfig } from './types';

// ──────────────────────────────────────────────
// 마스킹 함수 (자리수 보존)
// ──────────────────────────────────────────────

const maskFunctions: Record<string, (m: string) => string> = {
  // 이름: 첫 글자만 노출
  first_char_only: (m) => m.length <= 1 ? m : m[0] + '*'.repeat(m.length - 1),

  // 생년월일: 연도만 노출
  year_only: (m) => {
    const parts = m.split(/[.-]/);
    return parts[0] + '-**-**';
  },

  // 휴대전화: 가운데 마스킹
  middle_masked: (m) => {
    const d = m.replace(/[- ]/g, '');
    if (d.length >= 11) return d.slice(0, 3) + '-****-' + d.slice(-4);
    return d.slice(0, 3) + '-****-' + d.slice(-4);
  },

  // 일반전화: 가운데 마스킹
  landline_masked: (m) => {
    const d = m.replace(/[- ]/g, '');
    const areaLen = Math.max(d.length - 8, 2);
    return d.slice(0, areaLen) + '-****-' + d.slice(-4);
  },

  // 이메일: 도메인 마스킹
  domain_hidden: (m) => {
    const at = m.indexOf('@');
    if (at === -1) return m;
    return m.slice(0, at) + '@***.***';
  },

  // 주민등록번호: 뒤 7자리 마스킹
  back_masked: (m) => {
    const d = m.replace(/[- ]/g, '');
    if (d.length === 13) return d.slice(0, 6) + '-*******';
    return m.slice(0, 6) + '-*******';
  },

  // 운전면허: 앞 2자리만 노출
  driver_masked: (m) => m.slice(0, 2) + '-**-******-**',

  // 사업자등록번호: 앞 3자리만 노출
  bizno_masked: (m) => m.slice(0, 3) + '-**-*****',

  // 카드번호: 앞 4 + 뒤 4 노출
  card_masked: (m) => {
    const d = m.replace(/[- ]/g, '');
    if (d.length >= 16) return d.slice(0, 4) + '-****-****-' + d.slice(-4);
    return m;
  },

  // 계좌번호: 앞 부분만 노출
  account_masked: (m) => {
    const parts = m.split(/[- ]/);
    if (parts.length >= 3) return parts[0] + '-***-' + '*'.repeat(parts[parts.length - 1].length);
    return m.replace(/\d/g, '*');
  },

  // 여권번호: 첫 글자만 노출
  passport_masked: (m) => m[0] + '********',

  // 주소: 시도만 노출
  address_masked: (m) => {
    const cityMatch = m.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|특별자치도|도)?/);
    if (cityMatch) return cityMatch[0] + ' ***';
    return '*** ***';
  },
};

/** FindingType → 기본 마스킹 방식 이름 */
const DEFAULT_MASK_METHODS: Record<FindingType, string> = {
  PII_NAME: 'first_char_only',
  PII_DOB: 'year_only',
  PII_MOBILE: 'middle_masked',
  PII_PHONE: 'landline_masked',
  PII_EMAIL: 'domain_hidden',
  PII_RRN: 'back_masked',
  PII_DRIVER: 'driver_masked',
  PII_BIZNO: 'bizno_masked',
  PII_CARD: 'card_masked',
  PII_ACCOUNT: 'account_masked',
  PII_PASSPORT: 'passport_masked',
  PII_ADDRESS: 'address_masked',
  SECRET_BEARER: 'first_char_only',
  SECRET_API_KEY: 'first_char_only',
  SECRET_OPENAI: 'first_char_only',
  SECRET_AWS: 'first_char_only',
  SECRET_HEX_KEY: 'first_char_only',
  CODE: 'first_char_only',
};

// ──────────────────────────────────────────────
// 익명화 함수
// ──────────────────────────────────────────────

const ANON_NAMES = ['김철수', '이영희', '박민수', '정수진', '최동훈', '강서연', '조현우', '윤지혜'];

const anonymizeFunctions: Record<string, (m: string) => string> = {
  random_name: () => ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)],

  random_date: () => {
    const y = 1970 + Math.floor(Math.random() * 40);
    const mo = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  },

  random_phone: () => {
    const mid = String(1000 + Math.floor(Math.random() * 9000));
    const last = String(1000 + Math.floor(Math.random() * 9000));
    return `010-${mid}-${last}`;
  },

  random_email: () => {
    const locals = ['user', 'contact', 'admin', 'support', 'info'];
    return locals[Math.floor(Math.random() * locals.length)] + '@***.***';
  },

  random_rrn: () => {
    const y = 70 + Math.floor(Math.random() * 30);
    const mo = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
    const rest = String(1000000 + Math.floor(Math.random() * 8999999));
    return `${y}${mo}${d}-${rest}`;
  },
};

// ──────────────────────────────────────────────
// 메인 마스킹 함수
// ──────────────────────────────────────────────

/**
 * Finding 기반 마스킹
 *
 * @param text - 원본 텍스트
 * @param findings - detect() 결과
 * @param config - 타입별 마스킹 방식 오버라이드 (없으면 기본값 사용)
 * @returns MaskResult
 */
export function mask(text: string, findings: Finding[], config?: MaskConfig): MaskResult {
  // 모든 매칭 span을 수집하고 offset 역순 정렬
  const spans: Array<{ start: number; end: number; type: FindingType; text: string }> = [];
  for (const f of findings) {
    for (const m of f.matches) {
      spans.push({ start: m.start, end: m.end, type: f.type, text: m.text });
    }
  }
  // 뒤에서 앞으로 치환 (offset 유지)
  spans.sort((a, b) => b.start - a.start);

  // 겹치는 span 제거 (뒤쪽 우선)
  const deduped: typeof spans = [];
  let lastStart = Infinity;
  for (const s of spans) {
    if (s.end <= lastStart) {
      deduped.push(s);
      lastStart = s.start;
    }
  }

  let result = text;
  const appliedTypes = new Set<FindingType>();
  let appliedCount = 0;

  for (const span of deduped) {
    const methodName = config?.[span.type] ?? DEFAULT_MASK_METHODS[span.type];
    const fn = maskFunctions[methodName];
    if (!fn) continue;

    const original = result.slice(span.start, span.end);
    const masked = fn(original);
    result = result.slice(0, span.start) + masked + result.slice(span.end);
    appliedTypes.add(span.type);
    appliedCount++;
  }

  return {
    maskedText: result,
    appliedCount,
    appliedTypes: Array.from(appliedTypes),
  };
}

/**
 * Finding 기반 익명화
 */
export function anonymize(text: string, findings: Finding[], config?: AnonymizeConfig): MaskResult {
  const spans: Array<{ start: number; end: number; type: FindingType; text: string }> = [];
  for (const f of findings) {
    for (const m of f.matches) {
      spans.push({ start: m.start, end: m.end, type: f.type, text: m.text });
    }
  }
  spans.sort((a, b) => b.start - a.start);

  const deduped: typeof spans = [];
  let lastStart = Infinity;
  for (const s of spans) {
    if (s.end <= lastStart) {
      deduped.push(s);
      lastStart = s.start;
    }
  }

  const anonMethodMap: Partial<Record<FindingType, string>> = {
    PII_NAME: 'random_name',
    PII_DOB: 'random_date',
    PII_MOBILE: 'random_phone',
    PII_PHONE: 'random_phone',
    PII_EMAIL: 'random_email',
    PII_RRN: 'random_rrn',
  };

  let result = text;
  const appliedTypes = new Set<FindingType>();
  let appliedCount = 0;

  for (const span of deduped) {
    const methodName = config?.[span.type] ?? anonMethodMap[span.type];
    if (!methodName) continue;
    const fn = anonymizeFunctions[methodName];
    if (!fn) continue;

    const original = result.slice(span.start, span.end);
    const replaced = fn(original);
    result = result.slice(0, span.start) + replaced + result.slice(span.end);
    appliedTypes.add(span.type);
    appliedCount++;
  }

  return {
    maskedText: result,
    appliedCount,
    appliedTypes: Array.from(appliedTypes),
  };
}

/** 마스킹 함수 조회 (외부에서 개별 사용 시) */
export function getMaskFunction(name: string): ((m: string) => string) | undefined {
  return maskFunctions[name];
}
