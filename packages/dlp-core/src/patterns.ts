/**
 * PII / Secrets / Code 탐지 패턴 정의
 *
 * 각 패턴은 regex + 문맥 검증 함수로 구성.
 * Backend와 Extension이 동일한 패턴을 사용하여 drift 방지.
 */

import { FindingType, FindingCategory, Confidence, MatchSpan } from './types';

// ──────────────────────────────────────────────
// 공통 데이터
// ──────────────────────────────────────────────

/** 한국 주요 성씨 (~100개, 인구 99%+ 커버) */
export const KR_SURNAMES = new Set([
  '김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권',
  '황','안','송','류','전','홍','고','문','양','손','배','백','허','유','남',
  '심','노','하','곽','성','차','주','우','구','민','진','지','엄','채','원',
  '천','방','공','현','감','변','여','추','도','소','석','선','설','마','길',
  '연','위','표','명','기','반','라','왕','금','옥','육','인','맹','제','탁',
  '봉','편','경','복','피','범','승','태','함','빈','상','모',
]);

/** 이름 뒤 호칭·직함 */
const NAME_SUFFIX_RE = /^\s*(?:님|씨|과장|대리|부장|사원|팀장|선생|교수|박사|의원|이사|차장|실장|원장|센터장|소장|주임|대표|사장|회장|위원|간사|기자|작가|감독|판사|검사|변호사|약사|간호사|기사|경위|경감|경정|서기|주무관)/;
/** 이름 앞 레이블 */
const NAME_PREFIX_RE = /(?:이름|성명|담당자|작성자|신고자|수신자|발신자|보호자|환자|고객명?|수취인|피보험자|계약자|대리인|의뢰인|신청인|대표자|연락처\s*담당|참석자)\s*[:=]\s*$/;
/** 확실한 PII 패턴 (이름 주변 100자 내 존재 시 이름 판정 보조) */
const HARD_PII_RE = /01[0-9]-?[0-9]{3,4}-?[0-9]{4}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b[0-9]{6}-?[0-9]{7}\b/;

// ──────────────────────────────────────────────
// 패턴 정의 인터페이스
// ──────────────────────────────────────────────

export interface PatternContext {
  before: string;   // 매칭 앞 30자
  after: string;    // 매칭 뒤 10자
  nearby: string;   // 매칭 ±100자
  fullText: string;
  offset: number;
}

export interface PatternDef {
  type: FindingType;
  category: FindingCategory;
  confidence: Confidence;
  /** 전역 regex (반드시 g 플래그) */
  regex: () => RegExp;
  /** 매칭 후 추가 검증 (false면 무시) */
  validate?: (match: string, ctx: PatternContext) => boolean;
  /** 매칭된 텍스트의 사전 마스킹 (maskedSample 생성) */
  preMask: (match: string) => string;
  /** 탐지 근거 라벨 */
  reasonLabel?: string;
}

// ──────────────────────────────────────────────
// 한글 이름 검증 함수
// ──────────────────────────────────────────────

function isLikelyKoreanName(candidate: string, ctx: PatternContext): { valid: boolean; reason: string } {
  // 동사 어미로 끝나는 경우 제외
  if (/[다요]$/.test(candidate)) return { valid: false, reason: '' };
  // 흔한 일반 명사 제외
  const COMMON_WORDS = new Set([
    '현실','고객','인형','방송','연산','고성','인사','주문','배송','설정',
    '변경','추가','삭제','수정','감사','성공','실장','원장','우리','방법',
    '현재','가능','경우','기본','반복','정보','문의','안내','확인','처리',
    '진행','완료','요청','승인','거절','취소','등록','검색','조회','사용',
  ]);
  if (COMMON_WORDS.has(candidate)) return { valid: false, reason: '' };

  // 조건 1: 앞에 레이블
  if (NAME_PREFIX_RE.test(ctx.before)) {
    return { valid: true, reason: 'name_label' };
  }
  // 조건 2: 뒤에 호칭
  if (NAME_SUFFIX_RE.test(ctx.after)) {
    return { valid: true, reason: 'name_honorific' };
  }
  // 조건 3: 성씨 + 근처 PII
  if (KR_SURNAMES.has(candidate[0]) && HARD_PII_RE.test(ctx.nearby)) {
    return { valid: true, reason: 'name_near_pii' };
  }
  return { valid: false, reason: '' };
}

// ──────────────────────────────────────────────
// PII 패턴 (12종)
// ──────────────────────────────────────────────

export const PII_PATTERNS: PatternDef[] = [
  // ① 주민등록번호
  {
    type: 'PII_RRN',
    category: 'PII',
    confidence: 'high',
    regex: () => /\b(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))[- ]?([1-4]\d{6})\b/g,
    preMask: (m) => {
      const digits = m.replace(/[- ]/g, '');
      return digits.slice(0, 6) + '-*******';
    },
  },

  // ② 휴대전화
  {
    type: 'PII_MOBILE',
    category: 'PII',
    confidence: 'high',
    regex: () => /\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g,
    preMask: (m) => {
      const d = m.replace(/[- ]/g, '');
      return d.slice(0, 3) + '-****-' + d.slice(-4);
    },
  },

  // ③ 일반전화 (지역번호, 01x 제외)
  {
    type: 'PII_PHONE',
    category: 'PII',
    confidence: 'medium',
    regex: () => /\b0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}\b/g,
    validate: (m) => !/^01[016789]/.test(m),
    preMask: (m) => {
      const d = m.replace(/[- ]/g, '');
      const areaLen = d.length - 8;
      return d.slice(0, Math.max(areaLen, 2)) + '-****-' + d.slice(-4);
    },
  },

  // ④ 이메일
  {
    type: 'PII_EMAIL',
    category: 'PII',
    confidence: 'high',
    regex: () => /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    preMask: (m) => {
      const at = m.indexOf('@');
      return m.slice(0, at) + '@***.***';
    },
  },

  // ⑤ 여권번호 (문맥 키워드 필요)
  {
    type: 'PII_PASSPORT',
    category: 'PII',
    confidence: 'medium',
    regex: () => /\b[MSROD]\d{8}\b/g,
    validate: (_m, ctx) => /여권|passport/i.test(ctx.fullText),
    preMask: (m) => m[0] + '********',
    reasonLabel: 'keyword_passport',
  },

  // ⑥ 운전면허번호
  {
    type: 'PII_DRIVER',
    category: 'PII',
    confidence: 'high',
    regex: () => /\b\d{2}-\d{2}-\d{6}-\d{2}\b/g,
    preMask: (m) => m.slice(0, 2) + '-**-******-**',
  },

  // ⑦ 사업자등록번호
  {
    type: 'PII_BIZNO',
    category: 'PII',
    confidence: 'high',
    regex: () => /\b\d{3}-\d{2}-\d{5}\b/g,
    preMask: (m) => m.slice(0, 3) + '-**-*****',
  },

  // ⑧ 카드번호 (4-4-4-4, Luhn 검증 포함)
  {
    type: 'PII_CARD',
    category: 'PII',
    confidence: 'high',
    regex: () => /\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b/g,
    validate: (m) => {
      const digits = m.replace(/[- ]/g, '');
      if (digits.length !== 16) return false;
      // Luhn check
      let sum = 0;
      for (let i = 0; i < 16; i++) {
        let d = parseInt(digits[i], 10);
        if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
      }
      return sum % 10 === 0;
    },
    preMask: (m) => {
      const d = m.replace(/[- ]/g, '');
      return d.slice(0, 4) + '-****-****-' + d.slice(-4);
    },
  },

  // ⑨ 계좌번호 (문맥 키워드 필요)
  {
    type: 'PII_ACCOUNT',
    category: 'PII',
    confidence: 'medium',
    regex: () => /\b\d{2,6}[- ]\d{2,6}[- ]\d{2,8}\b/g,
    validate: (_m, ctx) => /계좌|은행|송금|입금|이체|출금|국민|신한|우리|하나|농협|기업|SC|씨티/i.test(ctx.nearby),
    preMask: (m) => {
      const parts = m.split(/[- ]/);
      if (parts.length >= 3) return parts[0] + '-***-' + '*'.repeat(parts[parts.length - 1].length);
      return m.replace(/\d/g, '*');
    },
    reasonLabel: 'keyword_account',
  },

  // ⑩ 주소
  {
    type: 'PII_ADDRESS',
    category: 'PII',
    confidence: 'medium',
    regex: () => /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|특별자치도|도)?\s*[^\n,]{3,30}(?:구|군|시)\s*[^\n,]{2,20}(?:동|읍|면|로|길|번지|호|층)/g,
    preMask: (m) => {
      // 시도만 노출, 나머지 마스킹
      const cityMatch = m.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|특별자치도|도)?/);
      if (cityMatch) return cityMatch[0] + ' ***';
      return '*** ***';
    },
  },

  // ⑪ 한글 이름 (문맥 필수)
  {
    type: 'PII_NAME',
    category: 'PII',
    confidence: 'medium',
    regex: () => /[가-힣]{2,4}(?=\s|,|\.|$|[0-9]|\)|\]|"|'|입니다|이에요|이라고)/g,
    validate: (m, ctx) => isLikelyKoreanName(m, ctx).valid,
    preMask: (m) => m[0] + '*'.repeat(m.length - 1),
    reasonLabel: 'context_required',
  },

  // ⑫ 생년월일
  {
    type: 'PII_DOB',
    category: 'PII',
    confidence: 'medium',
    regex: () => /\b(19|20)\d{2}[.-](0[1-9]|1[0-2])[.-](0[1-9]|[12]\d|3[01])\b/g,
    preMask: (m) => {
      const parts = m.split(/[.-]/);
      return parts[0] + '-**-**';
    },
  },
];

// ──────────────────────────────────────────────
// Secrets 패턴
// ──────────────────────────────────────────────

export const SECRET_PATTERNS: PatternDef[] = [
  // Bearer 토큰
  {
    type: 'SECRET_BEARER',
    category: 'SECRET',
    confidence: 'high',
    regex: () => /\bBearer\s+[A-Za-z0-9_-]{20,}/gi,
    preMask: (m) => 'Bearer ***...',
  },

  // API key/secret = value
  {
    type: 'SECRET_API_KEY',
    category: 'SECRET',
    confidence: 'high',
    regex: () => /(?:api[_-]?key|apikey|secret|password|passwd|token|credentials?)\s*[:=]\s*['"]?[A-Za-z0-9_/+=-]{8,}['"]?/gi,
    preMask: () => '***=***',
  },

  // OpenAI/Anthropic 키
  {
    type: 'SECRET_OPENAI',
    category: 'SECRET',
    confidence: 'high',
    regex: () => /\b(?:sk-[A-Za-z0-9_-]{20,}|sk_proj-[A-Za-z0-9_-]+)\b/g,
    preMask: (m) => m.slice(0, 5) + '***...',
  },

  // AWS 액세스 키
  {
    type: 'SECRET_AWS',
    category: 'SECRET',
    confidence: 'high',
    regex: () => /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
    preMask: (m) => m.slice(0, 4) + '****************',
  },

  // 32~64자 hex 키 + "key" 문맥
  {
    type: 'SECRET_HEX_KEY',
    category: 'SECRET',
    confidence: 'medium',
    regex: () => /\b[a-fA-F0-9]{32,64}\b/g,
    validate: (_m, ctx) => /key|secret|token|hash|api/i.test(ctx.nearby),
    preMask: (m) => m.slice(0, 6) + '***...',
    reasonLabel: 'keyword_key',
  },
];

// ──────────────────────────────────────────────
// Code 패턴 (복합 휴리스틱)
// ──────────────────────────────────────────────

export const CODE_PATTERN: PatternDef = {
  type: 'CODE',
  category: 'CODE',
  confidence: 'low', // 실제 confidence는 detectCode에서 계산
  regex: () => /(?:)/g, // 사용하지 않음 — detectCode 별도 로직
  preMask: (m) => m,
};

/**
 * 코드 탐지 — 복합 휴리스틱 (regex 패턴이 아닌 점수 기반)
 * @returns 코드 신호 점수 (0~7)
 */
export function scoreCodeSignals(text: string): number {
  let score = 0;
  if (/```[\s\S]*?```/g.test(text)) score += 1;
  if (/^\s*(?:import|from\s+|require\s*\(|function\s+\w+|def\s+\w+|class\s+\w+)/m.test(text)) score += 1;
  if (/\bexport\s+(?:default|const|function|class)\b/.test(text)) score += 1;
  if (/\b(?:const|let|var)\s+\w+\s*=\s*(?:function|\([^)]*\)\s*=>|\w+\()/.test(text)) score += 1;
  if (/=>\s*\{|}\s*=>/.test(text)) score += 1;
  if (/\/\*[\s\S]*?\*\/|\/\/\s*.+/.test(text)) score += 1;
  const open = (text.match(/[{([]/g) ?? []).length;
  const close = (text.match(/[})\]]/g) ?? []).length;
  if (open >= 2 && close >= 2 && Math.abs(open - close) <= 2) score += 1;
  return score;
}

// ──────────────────────────────────────────────
// 모든 패턴 목록
// ──────────────────────────────────────────────

export const ALL_PATTERNS: PatternDef[] = [...PII_PATTERNS, ...SECRET_PATTERNS];
