'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

export default function PinPage() {
  const { lang } = useApp();
  const t = useDict(lang);
  const router = useRouter();
  const [pin, setPin] = useState('');

  const press = (k: string) => {
    if (k === 'del') { setPin(p => p.slice(0, -1)); return; }
    const next = (pin + k).slice(0, 6);
    setPin(next);
    if (next.length === 6) {
      setTimeout(() => router.push('/dashboard'), 200);
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between', padding: '0 24px' }}>
      {/* Back */}
      <div style={{ paddingTop: 20 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)' }}>arrow_back_ios_new</span>
        </button>
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{t.pinTitle}</div>
        <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 6 }}>{t.pinSub}</div>

        {/* PIN dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />
          ))}
        </div>
      </div>

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingBottom: 48 }}>
        {keys.map((k, i) => (
          <button
            key={i}
            onClick={() => k !== '' && press(k)}
            style={{
              height: 58,
              borderRadius: 'var(--radius-lg)',
              cursor: k === '' ? 'default' : 'pointer',
              fontSize: 22,
              fontWeight: 600,
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: k === '' ? 'transparent' : 'var(--surface-high)',
              color: 'var(--on-surface)',
              transition: 'opacity 0.1s',
            }}
          >
            {k === 'del'
              ? <span className="material-symbols-outlined" style={{ fontSize: 24 }}>backspace</span>
              : k}
          </button>
        ))}
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 32 }}>
        <span style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 500, cursor: 'pointer' }}>{t.forgotPin}</span>
      </div>
    </div>
  );
}
