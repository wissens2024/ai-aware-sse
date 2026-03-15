'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveTokens } from '@/components/AuthProvider';

/**
 * SSO callback page.
 * Backend redirects here with tokens in the hash fragment:
 *   /login/sso-callback#access_token=xxx&refresh_token=xxx&redirect_after=/
 */
export default function SsoCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.slice(1); // remove #
    if (!hash) {
      router.replace('/login?sso_error=no_token');
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const redirectAfter = params.get('redirect_after') || '/';

    if (!accessToken || !refreshToken) {
      router.replace('/login?sso_error=invalid_token');
      return;
    }

    // Store tokens
    saveTokens(accessToken, refreshToken);

    // Decode user from JWT payload (base64url)
    try {
      const payloadPart = accessToken.split('.')[1];
      const payload = JSON.parse(atob(payloadPart));
      const user = {
        user_id: payload.sub,
        email: payload.email,
        display_name: payload.display_name,
        role: payload.role,
        groups: payload.groups || [],
      };
      localStorage.setItem('sse_user', JSON.stringify(user));
    } catch {
      // If JWT decode fails, /auth/me will be called later
    }

    // Redirect to the target page (force full reload to pick up new auth state)
    // Validate: must be a relative path (prevent open redirect)
    const safeRedirect =
      redirectAfter && redirectAfter.startsWith('/') && !redirectAfter.startsWith('//')
        ? redirectAfter
        : '/';
    window.location.href = safeRedirect;
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 mx-auto animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          SSO 인증 처리 중...
        </p>
      </div>
    </div>
  );
}
