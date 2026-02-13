/**
 * 빌드 시 esbuild define으로 주입되는 환경 변수.
 * --mode=production  → https://sse.aines.kr/api/v1
 * --mode=development → http://localhost:8080/api/v1  (기본값)
 */
declare const __EXT_ENV__: {
  MODE: string;
  API_BASE: string;
  DEVICE_TOKEN: string;
};

const DEFAULT_API_BASE = __EXT_ENV__.API_BASE;
export const DEFAULT_DEVICE_TOKEN = __EXT_ENV__.DEVICE_TOKEN;
export const BUILD_MODE = __EXT_ENV__.MODE;

function isContextInvalidated(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Extension context invalidated|context invalidated/i.test(msg);
}

export async function getApiBase(): Promise<string> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return DEFAULT_API_BASE;
    const v = await chrome.storage.local.get('apiBase');
    return (v.apiBase as string) || DEFAULT_API_BASE;
  } catch (err) {
    if (isContextInvalidated(err)) {
      console.warn('[AI-Aware SSE] 확장 컨텍스트가 무효화되었습니다. 이 페이지를 새로고침해 주세요.');
      return DEFAULT_API_BASE;
    }
    throw err;
  }
}

export async function getDeviceToken(): Promise<string> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return DEFAULT_DEVICE_TOKEN;
    const v = await chrome.storage.local.get('deviceToken');
    return (v.deviceToken as string) || DEFAULT_DEVICE_TOKEN;
  } catch (err) {
    if (isContextInvalidated(err)) return DEFAULT_DEVICE_TOKEN;
    throw err;
  }
}

/** 확장 Options에 설정한 "내 이메일" (정책·승인·예외에서 사용자 식별용) */
export async function getActorEmail(): Promise<string | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const v = await chrome.storage.local.get('actorEmail');
    const s = (v.actorEmail as string)?.trim();
    return s || null;
  } catch (err) {
    if (isContextInvalidated(err)) return null;
    throw err;
  }
}

/** 이메일 + 그룹(옵션). 그룹 미설정 시 빈 배열 → 백엔드에서 이메일로 DB 조회 */
export async function getActorHint(): Promise<{ email: string | null; groups: string[] }> {
  const email = await getActorEmail();
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return { email, groups: [] };
    const v = await chrome.storage.local.get('actorGroups');
    const g = (v.actorGroups as string)?.trim();
    const groups = g ? g.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return { email, groups };
  } catch (err) {
    if (isContextInvalidated(err)) return { email, groups: [] };
    throw err;
  }
}
