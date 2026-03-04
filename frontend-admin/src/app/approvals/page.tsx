'use client';

import '@/lib/ag-grid-setup';
import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { fetchApi, type ApprovalListResponse, type ApprovalListItem } from '@/lib/api';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { ChevronRight } from 'lucide-react';

export default function ApprovalsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<ApprovalListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', '50');
    fetchApi<ApprovalListResponse>(`/admin/approvals?${params}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status]);

  const statusLabel = (s: string) => {
    if (s === 'PENDING') return t('approvals.pending');
    if (s === 'APPROVED') return t('approvals.approved');
    if (s === 'REJECTED') return t('approvals.rejected');
    if (s === 'EXPIRED') return t('approvals.expired');
    return s;
  };

  const columnDefs = useMemo<ColDef<ApprovalListItem>[]>(
    () => [
      {
        field: 'case_id',
        headerName: t('approvals.caseId'),
        minWidth: 120,
        valueGetter: (p) => (p.data?.case_id ? `${p.data.case_id.slice(0, 8)}...` : ''),
      },
      {
        field: 'requested_at',
        headerName: t('approvals.requested'),
        flex: 1,
        minWidth: 160,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : ''),
      },
      { field: 'app.domain', headerName: t('events.domain'), minWidth: 130, valueGetter: (p) => p.data?.app?.domain ?? '-' },
      { field: 'requested_by.email', headerName: t('approvals.requester'), minWidth: 160, valueGetter: (p) => p.data?.requested_by?.email ?? '-' },
      { field: 'summary.risk_score', headerName: t('events.risk'), width: 90, valueGetter: (p) => p.data?.summary?.risk_score ?? '' },
      {
        field: 'status',
        headerName: t('approvals.status'),
        minWidth: 110,
        valueGetter: (p) => (p.data?.status ? statusLabel(p.data.status) : ''),
        cellClassRules: {
          'text-amber-600 dark:text-amber-400': (p) => p.data?.status === 'PENDING',
          'text-green-600 dark:text-green-400': (p) => p.data?.status === 'APPROVED',
          'text-red-600 dark:text-red-400': (p) => p.data?.status === 'REJECTED',
        },
      },
      {
        headerName: '',
        width: 100,
        minWidth: 100,
        sortable: false,
        cellStyle: { whiteSpace: 'nowrap' },
        cellRenderer: (p: { data?: ApprovalListItem }) =>
          p.data ? (
            <Link
              href={`/approvals/${p.data.case_id}`}
              className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400 whitespace-nowrap"
            >
              {t('approvals.process')}
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            </Link>
          ) : null,
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
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('approvals.title')}</h1>
      <div className="flex flex-wrap gap-2">
        {['', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              status === s
                ? 'bg-primary-500 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500'
            }`}
          >
            {s ? statusLabel(s) : t('common.all')}
          </button>
        ))}
      </div>
      <div className="ag-theme-alpine" style={{ height: 420, width: '100%' }}>
        <AgGridReact<ApprovalListItem>
          theme="legacy"
          rowData={data?.items ?? []}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          domLayout="normal"
          suppressCellFocus
        />
      </div>
      {data?.items.length === 0 && (
        <p className="py-8 text-center text-slate-500 dark:text-slate-400">{t('approvals.noCases')}</p>
      )}
    </div>
  );
}
