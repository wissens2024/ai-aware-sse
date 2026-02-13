'use client';

import { fetchApi, type ApprovalListItem } from '@/lib/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

const EXCEPTION_HOURS_OPTIONS = [
  { value: 24, labelKey: '24h' },
  { value: 168, labelKey: '7d' },
  { value: 720, labelKey: '30d' },
];

export default function ApprovalDetailPage() {
  const { t } = useLanguage();
  const params = useParams();
  const id = params.id as string;
  const [item, setItem] = useState<ApprovalListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [approvalKind, setApprovalKind] = useState<'one_time' | 'user_exception'>('one_time');
  const [exceptionHours, setExceptionHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchApi<ApprovalListItem>(`/admin/approvals/${id}`)
      .then(setItem)
      .catch((e) => setError(e.message));
  }, [id]);

  const decide = async (type: 'APPROVE' | 'REJECT') => {
    if (!id) return;
    setSubmitting(true);
    try {
      const body: {
        decision: {
          type: string;
          comment?: string;
          approval_kind?: 'one_time' | 'user_exception';
          exception_expires_in_hours?: number;
        };
      } = {
        decision: { type, comment: comment || undefined },
      };
      if (type === 'APPROVE') {
        body.decision.approval_kind = approvalKind;
        if (approvalKind === 'user_exception') body.decision.exception_expires_in_hours = exceptionHours;
      }
      await fetchApi(`/admin/approvals/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setItem((prev) => (prev ? { ...prev, status: type === 'APPROVE' ? 'APPROVED' : 'REJECTED' } : null));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !item) {
    return (
      <div className="space-y-4">
        <Link
          href="/approvals"
          className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')} Approvals
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          {error}
        </div>
      </div>
    );
  }
  if (!item) return <p className="text-slate-500 dark:text-slate-400">{t('common.loading')}</p>;

  const canDecide = item.status === 'PENDING';

  return (
    <div className="space-y-6">
      <Link
        href="/approvals"
        className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')} Approvals
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('approvalDetail.title')}</h1>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-900/20">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {item.block_reason && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <h2 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
              {t('approvalDetail.blockReason')}
            </h2>
            <p className="text-sm text-amber-900 dark:text-amber-100">{item.block_reason.explanation ?? '-'}</p>
            {item.block_reason.policy_name && (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                {t('approvalDetail.policyApplied')}: {item.block_reason.policy_name}
              </p>
            )}
          </div>
        )}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-700/50">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t('approvalDetail.requestReason')}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
            {item.request_reason || '(없음)'}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Case ID</dt>
          <dd className="font-mono">{item.case_id}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Event ID</dt>
          <dd>
            <Link
              href={`/events/${item.event_id}`}
              className="font-mono text-primary-600 hover:underline dark:text-primary-400"
            >
              {item.event_id.slice(0, 8)}...
            </Link>
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">Requested at</dt>
          <dd>{new Date(item.requested_at).toLocaleString('ko-KR')}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Requester</dt>
          <dd>{item.requested_by.email ?? '-'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Domain</dt>
          <dd>{item.app.domain ?? '-'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Risk score</dt>
          <dd>{item.summary.risk_score}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Detectors</dt>
          <dd>{item.summary.detectors.join(', ') || '-'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Status</dt>
          <dd>{item.status}</dd>
          {item.decision_payload?.approval_kind && (
            <>
              <dt className="text-slate-500 dark:text-slate-400">{t('approvalDetail.approvalKind')}</dt>
              <dd>
                {item.decision_payload.approval_kind === 'user_exception' ? t('approvalDetail.userException') : t('approvalDetail.oneTime')}
              </dd>
            </>
          )}
        </dl>

        {canDecide && (
          <>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {t('approvalDetail.decisionComment')}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                rows={2}
                placeholder="승인/거절 사유를 남기려면 입력"
              />
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t('approvalDetail.approvalScope')}
              </p>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="approvalKind"
                    checked={approvalKind === 'one_time'}
                    onChange={() => setApprovalKind('one_time')}
                    className="text-primary-500"
                  />
                  <span>{t('approvalDetail.oneTime')}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="approvalKind"
                    checked={approvalKind === 'user_exception'}
                    onChange={() => setApprovalKind('user_exception')}
                    className="text-primary-500"
                  />
                  <span>{t('approvalDetail.userException')}</span>
                </label>
              </div>
              {approvalKind === 'user_exception' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {t('approvalDetail.exceptionPeriod')}:
                  </span>
                  <select
                    value={exceptionHours}
                    onChange={(e) => setExceptionHours(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {EXCEPTION_HOURS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value <= 48 ? t('approvalDetail.hours', o.value) : t('approvalDetail.days', o.value / 24)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2 pt-2">
              <button
                onClick={() => decide('APPROVE')}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-500 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {t('common.approve')}
              </button>
              <button
                onClick={() => decide('REJECT')}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-500 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                {t('common.reject')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
