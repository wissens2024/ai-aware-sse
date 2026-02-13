'use client';

import '@/lib/ag-grid-setup';
import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { fetchApi, type PolicyListResponse, type PolicyItem } from '@/lib/api';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { Plus, ChevronRight } from 'lucide-react';

export default function PoliciesPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<PolicyListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<PolicyListResponse>('/admin/policies?limit=100')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const columnDefs = useMemo<ColDef<PolicyItem>[]>(
    () => [
      { field: 'name', headerName: t('policies.name'), flex: 1, minWidth: 220 },
      { field: 'priority', headerName: t('policies.priority'), width: 100 },
      {
        field: 'enabled',
        headerName: t('policies.enabled'),
        width: 100,
        valueGetter: (p) => (p.data?.enabled ? 'Yes' : 'No'),
      },
      { field: 'version', headerName: t('policies.version'), width: 90 },
      {
        headerName: '',
        width: 100,
        minWidth: 100,
        sortable: false,
        cellStyle: { whiteSpace: 'nowrap' },
        cellRenderer: (p: { data?: PolicyItem }) =>
          p.data ? (
            <Link
              href={`/policies/${p.data.policy_id}`}
              className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400 whitespace-nowrap"
            >
              {t('common.edit')}
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('policies.title')}</h1>
        <Link
          href="/policies/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          <Plus className="h-4 w-4" />
          {t('policies.addPolicy')}
        </Link>
      </div>
      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
        <AgGridReact<PolicyItem>
          theme="legacy"
          rowData={data?.items ?? []}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          domLayout="normal"
          suppressCellFocus
        />
      </div>
      {data?.items.length === 0 && (
        <p className="py-8 text-center text-slate-500 dark:text-slate-400">{t('policies.noPolicies')}</p>
      )}
    </div>
  );
}
