/**
 * 텍스트 정규화 — 탐지 전 전처리
 * - Zero-width 문자 제거 (우회 방지)
 * - 유니코드 정규화
 */

/** Zero-width 문자 패턴 (ZWSP, ZWNJ, ZWJ, BOM, soft hyphen 등) */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u200E\u200F]/g;

/**
 * 탐지용 텍스트 정규화
 * - Zero-width 문자 제거
 * - 유니코드 NFC 정규화
 * - 최대 길이 제한
 */
export function normalize(text: string, maxLength = 50_000): string {
  let out = text;
  // Zero-width 문자 제거 (탐지 우회 방지)
  out = out.replace(ZERO_WIDTH_RE, '');
  // 유니코드 정규화 (NFC: 조합형 → 완성형)
  out = out.normalize('NFC');
  // 길이 제한
  if (out.length > maxLength) {
    out = out.slice(0, maxLength);
  }
  return out;
}
