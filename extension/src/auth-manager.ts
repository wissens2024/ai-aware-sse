/**
 * JWT-based authentication manager for the extension.
 * Stores tokens in chrome.storage.local.
 * Falls back to legacy deviceToken if no JWT is available.
 */
import { getApiBase } from './config';

const STORAGE_KEYS = {
  accessToken: 'jwt_access_token',
  refreshToken: 'jwt_refresh_token',
  user: 'jwt_user',
} as const;

export interface AuthUser {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  groups: string[];
}

/** Get stored access token */
export async function getAccessToken(): Promise<string | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const v = await chrome.storage.local.get(STORAGE_KEYS.accessToken);
    return (v[STORAGE_KEYS.accessToken] as string) || null;
  } catch {
    return null;
  }
}

/** Get stored refresh token */
async function getRefreshToken(): Promise<string | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const v = await chrome.storage.local.get(STORAGE_KEYS.refreshToken);
    return (v[STORAGE_KEYS.refreshToken] as string) || null;
  } catch {
    return null;
  }
}

/** Get stored user info */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const v = await chrome.storage.local.get(STORAGE_KEYS.user);
    const raw = v[STORAGE_KEYS.user];
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/** Check if the user is authenticated with JWT */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return !!token;
}

/** Login with email/password */
export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const base = await getApiBase();
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Login failed (${res.status})`);
  }

  const data = await res.json();
  await saveTokens(data.access_token, data.refresh_token, data.user);
  return data.user;
}

/** Save tokens and user to chrome.storage.local */
async function saveTokens(
  accessToken: string,
  refreshToken: string,
  user: AuthUser,
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({
    [STORAGE_KEYS.accessToken]: accessToken,
    [STORAGE_KEYS.refreshToken]: refreshToken,
    [STORAGE_KEYS.user]: user,
  });
}

/** Try to refresh the access token */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  try {
    const base = await getApiBase();
    const res = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;
    const data = await res.json();
    await saveTokens(data.access_token, data.refresh_token, data.user);
    return true;
  } catch {
    return false;
  }
}

/** Get auth header value — JWT preferred, falls back to legacy token */
export async function getAuthToken(): Promise<string> {
  const jwt = await getAccessToken();
  if (jwt) return jwt;

  // Fallback to legacy device token
  const { getDeviceToken } = await import('./config');
  return getDeviceToken();
}

/** Logout — clear stored tokens */
export async function logout(): Promise<void> {
  // Fire-and-forget server logout
  const token = await getAccessToken();
  if (token) {
    const base = await getApiBase();
    fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {});
  }

  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.remove([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.user,
  ]);
}

/** Get SSO config from backend */
export async function getSsoConfig(): Promise<{
  enabled: boolean;
  auth_mode: string;
}> {
  try {
    const base = await getApiBase();
    const res = await fetch(`${base}/auth/sso/config`);
    if (!res.ok) return { enabled: false, auth_mode: 'local' };
    return res.json();
  } catch {
    return { enabled: false, auth_mode: 'local' };
  }
}
