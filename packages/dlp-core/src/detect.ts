/**
 * 탐지 파이프라인
 *
 * normalize → detect(PII 12종 + Secrets + Code) → Finding[]
 *
 * Profile 기반: 프로파일이 지정되면 해당 프로파일의 enabledTypes만 실행
 */

import { normalize } from './normalize';
import { ALL_PATTERNS, scoreCodeSignals, PatternContext } from './patterns';
import { getProfile } from './profiles';
import {
  Finding,
  FindingType,
  DetectOptions,
  MatchSpan,
  Confidence,
} from './types';

/**
 * 메인 탐지 함수
 *
 * @param rawText - 원본 텍스트
 * @param options - 탐지 옵션 (프로파일, 활성 타입 등)
 * @returns Finding[] - 세분화된 탐지 결과
 */
export function detect(rawText: string, options: DetectOptions = {}): Finding[] {
  const maxLen = options.maxLength ?? 50_000;
  const text = normalize(rawText, maxLen);
  if (!text.trim()) return [];

  // 활성 타입 결정
  let enabledTypes: Set<FindingType> | null = null;
  if (options.enabledTypes) {
    enabledTypes = new Set(options.enabledTypes);
  } else if (options.profile) {
    const profile = getProfile(options.profile);
    if (profile) {
      enabledTypes = new Set(profile.enabledTypes);
    }
  }

  const findings: Finding[] = [];

  // PII + Secrets 패턴 매칭
  for (const pattern of ALL_PATTERNS) {
    if (enabledTypes && !enabledTypes.has(pattern.type)) continue;

    const regex = pattern.regex();
    const matches: MatchSpan[] = [];
    let m: RegExpExecArray | null;

    while ((m = regex.exec(text)) !== null) {
      const matchText = m[0];
      const offset = m.index;

      // 문맥 구성
      const ctx: PatternContext = {
        before: text.slice(Math.max(0, offset - 30), offset),
        after: text.slice(offset + matchText.length, Math.min(text.length, offset + matchText.length + 10)),
        nearby: text.slice(Math.max(0, offset - 100), Math.min(text.length, offset + matchText.length + 100)),
        fullText: text,
        offset,
      };

      // 추가 검증
      if (pattern.validate && !pattern.validate(matchText, ctx)) continue;

      matches.push({
        start: offset,
        end: offset + matchText.length,
        text: matchText,
        maskedSample: pattern.preMask(matchText),
        reason: pattern.reasonLabel,
      });
    }

    if (matches.length > 0) {
      findings.push({
        type: pattern.type,
        category: pattern.category,
        count: matches.length,
        confidence: pattern.confidence,
        matches,
      });
    }
  }

  // Code 탐지
  if (!enabledTypes || enabledTypes.has('CODE')) {
    const codeScore = scoreCodeSignals(text);
    if (codeScore > 0) {
      let confidence: Confidence = 'low';
      if (codeScore >= 4) confidence = 'high';
      else if (codeScore >= 2) confidence = 'medium';

      findings.push({
        type: 'CODE',
        category: 'CODE',
        count: codeScore,
        confidence,
        matches: [{
          start: 0,
          end: Math.min(text.length, 200),
          text: text.slice(0, 200),
          maskedSample: '[code detected]',
          reason: `signals=${codeScore}`,
        }],
      });
    }
  }

  return findings;
}

/**
 * 탐지 결과에서 특정 카테고리만 필터
 */
export function filterFindings(findings: Finding[], category: 'PII' | 'SECRET' | 'CODE'): Finding[] {
  return findings.filter((f) => f.category === category);
}

/**
 * 탐지 결과 전체 건수 합산
 */
export function totalCount(findings: Finding[]): number {
  return findings.reduce((sum, f) => sum + f.count, 0);
}

/**
 * 탐지 결과에 특정 타입 포함 여부
 */
export function hasType(findings: Finding[], type: FindingType): boolean {
  return findings.some((f) => f.type === type && f.count > 0);
}
