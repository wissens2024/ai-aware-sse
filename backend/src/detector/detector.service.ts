import { Injectable } from '@nestjs/common';

export type DetectorHit = { type: string; count: number; confidence?: number };

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
const NAME_SUFFIX_RE = /^\s*(?:님|씨|과장|대리|부장|사원|팀장|선생|교수|박사|의원|이사|차장|실장|원장|센터장|소장|주임)/;
/** 이름 앞에 오는 레이블 */
const NAME_PREFIX_RE = /(?:이름|성명|담당자|작성자|신고자|수신자|발신자|보호자)\s*[:=]\s*$/;

/** 확실한 PII 패턴 (이름 근처에 있으면 이름일 가능성 높음) */
const HARD_PII_RE = /01[0-9]-?[0-9]{3,4}-?[0-9]{4}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b[0-9]{6}-?[0-9]{7}\b/;

/** 서버 측 규칙 기반 탐지 (PII / Secrets / Code). content_sample_masked 또는 텍스트에 대해 실행 */
@Injectable()
export class DetectorService {
  /** 텍스트에서 PII/Secrets/Code 패턴 탐지. local_detectors와 동일한 형식 반환 */
  run(text: string | null | undefined): DetectorHit[] {
    const input = (text ?? '').slice(0, 50_000);
    if (!input.trim()) return [];

    const hits: DetectorHit[] = [];
    const pii = this.detectPII(input);
    if (pii.count > 0) hits.push(pii);
    const secrets = this.detectSecrets(input);
    if (secrets.count > 0) hits.push(secrets);
    const code = this.detectCode(input);
    if (code.count > 0) hits.push(code);

    return hits;
  }

  /**
   * 한글 이름 판별 — 문맥 필수.
   * 성씨 매칭만으로는 "현실적", "고객", "인형" 등 일반 단어를 걸러낼 수 없음.
   * 반드시 다음 중 하나를 충족해야 이름으로 판정:
   *  1) 앞에 "이름:", "담당자:" 등 레이블
   *  2) 뒤에 "님", "씨", "과장" 등 호칭
   *  3) 근처(±100자)에 확실한 PII(전화번호/이메일/주민번호)가 존재 + 성씨로 시작
   */
  private isLikelyKoreanName(candidate: string, before: string, after: string, nearbyText: string): boolean {
    if (/다$|요$/.test(candidate)) return false;
    // 조건 1: 앞에 레이블
    if (NAME_PREFIX_RE.test(before)) return true;
    // 조건 2: 뒤에 호칭
    if (NAME_SUFFIX_RE.test(after)) return true;
    // 조건 3: 성씨 + 근처에 확실한 PII 존재
    if (KR_SURNAMES.has(candidate[0]) && HARD_PII_RE.test(nearbyText)) return true;
    return false;
  }

  private detectPII(text: string): DetectorHit {
    let count = 0;
    // 이메일
    const email = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    count += (text.match(email) ?? []).length;
    // 한국 휴대폰 (010-xxxx-xxxx 등)
    const krPhone = /01[0-9]-?[0-9]{3,4}-?[0-9]{4}/g;
    count += (text.match(krPhone) ?? []).length;
    // 한글 이름 (2~4글자) — 문맥 필수: 레이블/호칭/근처PII 없으면 무시
    const krNameRe = /[가-힣]{2,4}(?=\s|,|\.|$|[0-9]|\)|\]|"|'|입니다|이에요|이라고)/g;
    let m: RegExpExecArray | null;
    while ((m = krNameRe.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 30), m.index);
      const after = text.slice(m.index + m[0].length, Math.min(text.length, m.index + m[0].length + 10));
      const nearbyText = text.slice(Math.max(0, m.index - 100), Math.min(text.length, m.index + m[0].length + 100));
      if (this.isLikelyKoreanName(m[0], before, after, nearbyText)) count++;
    }
    // 주민등록번호 형식 (6-7자리, 마스킹된 것 포함)
    const ssn = /\b[0-9]{6}-?[0-9Xx*]{7}\b/g;
    count += (text.match(ssn) ?? []).length;
    // 카드 번호 유사 (4-4-4-4 또는 16자리)
    const card = /\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b/g;
    count += (text.match(card) ?? []).length;
    return { type: 'PII', count, confidence: Math.min(100, count * 30) };
  }

  private detectSecrets(text: string): DetectorHit {
    let count = 0;
    // Bearer 토큰
    if (/bearer\s+[a-zA-Z0-9_-]+/i.test(text)) count += 1;
    // API key / secret = value (key=value 또는 key is value)
    if (
      /(?:api[_-]?key|apikey|secret|password|passwd|token)\s*[:=]\s*['"]?[a-zA-Z0-9_-]{8,}/i.test(
        text,
      )
    )
      count += 1;
    // "API key is sk-xxx", "secret: sk-xxx" 등 (is/:/= 뒤에 키 형태)
    if (
      /(?:api\s*key|apikey|secret|token)\s*(?:is|[:=])\s*['"]?[a-zA-Z0-9_-]{8,}/i.test(
        text,
      )
    )
      count += 1;
    // OpenAI/Anthropic 스타일 sk-xxx, sk_proj-xxx
    if (/\b(?:sk-[a-zA-Z0-9_-]{8,}|sk_proj-[a-zA-Z0-9_-]+)\b/.test(text))
      count += 1;
    // AWS 등 키 패턴
    if (/(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/.test(text)) count += 1;
    // 일반 시크릿 키 유사 (32자 hex 등)
    const hexKey = /\b[a-fA-F0-9]{32,64}\b/g;
    const hexMatches = text.match(hexKey) ?? [];
    if (hexMatches.length > 0 && text.toLowerCase().includes('key'))
      count += Math.min(hexMatches.length, 3);
    return {
      type: 'Secrets',
      count: Math.min(count, 10),
      confidence: Math.min(100, count * 25),
    };
  }

  private detectCode(text: string): DetectorHit {
    let count = 0;
    // 코드 블록 마커
    if (/```[\s\S]*?```/g.test(text)) count += 1;
    // 전통적 키워드 (줄 시작)
    if (
      /^\s*(?:import|from\s+|require\s*\(|function\s+\w+|def\s+\w+|class\s+\w+)/m.test(
        text,
      )
    )
      count += 1;
    // JS/TS: export default, const/let/var 선언, 화살표 함수, 주석
    if (/\bexport\s+(?:default|const|function|class)\b/.test(text)) count += 1;
    if (
      /\b(?:const|let|var)\s+\w+\s*=\s*(?:function|\([^)]*\)\s*=>|\w+\()/.test(
        text,
      )
    )
      count += 1;
    if (/=>\s*\{|}\s*=>/.test(text)) count += 1;
    if (/\/\*[\s\S]*?\*\/|\/\/\s*.+/.test(text)) count += 1;
    // 괄호 밸런스가 코드처럼 보이는 경우 (간단 휴리스틱)
    const open = (text.match(/[{([]/g) ?? []).length;
    const close = (text.match(/[})\]]/g) ?? []).length;
    if (open >= 2 && close >= 2 && Math.abs(open - close) <= 2) count += 1;
    return {
      type: 'Code',
      count: Math.min(count, 5),
      confidence: Math.min(100, count * 30),
    };
  }
}
