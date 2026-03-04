import { Injectable } from '@nestjs/common';
import {
  detect,
  Finding,
  DetectOptions,
  findingsToHits,
  DetectorHit,
  filterFindings,
  totalCount,
} from 'dlp-core';

export { DetectorHit } from 'dlp-core';

/**
 * 서버 측 탐지 서비스
 *
 * dlp-core의 detect()를 래핑하여 NestJS DI 컨텍스트에서 사용.
 * - 프로파일 기반 탐지 지원
 * - 세분화된 Finding (PII_RRN, PII_MOBILE 등) 반환
 * - 레거시 호환 DetectorHit[] 변환 제공
 */
@Injectable()
export class DetectorService {
  /**
   * 세분화된 탐지 — Finding[] 반환
   *
   * @param text - 탐지 대상 텍스트
   * @param options - 프로파일, 활성 타입 등
   */
  detectFindings(
    text: string | null | undefined,
    options?: DetectOptions,
  ): Finding[] {
    const input = text ?? '';
    if (!input.trim()) return [];
    return detect(input, options);
  }

  /**
   * 레거시 호환 — DetectorHit[] 반환
   * 기존 정책 엔진과 호환 (PII/Secrets/Code 집계 + 세분화 타입 포함)
   */
  run(text: string | null | undefined, options?: DetectOptions): DetectorHit[] {
    const findings = this.detectFindings(text, options);
    return findingsToHits(findings);
  }

  /**
   * PII 탐지 건수
   */
  countPII(text: string, options?: DetectOptions): number {
    const findings = this.detectFindings(text, options);
    return totalCount(filterFindings(findings, 'PII'));
  }

  /**
   * Secrets 탐지 건수
   */
  countSecrets(text: string, options?: DetectOptions): number {
    const findings = this.detectFindings(text, options);
    return totalCount(filterFindings(findings, 'SECRET'));
  }
}
