/**
 * PII 마스킹/익명화 (자리수 보존)
 * - 마스킹: 첫 글자 등만 노출, 나머지 * (길이 유지)
 * - 익명화: 같은 형식의 다른 값으로 치환
 */

export type MaskRules = Record<string, string>;
export type AnonymizeRules = Record<string, string>;

/**
 * 한국 주요 성씨 (~100개, 인구 99%+ 커버).
 * 첫 글자가 이 Set에 포함된 2~4글자 한글만 이름 후보로 간주.
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
const NAME_SUFFIX_RE = /^(\s*)(님|씨|과장|대리|부장|사원|팀장|선생|교수|박사|의원|이사|차장|실장|원장|주임)/;

/** 한글 이름 후보가 실제 이름인지 판별 (성씨 사전 + 문맥) */
function isLikelyKoreanName(candidate: string, after: string): boolean {
  if (/다$|요$/.test(candidate)) return false;
  if (KR_SURNAMES.has(candidate[0])) return true;
  if (NAME_SUFFIX_RE.test(after)) return true;
  return false;
}

// ---- 패턴 (백엔드 detector와 유사)
const PATTERNS = {
  /** 한글 이름 2~4자 (뒤에 공백/쉼표/끝/숫자/괄호 등) */
  krName: /[가-힣]{2,4}(?=\s|,|\.|$|[0-9]|\)|\]|"|'|입니다|이에요|이라고)/g,
  /** 생년월일 YYYY-MM-DD 또는 YYYYMMDD */
  birthdate: /\b(19|20)[0-9]{2}-?[0-9]{2}-?[0-9]{2}\b/g,
  /** 한국 휴대폰 */
  phone: /01[0-9]-?[0-9]{3,4}-?[0-9]{4}/g,
  /** 이메일 */
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /** 주민등록번호 6자리-7자리 (하이픈 있거나 없음) */
  rrn: /\b[0-9]{6}-?[0-9]{7}\b/g,
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

/** 적용할 마스킹 함수맵 */
const MASK_FNS: Record<string, (m: string) => string> = {
  first_char_only: maskNameFirstCharOnly,
  year_only: maskBirthdateYearOnly,
  middle_masked: maskPhoneMiddle,
  domain_hidden: maskEmailDomainHidden,
  back_masked: maskRrnBack,
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

/** 규칙에 따라 한 종류씩 치환. rules 키는 name, birthdate, phone, email, rrn */
function replaceByRule(
  text: string,
  ruleKey: 'name' | 'birthdate' | 'phone' | 'email' | 'rrn',
  pattern: RegExp,
  fn: (m: string) => string,
): string {
  return text.replace(pattern, fn);
}

export function applyMask(text: string, rules: MaskRules | null | undefined): string {
  if (!rules || typeof rules !== 'object') return text;
  let out = text;
  if (rules.name && MASK_FNS[rules.name]) {
    const fn = MASK_FNS[rules.name];
    out = out.replace(PATTERNS.krName, (match, offset, full) => {
      const after = full.slice(offset + match.length, offset + match.length + 10);
      return isLikelyKoreanName(match, after) ? fn(match) : match;
    });
  }
  if (rules.birthdate && MASK_FNS[rules.birthdate]) {
    out = replaceByRule(out, 'birthdate', PATTERNS.birthdate, (m) => MASK_FNS[rules.birthdate!](m));
  }
  if (rules.phone && MASK_FNS[rules.phone]) {
    out = replaceByRule(out, 'phone', PATTERNS.phone, (m) => MASK_FNS[rules.phone!](m));
  }
  if (rules.email && MASK_FNS[rules.email]) {
    out = replaceByRule(out, 'email', PATTERNS.email, (m) => MASK_FNS[rules.email!](m));
  }
  if (rules.rrn && MASK_FNS[rules.rrn]) {
    out = replaceByRule(out, 'rrn', PATTERNS.rrn, (m) => MASK_FNS[rules.rrn!](m));
  }
  return out;
}

export function applyAnonymize(text: string, rules: AnonymizeRules | null | undefined): string {
  if (!rules || typeof rules !== 'object') return text;
  let out = text;
  if (rules.name && ANON_FNS[rules.name]) {
    const fn = ANON_FNS[rules.name];
    out = out.replace(PATTERNS.krName, (match, offset, full) => {
      const after = full.slice(offset + match.length, offset + match.length + 10);
      return isLikelyKoreanName(match, after) ? fn(match) : match;
    });
  }
  if (rules.birthdate && ANON_FNS[rules.birthdate]) {
    out = replaceByRule(out, 'birthdate', PATTERNS.birthdate, (m) => ANON_FNS[rules.birthdate!](m));
  }
  if (rules.phone && ANON_FNS[rules.phone]) {
    out = replaceByRule(out, 'phone', PATTERNS.phone, (m) => ANON_FNS[rules.phone!](m));
  }
  if (rules.email && ANON_FNS[rules.email]) {
    out = replaceByRule(out, 'email', PATTERNS.email, (m) => ANON_FNS[rules.email!](m));
  }
  if (rules.rrn && ANON_FNS[rules.rrn]) {
    out = replaceByRule(out, 'rrn', PATTERNS.rrn, (m) => ANON_FNS[rules.rrn!](m));
  }
  return out;
}
