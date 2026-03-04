'use client';

import '@/lib/ag-grid-setup';
import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { fetchApi, type GroupListResponse, type GroupListItem } from '@/lib/api';
import { useLanguage } from '@/components/LanguageProvider';

export default function GroupsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<GroupListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<GroupListResponse>('/admin/groups?limit=100')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const columnDefs = useMemo<ColDef<GroupListItem>[]>(
    () => [
      { field: 'name', headerName: t('groups.name'), flex: 1, minWidth: 180 },
      { field: 'member_count', headerName: t('groups.memberCount'), width: 120 },
      {
        field: 'created_at',
        headerName: t('groups.created'),
        minWidth: 120,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString() : ''),
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
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('groups.title')}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('groups.description')}</p>
      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
        <AgGridReact<GroupListItem>
          theme="legacy"
          rowData={data?.items ?? []}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          domLayout="normal"
          suppressCellFocus
        />
      </div>
      {data?.items.length === 0 && (
        <p className="py-8 text-center text-slate-500 dark:text-slate-400">{t('groups.noGroups')}</p>
      )}
    </div>
  );
}
