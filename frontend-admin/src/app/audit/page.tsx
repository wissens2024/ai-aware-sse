'use client';

import '@/lib/ag-grid-setup';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { fetchApi, type AuditListResponse, type AuditListItem } from '@/lib/api';
import { useLanguage } from '@/components/LanguageProvider';

export default function AuditPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<AuditListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString().slice(0, 16);
  });

  const load = useCallback(() => {
    const fromDate = new Date(from).toISOString();
    const toEnd = new Date(to);
    toEnd.setSeconds(59, 999);
    const toDate = toEnd.toISOString();
    fetchApi<AuditListResponse>(
      `/admin/audit?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&limit=100`,
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const columnDefs = useMemo<ColDef<AuditListItem>[]>(
    () => [
      {
        field: 'time',
        headerName: t('audit.time'),
        flex: 1,
        minWidth: 160,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : ''),
      },
      {
        field: 'actor_email',
        headerName: t('audit.actor'),
        minWidth: 180,
        valueGetter: (p) => p.data?.actor_email ?? p.data?.actor_user_id ?? '-',
      },
      { field: 'action', headerName: t('audit.action'), minWidth: 120 },
      { field: 'target_type', headerName: t('audit.targetType'), minWidth: 120 },
      { field: 'target_id', headerName: t('audit.targetId'), minWidth: 200 },
      {
        field: 'details',
        headerName: t('audit.details'),
        flex: 1,
        minWidth: 160,
        valueFormatter: (p) =>
          p.value && typeof p.value === 'object' ? JSON.stringify(p.value) : String(p.value ?? ''),
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <h1 className="flex-shrink-0 text-2xl font-bold text-slate-900 dark:text-slate-100">{t('audit.title')}</h1>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">{t('audit.from')}</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">{t('audit.to')}</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={load}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
          {t('common.search')}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <div className="ag-theme-alpine dark:ag-theme-alpine-dark h-full w-full">
          <AgGridReact<AuditListItem>
            rowData={data?.items ?? []}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            domLayout="normal"
            suppressCellFocus
          />
        </div>
      </div>
      {data?.items?.length === 0 && (
        <p className="flex-shrink-0 text-slate-500 dark:text-slate-400">{t('audit.noAudit')}</p>
      )}
    </div>
  );
}
