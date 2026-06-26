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
    { path: '/for-you',   icon: 'auto_awesome',           label: t.navFor },
    { path: '/profile',   icon: 'person',                 label: t.navProfile },
  ];

  return (
    <div style={{
      position: 'absolute', left: 14, right: 14, bottom: 14,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      background: 'var(--nav-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid var(--card-border)', borderRadius: 'var(--radius-2xl)',
      padding: '11px 8px', boxShadow: 'var(--shadow)', zIndex: 10,
    }}>
      {TABS.map(tab => {
        const active = pathname === tab.path || pathname.startsWith(tab.path + '/');
        const color = active ? 'var(--primary)' : 'var(--on-surface-variant)';
        return (
          <div key={tab.path} onClick={() => router.push(tab.path)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', color }}>
            <span className={`material-symbols-outlined${active ? ' icf' : ''}`} style={{ fontSize: 22 }}>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
          </div>
        );
      })}
    </div>
  );
}
