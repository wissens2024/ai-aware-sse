'use client';

import '@/lib/ag-grid-setup';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { fetchApi, type UserListResponse, type UserListItem } from '@/lib/api';
import { useLanguage } from '@/components/LanguageProvider';
import { Upload } from 'lucide-react';

export default function UsersPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<UserListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    params.set('limit', '100');
    fetchApi<UserListResponse>(`/admin/users?${params}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const doImport = async () => {
    let users: Array<{ email: string; display_name?: string; groups: string[] }>;
    try {
      users = JSON.parse(importJson || '[]');
    } catch {
      setError('JSON 형식이 올바르지 않습니다.');
      return;
    }
    if (!Array.isArray(users)) {
      setError('배열 형태의 JSON이어야 합니다.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      await fetchApi('/admin/users/import', {
        method: 'POST',
        body: JSON.stringify({ users }),
      });
      setImportJson('');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const columnDefs = useMemo<ColDef<UserListItem>[]>(
    () => [
      { field: 'email', headerName: t('users.email'), flex: 1, minWidth: 200, valueGetter: (p) => p.data?.email ?? '-' },
      { field: 'display_name', headerName: t('users.displayName'), minWidth: 140, valueGetter: (p) => p.data?.display_name ?? '-' },
      { field: 'groups', headerName: t('users.groups'), minWidth: 180, valueGetter: (p) => p.data?.groups?.join(', ') ?? '-' },
      {
        field: 'created_at',
        headerName: t('users.registered'),
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('users.title')}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('users.description')}</p>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        <input
          type="search"
          placeholder={t('users.searching')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 w-64 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
          <Upload className="h-4 w-4" />
          {t('users.import')}
        </h2>
        <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
          {t('users.importPlaceholder')}: {`[{"email":"user@example.com","display_name":"이름","groups":["Dev","AllEmployees"]}]`}
        </p>
        <textarea
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder='[{"email":"new@example.com","display_name":"New User","groups":["AllEmployees"]}]'
          className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          rows={3}
        />
        <button
          type="button"
          onClick={doImport}
          disabled={importing}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {importing ? t('common.loading') : t('users.importButton')}
        </button>
      </div>
      <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
        <AgGridReact<UserListItem>
          theme="legacy"
          rowData={data?.items ?? []}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          domLayout="normal"
          suppressCellFocus
        />
      </div>
      {data?.items.length === 0 && (
        <p className="py-8 text-center text-slate-500 dark:text-slate-400">{t('users.noUsers')}</p>
      )}
    </div>
  );
}
