'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PinSetPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<'set' | 'confirm'>('set');
  const [error, setError] = useState('');

  const current = step === 'set' ? pin : confirm;

  const press = (k: string) => {
    setError('');
    if (k === 'del') {
      if (step === 'set') setPin(p => p.slice(0, -1));
      else setConfirm(p => p.slice(0, -1));
      return;
    }
    if (step === 'set') {
      const next = (pin + k).slice(0, 6);
      setPin(next);
      if (next.length === 6) setStep('confirm');
    } else {
      const next = (confirm + k).slice(0, 6);
      setConfirm(next);
      if (next.length === 6) {
        if (next === pin) {
          router.push('/auth/assets');
        } else {
          setError('PINs não coincidem. Tenta de novo.');
          setConfirm('');
          setPin('');
          setStep('set');
        }
      }
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between', padding: '0 24px' }}>
      <div style={{ paddingTop: 20 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)' }}>arrow_back_ios_new</span>
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
        {/* Icon */}
        <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-full)', background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>lock_reset</span>
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {step === 'set' ? 'Defina o seu PIN' : 'Confirme o PIN'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', maxWidth: 240 }}>
          {step === 'set' ? 'Crie um código de 6 dígitos para proteger a conta' : 'Introduza o PIN novamente para confirmar'}
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--loss)' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className={`pin-dot${i < current.length ? ' filled' : ''}`} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingBottom: 48 }}>
        {keys.map((k, i) => (
          <button key={i} onClick={() => k !== '' && press(k)} style={{
            height: 58, borderRadius: 'var(--radius-lg)', cursor: k === '' ? 'default' : 'pointer',
            fontSize: 22, fontWeight: 600, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: k === '' ? 'transparent' : 'var(--surface-high)', color: 'var(--on-surface)',
          }}>
            {k === 'del' ? <span className="material-symbols-outlined" style={{ fontSize: 24 }}>backspace</span> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
