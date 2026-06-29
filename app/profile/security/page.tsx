'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: on ? 'var(--primary)' : 'var(--surface-highest)', position: 'relative', transition: 'background 0.2s', padding: 0 }}>
      <span style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

export default function SecurityPage() {
  const router = useRouter();
  const { lang } = useApp();
  const t = useDict(lang);
  const [faceId, setFaceId] = useState(true);
  const [twoFa, setTwoFa] = useState(false);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 24px 8px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer', display: 'block', marginBottom: 8 }}>arrow_back_ios_new</span>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{t.security}</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderBottom: '1px solid var(--hairline)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>face</span>{t.faceIdLabel}
            </span>
            <Toggle on={faceId} onToggle={() => setFaceId(v => !v)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>verified_user</span>{t.twoFactorAuth}
            </span>
            <Toggle on={twoFa} onToggle={() => setTwoFa(v => !v)} />
          </div>
        </div>

        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {[
            { icon: 'pin',      label: t.changePin,      sub: undefined,    href: '/auth/pin-set' },
            { icon: 'password', label: t.changePassword, sub: undefined,    href: '#' },
            { icon: 'devices',  label: t.activeSessions, sub: t.oneDevice,  href: undefined },
          ].map((item, i, arr) => (
            <div key={item.label} onClick={item.href ? () => router.push(item.href!) : undefined}
              style={{ cursor: item.href ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>{item.icon}</span>{item.label}
              </span>
              {item.sub
                ? <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{item.sub}</span>
                : <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>chevron_right</span>}
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
