'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { lang } = useApp();
  const t = useDict(lang);

  const TABS = [
    { path: '/dashboard', icon: 'dashboard',              label: t.navDash },
    { path: '/portfolio', icon: 'account_balance_wallet', label: t.navPort },
    { path: '/for-you',   icon: 'explore',                label: t.navRadar },
    { path: '/profile',   icon: 'person',                 label: t.navProfile },
  ];

  // BottomNavigation — PDS-193..202: solid surface, no blur/glass, flush
  // with the bottom edge, no active pill (already color-only here).
  return (
    <div style={{
      // Absolutely positioned within .phone-shell, so it sits at the shell's
      // true bottom edge and doesn't inherit the shell's own safe-bottom
      // padding — added directly here instead (background stays flush behind
      // the home indicator/gesture area; only the tap targets shift up).
      position: 'absolute', left: 0, right: 0, bottom: 0,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      background: 'var(--surface-lowest)',
      borderTop: '1px solid var(--hairline)',
      padding: '10px 8px calc(12px + var(--safe-bottom))', zIndex: 10,
    }}>
      {TABS.map(tab => {
        const active = pathname === tab.path || pathname.startsWith(tab.path + '/');
        const color = active ? 'var(--primary)' : 'var(--on-surface-variant)';
        return (
          <button key={tab.path} type="button" onClick={() => router.push(tab.path)}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer', color, fontFamily: 'inherit', flex: 1,
            }}>
            <span className={`material-symbols-outlined${active ? ' icf' : ''}`} style={{ fontSize: 20 }}>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
