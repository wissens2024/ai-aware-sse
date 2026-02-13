'use client';

import { fetchApi } from '@/lib/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Gavel, UserCheck, History } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

type EventDetail = {
  event: {
    event_id: string;
    time: string;
    app: { domain: string | null; url: string | null };
    actor: { email: string | null; groups: string[]; device_id: string | null };
    content_meta: { kind: string; length: number; sha256: string | null };
    content_sample_masked: string | null;
  };
  decision: {
    outcome: string;
    matched_policy: { policy_id: string; name: string; priority: number; version: number } | null;
    detector_hits: Array<{ type: string; count: number }>;
    explanation: { summary: string; safe_details: string[] };
  };
  approval_case: { case_id: string; status: string } | null;
  audit_trail: Array<{ time: string; actor: string; action: string }>;
};

export default function EventDetailPage() {
  const { t } = useLanguage();
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchApi<EventDetail>(`/admin/events/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')} Events
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          {error}
        </div>
      </div>
    );
  }
  if (!data) return <p className="text-slate-500 dark:text-slate-400">{t('common.loading')}</p>;

  const { event, decision, approval_case, audit_trail } = data;
  return (
    <div className="space-y-6">
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')} Events
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Event {event.event_id.slice(0, 8)}...
      </h1>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <FileText className="h-5 w-5" />
            이벤트
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">Time</dt>
            <dd>{new Date(event.time).toLocaleString('ko-KR')}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Domain</dt>
            <dd>{event.app.domain ?? '-'}</dd>
            <dt className="text-slate-500 dark:text-slate-400">User</dt>
            <dd>{event.actor.email ?? '-'}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Content</dt>
            <dd>{event.content_meta.kind}, {event.content_meta.length} chars</dd>
          </dl>
          {event.content_sample_masked && (
            <p className="mt-3 truncate rounded bg-slate-50 px-3 py-2 text-sm dark:bg-slate-700/50">
              {event.content_sample_masked}
            </p>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Gavel className="h-5 w-5" />
            결정
          </h2>
          <p>
            <span
              className={
                decision.outcome === 'BLOCK'
                  ? 'text-red-600 dark:text-red-400'
                  : decision.outcome === 'WARN'
                    ? 'text-amber-600 dark:text-amber-400'
                    : ''
              }
            >
              {decision.outcome}
            </span>
            {decision.matched_policy && ` — ${decision.matched_policy.name}`}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{decision.explanation.summary}</p>
          {decision.detector_hits.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {decision.detector_hits.map((h, i) => (
                <li key={i}>
                  {h.type}: {h.count}
                </li>
              ))}
            </ul>
          )}
        </section>
        {approval_case && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <UserCheck className="h-5 w-5" />
              승인 케이스
            </h2>
            <p>
              <Link
                href={`/approvals/${approval_case.case_id}`}
                className="text-primary-600 hover:underline dark:text-primary-400"
              >
                {approval_case.case_id.slice(0, 8)}...
              </Link>{' '}
              {approval_case.status}
            </p>
          </section>
        )}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <History className="h-5 w-5" />
            감사 로그
          </h2>
          <ul className="space-y-1 text-sm">
            {audit_trail.map((a, i) => (
              <li key={i}>
                {new Date(a.time).toLocaleString('ko-KR')} — {a.actor} — {a.action}
              </li>
            ))}
            {audit_trail.length === 0 && (
              <li className="text-slate-500 dark:text-slate-400">{t('common.none')}</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
