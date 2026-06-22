'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

const tabs = [
  { path: '/dashboard', icon: 'home', iconActive: 'home', labelKey: 'navDash' },
  { path: '/portfolio', icon: 'pie_chart', iconActive: 'pie_chart', labelKey: 'navPort' },
  { path: '/for-you', icon: 'auto_awesome', iconActive: 'auto_awesome', labelKey: 'navFor' },
  { path: '/activity', icon: 'swap_horiz', iconActive: 'swap_horiz', labelKey: 'navTx' },
  { path: '/profile', icon: 'person', iconActive: 'person', labelKey: 'navProfile' },
] as const;

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { lang } = useApp();
  const t = useDict(lang);

  return (
    <nav className="bottom-nav">
      {tabs.map(tab => {
        const active = pathname.startsWith(tab.path);
        return (
          <button
            key={tab.path}
            className={`nav-item${active ? ' active' : ''}`}
            onClick={() => router.push(tab.path)}
          >
            <span className={`material-symbols-outlined${active ? ' icf' : ''}`}>
              {active ? tab.iconActive : tab.icon}
            </span>
            <span className="nav-label">{t[tab.labelKey]}</span>
          </button>
        );
      })}
    </nav>
  );
}
