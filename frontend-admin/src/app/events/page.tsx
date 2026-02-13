'use client';

import '@/lib/ag-grid-setup';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { fetchApi, type EventSearchResponse, type EventListItem } from '@/lib/api';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageProvider';
import { ChevronRight } from 'lucide-react';

export default function EventsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<EventSearchResponse | null>(null);
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

  useEffect(() => {
    const fromDate = new Date(from).toISOString();
    const toEnd = new Date(to);
    toEnd.setSeconds(59, 999);
    const toDate = toEnd.toISOString();
    fetchApi<EventSearchResponse>(
      `/admin/events?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&limit=50`,
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, [from, to]);

  const columnDefs = useMemo<ColDef<EventListItem>[]>(
    () => [
      {
        field: 'time',
        headerName: t('events.time'),
        flex: 1,
        minWidth: 160,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : ''),
      },
      { field: 'app.domain', headerName: t('events.domain'), minWidth: 140, valueGetter: (p) => p.data?.app?.domain ?? '-' },
      { field: 'user.email', headerName: t('events.user'), minWidth: 160, valueGetter: (p) => p.data?.user?.email ?? '-' },
      { field: 'event_type', headerName: t('events.type'), minWidth: 120 },
      {
        field: 'decision',
        headerName: t('events.decision'),
        minWidth: 110,
        cellClassRules: {
          'text-red-600 dark:text-red-400': (p) => p.value === 'BLOCK',
          'text-amber-600 dark:text-amber-400': (p) => p.value === 'WARN',
        },
      },
      { field: 'risk_score', headerName: t('events.risk'), width: 90 },
      {
        headerName: '',
        width: 100,
        minWidth: 100,
        sortable: false,
        cellStyle: { whiteSpace: 'nowrap' },
        cellRenderer: (p: { data?: EventListItem }) =>
          p.data ? (
            <Link
              href={`/events/${p.data.event_id}`}
              className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400 whitespace-nowrap"
            >
              {t('common.detail')}
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <h1 className="flex-shrink-0 text-2xl font-bold text-slate-900 dark:text-slate-100">{t('events.title')}</h1>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">{t('events.from')}</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">{t('events.to')}</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1">
        <div className="ag-theme-alpine h-full w-full">
          <AgGridReact<EventListItem>
            theme="legacy"
            rowData={data?.items ?? []}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            domLayout="normal"
            suppressCellFocus
          />
        </div>
      </div>
      {data?.items.length === 0 && (
        <p className="flex-shrink-0 py-8 text-center text-slate-500 dark:text-slate-400">{t('events.noEvents')}</p>
      )}
    </div>
  );
}
