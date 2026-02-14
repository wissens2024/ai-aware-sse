/**
 * 산업별 탐지 프로파일
 *
 * 그룹/조직의 특성에 따라 어떤 PII를 탐지할지 결정.
 * 탐지만 담당 — BLOCK/MASK/WARN 결정은 정책 엔진이 담당.
 */

import {
  DetectionProfile,
  FindingType,
  PII_TYPES,
  SECRET_TYPES,
  CODE_TYPES,
} from './types';

const ALL_FINDING_TYPES: FindingType[] = [
  ...PII_TYPES,
  ...SECRET_TYPES,
  ...CODE_TYPES,
];

// ──────────────────────────────────────────────
// 기본 프로파일
// ──────────────────────────────────────────────

const DEFAULT_PROFILE: DetectionProfile = {
  name: 'DEFAULT',
  label: '일반 기업',
  description: '표준 기업 환경. PII 12종 + Secrets + Code 전체 탐지.',
  enabledTypes: ALL_FINDING_TYPES,
  defaultMaskConfig: {
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
  },
};

// ──────────────────────────────────────────────
// 금융권 프로파일
// ──────────────────────────────────────────────

const FINANCIAL_PROFILE: DetectionProfile = {
  name: 'FINANCIAL',
  label: '금융권',
  description: '금융기관/보험/증권. 카드번호·계좌번호·주민번호 탐지 강화. 모든 PII + Secrets 탐지.',
  enabledTypes: ALL_FINDING_TYPES,
  defaultMaskConfig: {
    ...DEFAULT_PROFILE.defaultMaskConfig,
    // 금융권은 계좌/카드를 반드시 마스킹
    PII_CARD: 'card_masked',
    PII_ACCOUNT: 'account_masked',
  },
};

// ──────────────────────────────────────────────
// 정부기관 프로파일
// ──────────────────────────────────────────────

const GOVERNMENT_PROFILE: DetectionProfile = {
  name: 'GOVERNMENT',
  label: '정부기관',
  description: '공공기관/지자체. 주민번호·주소·여권 등 신원정보 탐지 강화. 모든 PII + Secrets 탐지.',
  enabledTypes: ALL_FINDING_TYPES,
  defaultMaskConfig: {
    ...DEFAULT_PROFILE.defaultMaskConfig,
    PII_ADDRESS: 'address_masked',
    PII_PASSPORT: 'passport_masked',
  },
};

// ──────────────────────────────────────────────
// 국정원 지침 프로파일
// ──────────────────────────────────────────────

const NIS_PROFILE: DetectionProfile = {
  name: 'NIS',
  label: '국정원 지침',
  description: '국가정보원 보안 지침 준수. 모든 PII/Secrets/Code 전체 탐지, 가장 엄격한 기준.',
  enabledTypes: ALL_FINDING_TYPES,
  defaultMaskConfig: {
    ...DEFAULT_PROFILE.defaultMaskConfig,
  },
};

// ──────────────────────────────────────────────
// 의료 프로파일
// ──────────────────────────────────────────────

const HEALTHCARE_PROFILE: DetectionProfile = {
  name: 'HEALTHCARE',
  label: '의료기관',
  description: '병원/의원/약국. 환자 개인정보(이름·주민번호·연락처) 탐지 강화.',
  enabledTypes: ALL_FINDING_TYPES,
  defaultMaskConfig: {
    ...DEFAULT_PROFILE.defaultMaskConfig,
  },
};

// ──────────────────────────────────────────────
// 개발 전용 프로파일 (PII 탐지 최소, Secrets/Code 집중)
// ──────────────────────────────────────────────

const DEV_ONLY_PROFILE: DetectionProfile = {
  name: 'DEV_ONLY',
  label: '개발팀 전용',
  description: '개발 환경. Secrets/Code 탐지 집중, PII는 주민번호·카드번호만.',
  enabledTypes: [
    'PII_RRN',
    'PII_CARD',
    ...SECRET_TYPES,
    ...CODE_TYPES,
  ],
  defaultMaskConfig: {
    PII_RRN: 'back_masked',
    PII_CARD: 'card_masked',
  },
};

// ──────────────────────────────────────────────
// 프로파일 레지스트리
// ──────────────────────────────────────────────

const PROFILES: Record<string, DetectionProfile> = {
  DEFAULT: DEFAULT_PROFILE,
  FINANCIAL: FINANCIAL_PROFILE,
  GOVERNMENT: GOVERNMENT_PROFILE,
  NIS: NIS_PROFILE,
  HEALTHCARE: HEALTHCARE_PROFILE,
  DEV_ONLY: DEV_ONLY_PROFILE,
};

/**
 * 프로파일 조회
 * @param name - 프로파일 이름 (대소문자 무시)
 * @returns DetectionProfile | undefined
 */
export function getProfile(name: string): DetectionProfile | undefined {
  return PROFILES[name.toUpperCase()];
}

/**
 * 모든 프로파일 목록
 */
export function listProfiles(): DetectionProfile[] {
  return Object.values(PROFILES);
}

/**
 * 커스텀 프로파일 등록
 */
export function registerProfile(profile: DetectionProfile): void {
  PROFILES[profile.name.toUpperCase()] = profile;
}
