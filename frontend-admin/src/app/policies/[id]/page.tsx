'use client';

import { fetchApi, type PolicyItem } from '@/lib/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Save, ShieldOff } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

export default function PolicyEditPage() {
  const { t } = useLanguage();
  const params = useParams();
  const id = params.id as string;
  const [policy, setPolicy] = useState<PolicyItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ enabled: boolean; priority: number; scope: object; condition: object; action: object } | null>(null);
  const [scopeJsonText, setScopeJsonText] = useState('');
  const [conditionJsonText, setConditionJsonText] = useState('');
  const [actionJsonText, setActionJsonText] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchApi<PolicyItem>(`/admin/policies/${id}`)
      .then((p) => {
        setPolicy(p);
        setForm({ enabled: p.enabled, priority: p.priority, scope: p.scope, condition: p.condition, action: p.action });
        setScopeJsonText(JSON.stringify(p.scope, null, 2));
        setConditionJsonText(JSON.stringify(p.condition, null, 2));
        setActionJsonText(JSON.stringify(p.action, null, 2));
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const handleSave = async () => {
    if (!form || !id) return;
    let scope: object;
    let condition: object;
    let action: object;
    try {
      scope = JSON.parse(scopeJsonText) as object;
      condition = JSON.parse(conditionJsonText) as object;
      action = JSON.parse(actionJsonText) as object;
    } catch {
      setError('범위/조건/동작 중 JSON 형식이 올바르지 않은 필드가 있습니다.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await fetchApi<PolicyItem>(`/admin/policies/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, scope, condition, action }),
      });
      setPolicy(updated);
      setForm({ enabled: updated.enabled, priority: updated.priority, scope: updated.scope, condition: updated.condition, action: updated.action });
      setScopeJsonText(JSON.stringify(updated.scope, null, 2));
      setConditionJsonText(JSON.stringify(updated.condition, null, 2));
      setActionJsonText(JSON.stringify(updated.action, null, 2));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await fetchApi<PolicyItem>(`/admin/policies/${id}/disable`, {
        method: 'POST',
      });
      setPolicy(updated);
      setForm((prev) => (prev ? { ...prev, enabled: false, priority: updated.priority } : null));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !policy) {
    return (
      <div className="space-y-4">
        <Link
          href="/policies"
          className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')} Policies
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          {error}
        </div>
      </div>
    );
  }
  if (!policy) return <p className="text-slate-500 dark:text-slate-400">{t('common.loading')}</p>;

  return (
    <div className="space-y-6">
      <Link
        href="/policies"
        className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')} Policies
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{policy.name}</h1>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-900/20">
          {error}
        </div>
      )}
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {form && (
          <>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {t('policyEdit.priority')}
              </label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="mb-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="rounded border-slate-300 text-primary-500 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700"
              />
              <label htmlFor="enabled" className="text-sm">
                {t('policyEdit.enabled')}
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-white hover:bg-primary-600 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? t('common.loading') : t('common.save')}
              </button>
              {policy.enabled && (
                <button
                  onClick={handleDisable}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-500 disabled:opacity-50"
                >
                  <ShieldOff className="h-4 w-4" />
                  {t('policyEdit.disable')}
                </button>
              )}
            </div>
          </>
        )}
        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-600">
          <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{t('policyEdit.scope')} (JSON)</p>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            apps: Admin 앱 목록의 app_id(UUID). groups: 그룹 이름 배열. event_types: PASTE, SUBMIT 등 적용할 이벤트.
          </p>
          <textarea
            value={scopeJsonText}
            onChange={(e) => setScopeJsonText(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            spellCheck={false}
          />
          <p className="mt-4 mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{t('policyEdit.condition')} (JSON)</p>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            detector(CODE/PII/SECRETS), content length_gte, file ext 등. all/any 배열로 조건 정의.
          </p>
          <textarea
            value={conditionJsonText}
            onChange={(e) => setConditionJsonText(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            spellCheck={false}
          />
          <p className="mt-4 mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{t('policyEdit.action')} (JSON)</p>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            type(WARN/BLOCK/ALLOW 등), message(사용자에게 보여줄 메시지), require_reason 등.
          </p>
          <textarea
            value={actionJsonText}
            onChange={(e) => setActionJsonText(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
