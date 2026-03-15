'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useLanguage } from '@/components/LanguageProvider';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [authMode, setAuthMode] = useState('local');

  // Check SSO config + SSO error from callback
  useEffect(() => {
    const ssoError = searchParams.get('sso_error');
    if (ssoError) setError(`SSO: ${decodeURIComponent(ssoError)}`);

    fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1'}/auth/sso/config`,
    )
      .then((r) => r.json())
      .then((data) => {
        setSsoEnabled(data.enabled);
        setAuthMode(data.auth_mode);
      })
      .catch(() => {});
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSsoLogin = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';
    window.location.href = `${baseUrl}/auth/sso/authorize?redirect_after=/`;
  };

  const showLocalLogin = authMode === 'local' || authMode === 'both';
  const showSsoLogin = ssoEnabled;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/20">
            <svg width="40" height="40" viewBox="2 1 28 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2 L28 7 L28 15 C28 22 22.5 27.5 16 30 C9.5 27.5 4 22 4 15 L4 7 Z" fill="white" fillOpacity="0.25"/>
              <path d="M12.5 14.5 L12.5 12.5 C12.5 10.5 14 9 16 9 C18 9 19.5 10.5 19.5 12.5 L19.5 14.5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <rect x="10.5" y="14" width="11" height="8" rx="1.5" fill="white"/>
              <circle cx="16" cy="17.2" r="1.4" fill="#3b82f6"/>
              <rect x="15.3" y="18" width="1.4" height="2.2" rx="0.5" fill="#3b82f6"/>
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-800 dark:text-slate-100">
            AI-Aware SSE
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('auth.subtitle')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {/* SSO Login */}
          {showSsoLogin && (
            <>
              <button
                type="button"
                onClick={handleSsoLogin}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t('auth.ssoLogin')}
              </button>

              {showLocalLogin && (
                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
                  <span className="text-xs text-slate-400 dark:text-slate-500">OR</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
                </div>
              )}
            </>
          )}

          {/* Local Login */}
          {showLocalLogin && (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  {t('auth.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  placeholder="admin@example.com"
                />
              </div>

              <div className="mb-6">
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  {t('auth.password')}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('common.loading') : t('auth.login')}
              </button>
            </form>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
