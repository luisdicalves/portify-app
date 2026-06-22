'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

export default function OnboardingPage() {
  const { lang } = useApp();
  const t = useDict(lang);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const steps = t.onbSteps;
  const isLast = step === steps.length - 1;

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between' }}>
      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 24px 0' }}>
        <button onClick={() => router.push('/auth/login')} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 600, color: 'var(--on-surface-variant)',
        }}>{t.skip}</button>
      </div>

      {/* Illustration — altura fixa para não variar com o texto */}
      <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 160, height: 160, borderRadius: 40,
          background: 'var(--primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined icf" style={{ fontSize: 80, color: 'var(--primary-strong)' }}>
            {steps[step].icon}
          </span>
        </div>
      </div>

      {/* Text — altura fixa para os dots não saltarem */}
      <div style={{ padding: '0 32px', textAlign: 'center', minHeight: 120 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 12 }}>
          {steps[step].title}
        </div>
        <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
          {steps[step].text}
        </div>
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 24 : 8,
            height: 8,
            borderRadius: 'var(--radius-full)',
            background: i === step ? 'var(--primary-strong)' : 'var(--outline-variant)',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          className="btn-primary"
          onClick={() => isLast ? router.push('/auth/login') : setStep(s => s + 1)}
        >
          {isLast ? t.start : t.next}
        </button>
      </div>
    </div>
  );
}
