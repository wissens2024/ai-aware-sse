'use client';

import { fetchApi, type DashboardSummary } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Activity,
  Shield,
  ShieldOff,
  AlertTriangle,
  EyeOff,
  Clock,
  Globe,
  Fingerprint,
} from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

export default function Home() {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString();
    const toStr = to.toISOString();
    fetchApi<DashboardSummary>(
      `/admin/dashboard/summary?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`,
    )
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [days]);

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 px-5 py-3.5 text-white shadow-lg shadow-blue-500/10">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -right-2 h-20 w-20 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{t('dashboard.title')}</h1>
            <p className="text-xs text-blue-100/80">
              AI 서비스 데이터 유출 방지 시스템 관리 콘솔
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
          {t('dashboard.period')}
        </h2>
        <div className="flex items-center gap-2">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-primary-500 text-white hover:bg-primary-600'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500'
              }`}
            >
              {t('dashboard.days', d)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          API 연결 오류: {error}
        </div>
      )}

      {summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-2.5 dark:bg-slate-700">
                  <Activity className="h-6 w-6 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {t('dashboard.eventsTotal')}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {summary.metrics.events_total}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-2.5 dark:bg-red-900/30">
                  <ShieldOff className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {t('dashboard.blocked')}
                  </p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {summary.metrics.blocked}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2.5 dark:bg-amber-900/30">
                  <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {t('dashboard.warned')}
                  </p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {summary.metrics.warned}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-2.5 dark:bg-slate-700">
                  <EyeOff className="h-6 w-6 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {t('dashboard.masked')}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {summary.metrics.masked}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary-100 p-2.5 dark:bg-primary-500/20">
                  <Clock className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {t('dashboard.approvalPending')}
                  </p>
                  <p className="text-2xl font-bold">
                    <Link
                      href="/approvals"
                      className="text-primary-600 hover:underline dark:text-primary-400"
                    >
                      {summary.metrics.approval_pending}
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <Globe className="h-5 w-5 text-slate-500" />
                {t('dashboard.topApps')}
              </h2>
              {summary.top_apps.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.noData')}</p>
              ) : (
                <ul className="space-y-3">
                  {summary.top_apps.map((a) => (
                    <li
                      key={a.domain}
                      className="flex items-center justify-between rounded-lg bg-slate-50 py-2 px-3 dark:bg-slate-700/50"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {a.domain}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {a.events}건
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <Fingerprint className="h-5 w-5 text-slate-500" />
                {t('dashboard.topDetectors')}
              </h2>
              {summary.top_detectors.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.noData')}</p>
              ) : (
                <ul className="space-y-3">
                  {summary.top_detectors.map((d) => (
                    <li
                      key={d.type}
                      className="flex items-center justify-between rounded-lg bg-slate-50 py-2 px-3 dark:bg-slate-700/50"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {d.type}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{d.hits}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
      )}
    </div>
  );
}
