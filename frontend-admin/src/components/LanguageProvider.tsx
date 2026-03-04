'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { translations, type Locale } from '@/lib/i18n';

type Dict = Record<string, unknown>;

function getNested(obj: Dict, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    cur = (cur as Dict)?.[p];
  }
  return cur;
}

type TFunc = (key: string, ...args: unknown[]) => string;

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: TFunc } | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('ko');
  const t = useCallback<TFunc>(
    (key: string, ...args: unknown[]) => {
      const dict = translations[locale];
      const value = getNested(dict as Dict, key);
      if (typeof value === 'function') return (value as (...a: unknown[]) => string)(...args);
      return (value as string) ?? key;
    },
    [locale],
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
