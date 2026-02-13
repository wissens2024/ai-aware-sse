/**
 * PII 마스킹/익명화 (자리수 보존)
 * - 마스킹: 첫 글자 등만 노출, 나머지 * (길이 유지)
 * - 익명화: 같은 형식의 다른 값으로 치환
 */

export type MaskRules = Record<string, string>;
export type AnonymizeRules = Record<string, string>;

/**
 * 한국 주요 성씨 (~100개, 인구 99%+ 커버).
 */
const KR_SURNAMES = new Set([
  '김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권',
  '황','안','송','류','전','홍','고','문','양','손','배','백','허','유','남',
  '심','노','하','곽','성','차','주','우','구','민','진','지','엄','채','원',
  '천','방','공','현','감','변','여','추','도','소','석','선','설','마','길',
  '연','위','표','명','기','반','라','왕','금','옥','육','인','맹','제','탁',
  '봉','편','경','복','피','범','승','태','함','빈','상','모',
]);

/** 이름 뒤에 오는 호칭·직함 */
const NAME_SUFFIX_RE = /^\s*(?:님|씨|과장|대리|부장|사원|팀장|선생|교수|박사|의원|이사|차장|실장|원장|주임)/;
/** 이름 앞에 오는 레이블 */
const NAME_PREFIX_RE = /(?:이름|성명|담당자|작성자|신고자|수신자|발신자|보호자)\s*[:=]\s*$/;
/** 확실한 PII 패턴 */
const HARD_PII_RE = /01[0-9]-?[0-9]{3,4}-?[0-9]{4}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b[0-9]{6}-?[0-9]{7}\b/;

/**
 * 한글 이름 판별 — 문맥 필수.
 * 성씨 매칭만으로는 "현실적", "고객", "인형" 등 오탐 불가피.
 * 반드시: 레이블/호칭/근처PII 중 하나 충족해야 이름으로 판정.
 */
function isLikelyKoreanName(candidate: string, before: string, after: string, fullText: string, offset: number): boolean {
  if (/다$|요$/.test(candidate)) return false;
  if (NAME_PREFIX_RE.test(before)) return true;
  if (NAME_SUFFIX_RE.test(after)) return true;
  if (KR_SURNAMES.has(candidate[0])) {
    const nearby = fullText.slice(Math.max(0, offset - 100), Math.min(fullText.length, offset + candidate.length + 100));
    if (HARD_PII_RE.test(nearby)) return true;
  }
  return false;
}

// ---- 패턴 (백엔드 detector와 동기화)
const PATTERNS = {
  /** 한글 이름 2~4자 */
  krName: /[가-힣]{2,4}(?=\s|,|\.|$|[0-9]|\)|\]|"|'|입니다|이에요|이라고)/g,
  /** 생년월일 YYYY-MM-DD 또는 YYYYMMDD */
  birthdate: /\b(19|20)[0-9]{2}-?[0-9]{2}-?[0-9]{2}\b/g,
  /** 휴대전화 (010/011/016/017/018/019) */
  phone: /\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g,
  /** 일반전화 (지역번호) */
  landline: /\b0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}\b/g,
  /** 이메일 */
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /** 주민등록번호 (7번째 자리 1~4 검증) */
  rrn: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[- ]?[1-4]\d{6}\b/g,
  /** 운전면허번호 */
  driverLicense: /\b\d{2}-\d{2}-\d{6}-\d{2}\b/g,
  /** 사업자등록번호 */
  bizNo: /\b\d{3}-\d{2}-\d{5}\b/g,
  /** 카드번호 (4-4-4-4) */
  card: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
};

/** 마스킹: 자리수 보존 */
function maskNameFirstCharOnly(name: string): string {
  if (name.length <= 1) return name;
  return name[0] + '*'.repeat(name.length - 1);
}

function maskBirthdateYearOnly(m: string): string {
  const normalized = m.replace(/-/g, '');
  if (normalized.length === 8) return normalized.slice(0, 4) + '-**-**';
  return m.slice(0, 4) + '-**-**';
}

function maskPhoneMiddle(m: string): string {
  const digits = m.replace(/-/g, '');
  if (digits.length >= 11) return digits.slice(0, 3) + '-****-' + digits.slice(-4);
  return m.replace(/-/g, '').replace(/(\d{3})\d+(\d{4})/, '$1-****-$2');
}

function maskEmailDomainHidden(m: string): string {
  const at = m.indexOf('@');
  if (at === -1) return m;
  const local = m.slice(0, at);
  const domain = m.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const domainName = dot === -1 ? domain : domain.slice(0, dot);
  const tld = dot === -1 ? '' : domain.slice(dot);
  const maskedDomain = '*'.repeat(Math.max(1, domainName.length)) + (tld ? '.***' : '');
  return local + '@' + maskedDomain;
}

/** 주민등록번호: 앞 6자(생년월일)만 노출, 뒤 7자리 마스킹 */
function maskRrnBack(m: string): string {
  const digits = m.replace(/-/g, '');
  if (digits.length === 13) return digits.slice(0, 6) + '-*******';
  return m.slice(0, 6) + (m[6] === '-' ? '-' : '') + '*******';
}

/** 운전면허: 앞 4자리만 노출 */
function maskDriverLicense(m: string): string {
  return m.slice(0, 5) + '-**-******-**';
}

/** 사업자등록번호: 앞 3자리만 노출 */
function maskBizNo(m: string): string {
  return m.slice(0, 3) + '-**-*****';
}

/** 카드번호: 앞 4 + 뒤 4 노출 */
function maskCard(m: string): string {
  const digits = m.replace(/[- ]/g, '');
  if (digits.length >= 16) return digits.slice(0, 4) + '-****-****-' + digits.slice(-4);
  return m;
}

/** 일반전화: 가운데 마스킹 */
function maskLandline(m: string): string {
  const digits = m.replace(/[- ]/g, '');
  if (digits.length >= 9) return digits.slice(0, digits.length - 8) + '-****-' + digits.slice(-4);
  return m;
}

/** 적용할 마스킹 함수맵 */
const MASK_FNS: Record<string, (m: string) => string> = {
  first_char_only: maskNameFirstCharOnly,
  year_only: maskBirthdateYearOnly,
  middle_masked: maskPhoneMiddle,
  landline_masked: maskLandline,
  domain_hidden: maskEmailDomainHidden,
  back_masked: maskRrnBack,
  driver_license_masked: maskDriverLicense,
  biz_no_masked: maskBizNo,
  card_masked: maskCard,
};

/** 익명화: 같은 형식 대체값 (간단 버전) */
const ANON_NAMES = ['김철수', '이영희', '박민수', '정수진', '최동훈'];
const ANON_LOCAL = ['user', 'contact', 'admin', 'support', 'info'];

function anonymizeName(_m: string): string {
  return ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)];
}

function anonymizeBirthdate(_m: string): string {
  const y = 1970 + Math.floor(Math.random() * 40);
  const mo = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function anonymizePhone(_m: string): string {
  const mid = String(1000 + Math.floor(Math.random() * 9000));
  const last = String(1000 + Math.floor(Math.random() * 9000));
  return `010-${mid}-${last}`;
}

function anonymizeEmail(m: string): string {
  const local = ANON_LOCAL[Math.floor(Math.random() * ANON_LOCAL.length)];
  return local + '@***.***';
}

function anonymizeRrn(_m: string): string {
  const y = 1970 + Math.floor(Math.random() * 40);
  const mo = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  const rest = String(1000000 + Math.floor(Math.random() * 8999999));
  return `${y}${mo}${d}-${rest}`;
}

const ANON_FNS: Record<string, (m: string) => string> = {
  replace_with_random_name: anonymizeName,
  replace_with_random_date: anonymizeBirthdate,
  replace_with_random_phone: anonymizePhone,
  replace_with_random_local_domain: anonymizeEmail,
  replace_with_random_rrn: anonymizeRrn,
};

/** 규칙에 따라 한 종류씩 치환 */
function replaceByRule(text: string, pattern: RegExp, fn: (m: string) => string): string {
  return text.replace(pattern, fn);
}

/** 규칙 키 → 패턴 & 함수 매핑 헬퍼 */
function applyRuleIfPresent(
  out: string, rules: Record<string, string>, key: string,
  fnMap: Record<string, (m: string) => string>, pattern: RegExp,
): string {
  if (rules[key] && fnMap[rules[key]]) {
    out = replaceByRule(out, pattern, (m) => fnMap[rules[key]](m));
  }
  return out;
}

export function applyMask(text: string, rules: MaskRules | null | undefined): string {
  if (!rules || typeof rules !== 'object') return text;
  let out = text;
  // 이름 — 문맥 필수 필터
  if (rules.name && MASK_FNS[rules.name]) {
    const fn = MASK_FNS[rules.name];
    out = out.replace(PATTERNS.krName, (match, offset, full) => {
      const before = full.slice(Math.max(0, offset - 30), offset);
      const after = full.slice(offset + match.length, offset + match.length + 10);
      return isLikelyKoreanName(match, before, after, full, offset) ? fn(match) : match;
    });
  }
  out = applyRuleIfPresent(out, rules, 'birthdate', MASK_FNS, PATTERNS.birthdate);
  out = applyRuleIfPresent(out, rules, 'phone', MASK_FNS, PATTERNS.phone);
  out = applyRuleIfPresent(out, rules, 'landline', MASK_FNS, PATTERNS.landline);
  out = applyRuleIfPresent(out, rules, 'email', MASK_FNS, PATTERNS.email);
  out = applyRuleIfPresent(out, rules, 'rrn', MASK_FNS, PATTERNS.rrn);
  out = applyRuleIfPresent(out, rules, 'driver_license', MASK_FNS, PATTERNS.driverLicense);
  out = applyRuleIfPresent(out, rules, 'biz_no', MASK_FNS, PATTERNS.bizNo);
  out = applyRuleIfPresent(out, rules, 'card', MASK_FNS, PATTERNS.card);
  return out;
}

export function applyAnonymize(text: string, rules: AnonymizeRules | null | undefined): string {
  if (!rules || typeof rules !== 'object') return text;
  let out = text;
  // 이름 — 문맥 필수 필터
  if (rules.name && ANON_FNS[rules.name]) {
    const fn = ANON_FNS[rules.name];
    out = out.replace(PATTERNS.krName, (match, offset, full) => {
      const before = full.slice(Math.max(0, offset - 30), offset);
      const after = full.slice(offset + match.length, offset + match.length + 10);
      return isLikelyKoreanName(match, before, after, full, offset) ? fn(match) : match;
    });
  }
  out = applyRuleIfPresent(out, rules, 'birthdate', ANON_FNS, PATTERNS.birthdate);
  out = applyRuleIfPresent(out, rules, 'phone', ANON_FNS, PATTERNS.phone);
  out = applyRuleIfPresent(out, rules, 'email', ANON_FNS, PATTERNS.email);
  out = applyRuleIfPresent(out, rules, 'rrn', ANON_FNS, PATTERNS.rrn);
  return out;
}
