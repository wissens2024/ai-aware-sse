// ──────────────────────────────────────────────
// Finding Types — 세분화된 탐지 유형
// ──────────────────────────────────────────────

export const PII_TYPES = [
  'PII_RRN',       // 주민등록번호
  'PII_MOBILE',    // 휴대전화
  'PII_PHONE',     // 일반전화
  'PII_EMAIL',     // 이메일
  'PII_PASSPORT',  // 여권번호
  'PII_DRIVER',    // 운전면허
  'PII_BIZNO',     // 사업자등록번호
  'PII_CARD',      // 카드번호
  'PII_ACCOUNT',   // 계좌번호
  'PII_ADDRESS',   // 주소
  'PII_NAME',      // 한글 이름
  'PII_DOB',       // 생년월일
] as const;

export const SECRET_TYPES = [
  'SECRET_BEARER',   // Bearer 토큰
  'SECRET_API_KEY',  // API key/secret = value
  'SECRET_OPENAI',   // OpenAI/Anthropic 키 (sk-xxx)
  'SECRET_AWS',      // AWS 액세스 키 (AKIA...)
  'SECRET_HEX_KEY',  // 32~64자 hex + "key" 키워드
] as const;

export const CODE_TYPES = ['CODE'] as const;

export type PIIType = (typeof PII_TYPES)[number];
export type SecretType = (typeof SECRET_TYPES)[number];
export type CodeType = (typeof CODE_TYPES)[number];
export type FindingType = PIIType | SecretType | CodeType;

export type FindingCategory = 'PII' | 'SECRET' | 'CODE';

export type Confidence = 'low' | 'medium' | 'high';

// ──────────────────────────────────────────────
// Match & Finding
// ──────────────────────────────────────────────

export interface MatchSpan {
  start: number;
  end: number;
  text: string;         // 원본 매칭 텍스트
  maskedSample: string;  // 사전 마스킹된 샘플
  reason?: string;       // 탐지 근거 (e.g., "keyword_passport", "name_label")
}

export interface Finding {
  type: FindingType;
  category: FindingCategory;
  count: number;
  confidence: Confidence;
  matches: MatchSpan[];
}

// ──────────────────────────────────────────────
// Detection Options
// ──────────────────────────────────────────────

export interface DetectOptions {
  /** 프로파일 이름 (DEFAULT, FINANCIAL, GOVERNMENT, NIS) */
  profile?: string;
  /** 프로파일 무시하고 특정 타입만 실행 */
  enabledTypes?: FindingType[];
  /** 입력 텍스트 최대 길이 (기본 50,000) */
  maxLength?: number;
}

// ──────────────────────────────────────────────
// Masking
// ──────────────────────────────────────────────

/** 마스킹 설정: FindingType → 마스킹 방식 이름 */
export type MaskConfig = Partial<Record<FindingType, string>>;

export interface MaskResult {
  maskedText: string;
  appliedCount: number;
  appliedTypes: FindingType[];
}

/** 익명화 설정 */
export type AnonymizeConfig = Partial<Record<FindingType, string>>;

// ──────────────────────────────────────────────
// Detection Profile (산업별 탐지 프로파일)
// ──────────────────────────────────────────────

export interface DetectionProfile {
  name: string;
  label: string;
  description: string;
  /** 이 프로파일에서 활성화할 탐지 유형 */
  enabledTypes: FindingType[];
  /** 프로파일 기본 마스킹 설정 (정책 action에서 오버라이드 가능) */
  defaultMaskConfig: MaskConfig;
}

// ──────────────────────────────────────────────
// Legacy compatibility — 집계된 DetectorHit
// ──────────────────────────────────────────────

export interface DetectorHit {
  type: string;
  count: number;
  confidence?: number;
}

/** Finding[] → DetectorHit[] 변환 (기존 정책 엔진 호환) */
export function findingsToHits(findings: Finding[]): DetectorHit[] {
  const hits: DetectorHit[] = [];

  // 개별 타입별 hit
  for (const f of findings) {
    hits.push({
      type: f.type,
      count: f.count,
      confidence: confidenceToScore(f.confidence),
    });
  }

  // 카테고리 집계 (PII, SECRET, CODE)
  const categories: Record<string, { count: number; maxConf: number }> = {};
  for (const f of findings) {
    const cat = f.category;
    if (!categories[cat]) categories[cat] = { count: 0, maxConf: 0 };
    categories[cat].count += f.count;
    categories[cat].maxConf = Math.max(
      categories[cat].maxConf,
      confidenceToScore(f.confidence),
    );
  }
  // 레거시 호환: 'Secrets' (기존 대문자 S) 유지
  const catNameMap: Record<string, string> = { PII: 'PII', SECRET: 'Secrets', CODE: 'Code' };
  for (const [cat, agg] of Object.entries(categories)) {
    hits.push({
      type: catNameMap[cat] ?? cat,
      count: agg.count,
      confidence: agg.maxConf,
    });
  }

  return hits;
}

export function confidenceToScore(c: Confidence): number {
  switch (c) {
    case 'high': return 90;
    case 'medium': return 70;
    case 'low': return 40;
  }
}

export function scoreToConfidence(score: number): Confidence {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}
