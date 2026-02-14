/**
 * dlp-core — DLP 탐지/마스킹/프로파일 공유 라이브러리
 *
 * Backend와 Extension이 동일한 패턴·로직을 사용하여 drift 방지.
 *
 * @example
 * import { detect, mask, getProfile, findingsToHits } from 'dlp-core';
 *
 * const findings = detect(text, { profile: 'FINANCIAL' });
 * const result = mask(text, findings);
 * const hits = findingsToHits(findings); // legacy compatibility
 */

// Types
export type {
  FindingType,
  PIIType,
  SecretType,
  CodeType,
  FindingCategory,
  Confidence,
  MatchSpan,
  Finding,
  DetectOptions,
  MaskConfig,
  MaskResult,
  AnonymizeConfig,
  DetectionProfile,
  DetectorHit,
} from './types';

export {
  PII_TYPES,
  SECRET_TYPES,
  CODE_TYPES,
  findingsToHits,
  confidenceToScore,
  scoreToConfidence,
} from './types';

// Normalize
export { normalize } from './normalize';

// Detection
export { detect, filterFindings, totalCount, hasType } from './detect';

// Masking
export { mask, anonymize, getMaskFunction } from './mask';

// Profiles
export { getProfile, listProfiles, registerProfile } from './profiles';

// Patterns (for advanced usage / testing)
export { KR_SURNAMES, scoreCodeSignals, PII_PATTERNS, SECRET_PATTERNS } from './patterns';
