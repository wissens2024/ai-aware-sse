'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Shield,
  CheckCircle,
  UserX,
  Users,
  FolderCog,
  History,
  Sun,
  Moon,
  Globe,
} from 'lucide-react';
import { useLanguage } from './LanguageProvider';

const navItems = [
  { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/events', labelKey: 'nav.events', icon: FileText },
  { href: '/policies', labelKey: 'nav.policies', icon: Shield },
  { href: '/approvals', labelKey: 'nav.approvals', icon: CheckCircle },
  { href: '/exceptions', labelKey: 'nav.exceptions', icon: UserX },
  { href: '/users', labelKey: 'nav.users', icon: Users },
  { href: '/groups', labelKey: 'nav.groups', icon: FolderCog },
  { href: '/audit', labelKey: 'nav.audit', icon: History },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="sticky top-0 flex h-screen flex-col py-4">
          <Link
            href="/"
            className="mb-6 flex items-center gap-3 px-4"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-md shadow-blue-500/20">
              <svg width="32" height="32" viewBox="2 1 28 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2 L28 7 L28 15 C28 22 22.5 27.5 16 30 C9.5 27.5 4 22 4 15 L4 7 Z" fill="white" fillOpacity="0.25"/>
                <path d="M12.5 14.5 L12.5 12.5 C12.5 10.5 14 9 16 9 C18 9 19.5 10.5 19.5 12.5 L19.5 14.5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <rect x="10.5" y="14" width="11" height="8" rx="1.5" fill="white"/>
                <circle cx="16" cy="17.2" r="1.4" fill="#3b82f6"/>
                <rect x="15.3" y="18" width="1.4" height="2.2" rx="0.5" fill="#3b82f6"/>
              </svg>
            </div>
            <span className="text-sm font-bold whitespace-nowrap text-slate-800 dark:text-slate-100">
              AI-Aware SSE
            </span>
          </Link>
          <nav className="flex-1 space-y-0.5 px-2">
            {navItems.map(({ href, labelKey, icon: Icon }) => {
              const isActive =
                href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              v0.1.0
            </p>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-2 border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-800">
          {mounted ? (
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              <Sun className="h-5 w-5 dark:hidden" />
              <Moon className="hidden h-5 w-5 dark:block" />
            </button>
          ) : (
            <span className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-700" aria-hidden />
          )}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            <button
              type="button"
              onClick={() => setLocale('ko')}
              className={`px-3 py-1.5 text-sm ${locale === 'ko' ? 'bg-slate-200 dark:bg-slate-600 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              한글
            </button>
            <button
              type="button"
              onClick={() => setLocale('en')}
              className={`px-3 py-1.5 text-sm ${locale === 'en' ? 'bg-slate-200 dark:bg-slate-600 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              EN
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col min-h-0 p-6">{children}</main>
      </div>
    </div>
  );
}
