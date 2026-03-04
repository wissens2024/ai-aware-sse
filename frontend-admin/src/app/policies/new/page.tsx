'use client';

import { fetchApi, type PolicyItem } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

const ACTION_TYPES = ['ALLOW', 'WARN', 'BLOCK', 'REQUIRE_APPROVAL'] as const;

export default function NewPolicyPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    priority: 100,
    enabled: true,
    actionType: 'ALLOW' as (typeof ACTION_TYPES)[number],
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('정책 이름을 입력하세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const scope = { event_types: ['PASTE', 'SUBMIT'] };
      const condition = {};
      const action: { type: string; message?: string; allow_approval_request?: boolean } = {
        type: form.actionType,
      };
      if (form.message.trim()) action.message = form.message.trim();
      if (form.actionType === 'BLOCK' || form.actionType === 'REQUIRE_APPROVAL') {
        action.allow_approval_request = true;
      }
      const created = await fetchApi<PolicyItem>('/admin/policies', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority,
          enabled: form.enabled,
          scope,
          condition,
          action,
        }),
      });
      router.push(`/policies/${created.policy_id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/policies"
        className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')} Policies
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('policies.addPolicy')}</h1>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-900/20">
          {error}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('policies.name')} *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="예: Block Secrets on Paste"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Description
          </label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('policies.priority')}
          </label>
          <input
            type="number"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
            className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            className="rounded border-slate-300 text-primary-500 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700"
          />
          <label htmlFor="enabled">{t('policies.enabled')}</label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Action type
          </label>
          <select
            value={form.actionType}
            onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as (typeof ACTION_TYPES)[number] }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Message (optional)
          </label>
          <input
            type="text"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          적용 범위: PASTE/SUBMIT 이벤트. 조건(탐지기 등)은 API 또는 시드로만 설정 가능합니다.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-white hover:bg-primary-600 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {saving ? t('common.loading') : t('common.add')}
        </button>
      </form>
    </div>
  );
}
