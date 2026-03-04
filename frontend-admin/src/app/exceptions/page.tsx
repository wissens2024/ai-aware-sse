'use client';

import '@/lib/ag-grid-setup';
import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { fetchApi, type ExceptionListResponse, type ExceptionListItem } from '@/lib/api';
import { useLanguage } from '@/components/LanguageProvider';

export default function ExceptionsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<ExceptionListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (!activeOnly) params.set('active_only', 'false');
    fetchApi<ExceptionListResponse>(`/admin/exceptions?${params}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [activeOnly]);

  const revoke = async (exceptionId: string) => {
    setRevoking(exceptionId);
    try {
      await fetchApi(`/admin/exceptions/${exceptionId}`, { method: 'DELETE' });
      setData((prev) =>
        prev ? { ...prev, items: prev.items.filter((e) => e.exception_id !== exceptionId) } : null,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevoking(null);
    }
  };

  const columnDefs = useMemo<ColDef<ExceptionListItem>[]>(
    () => [
      { field: 'actor_email', headerName: t('exceptions.user'), flex: 1, minWidth: 180, valueGetter: (p) => p.data?.actor_email ?? '-' },
      { field: 'policy_name', headerName: t('exceptions.policy'), minWidth: 200 },
      {
        field: 'expires_at',
        headerName: t('exceptions.expires'),
        minWidth: 160,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : ''),
      },
      {
        field: 'created_at',
        headerName: t('exceptions.created'),
        minWidth: 160,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : ''),
      },
      {
        field: 'active',
        headerName: t('approvals.status'),
        width: 90,
        valueGetter: (p) => (p.data?.active ? t('exceptions.active') : t('exceptions.inactive')),
        cellClassRules: {
          'text-green-600 dark:text-green-400': (p) => !!p.data?.active,
          'text-slate-400': (p) => !p.data?.active,
        },
      },
      {
        headerName: '',
        width: 80,
        sortable: false,
        cellRenderer: (p: { data?: ExceptionListItem }) => {
          if (!p.data?.active) return null;
          return (
            <button
              type="button"
              onClick={() => revoke(p.data!.exception_id)}
              disabled={revoking === p.data!.exception_id}
              className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
            >
              {t('common.revoke')}
            </button>
          );
        },
      },
    ],
    [t],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true }),
    [],
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('exceptions.title')}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('exceptions.description')}</p>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => setActiveOnly(e.target.checked)}
          className="rounded border-slate-300 text-primary-500 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700"
        />
        <span className="text-sm">{t('exceptions.activeOnly')}</span>
      </label>
      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
        <AgGridReact<ExceptionListItem>
          theme="legacy"
          rowData={data?.items ?? []}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          domLayout="normal"
          suppressCellFocus
        />
      </div>
      {data?.items.length === 0 && (
        <p className="py-8 text-center text-slate-500 dark:text-slate-400">
          {activeOnly ? t('exceptions.noExceptions') : t('exceptions.noHistory')}
        </p>
      )}
    </div>
  );
}
