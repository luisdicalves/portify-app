'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { createClient } from '@/lib/supabase/client';
import { getSessionUserId } from '@/lib/hooks/useUser';

export default function PinPage() {
  const { lang } = useApp();
  const t = useDict(lang);
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const press = (k: string) => {
    if (checking) return;
    setError(false);
    if (k === 'del') { setPin(p => p.slice(0, -1)); return; }
    const next = (pin + k).slice(0, 6);
    setPin(next);
    if (next.length === 6) verify(next);
  };

  async function verify(value: string) {
    setChecking(true);
    const supabase = createClient();
    const { data: ok } = await supabase.rpc('verify_pin', { p_pin: value });
    if (ok) {
      const userId = await getSessionUserId();
      if (userId) {
        const { data: plan } = await supabase
          .from('investment_plans')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (!plan) {
          router.push('/auth/experience');
          return;
        }
      }
      router.push('/dashboard');
      return;
    }
    setError(true);
    setPin('');
    setChecking(false);
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];

  return (
    <div className="phone-shell" style={{ padding: 24 }}>
      {/* Centered content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-full)', background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>lock</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{t.pinTitle}</div>
        <div style={{ fontSize: 14, color: error ? 'var(--loss)' : 'var(--on-surface-variant)', textAlign: 'center' }}>{error ? t.pinWrong : t.pinSub}</div>

        {/* PIN dots */}
        <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
          {[0,1,2,3,4,5].map(i => (
            <span key={i} style={{ display: 'block', width: 14, height: 14, borderRadius: 'var(--radius-full)', border: '2px solid var(--primary)', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
              {i < pin.length && <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: 'var(--radius-full)', background: 'var(--primary)' }} />}
            </span>
          ))}
        </div>
      </div>

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {keys.map((k, i) => (
          <button key={i} onClick={() => k !== '' && press(k)} style={{
            height: 58, borderRadius: 'var(--radius-lg)',
            cursor: k === '' ? 'default' : 'pointer',
            fontSize: 22, fontWeight: 600, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: k === '' ? 'transparent' : 'var(--surface-high)',
            color: 'var(--on-surface)', fontFamily: 'inherit',
          }}>
            {k === 'del' ? <span className="material-symbols-outlined" style={{ fontSize: 24 }}>backspace</span> : k}
          </button>
        ))}
      </div>

      <button onClick={() => router.push('/auth/login')}
        style={{ marginTop: 16, background: 'transparent', border: 'none', color: 'var(--primary)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
        {t.forgotPin}
      </button>
    </div>
  );
}
