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
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 20px 0' }}>
        <button onClick={() => router.push('/auth/register')} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          color: 'var(--on-surface-variant)', padding: 6,
        }}>{t.skip}</button>
      </div>

      {/* Illustration — altura fixa para não variar com o texto */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 26 }}>
        <div style={{ width: 168, height: 168, borderRadius: 40, background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 104, height: 104, borderRadius: 28, background: 'var(--primary-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}>
            <span className="material-symbols-outlined icf" style={{ color: '#fff', fontSize: 56 }}>
              {steps[step].icon}
            </span>
          </div>
        </div>

        {/* Text */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em', maxWidth: 270, textWrap: 'pretty', lineHeight: 1.2 }}>
            {steps[step].title}
          </div>
          <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 12, maxWidth: 260, textWrap: 'pretty', lineHeight: 1.45 }}>
            {steps[step].text}
          </div>
        </div>
      </div>

      {/* Dots + CTA */}
      <div style={{ padding: '24px 24px 34px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {steps.map((_, i) => (
            <span key={i} style={{
              display: 'block',
              width: i === step ? 24 : 8, height: 8,
              borderRadius: 'var(--radius-full)',
              background: i === step ? 'var(--primary-strong)' : 'var(--outline-variant)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
        <button
          onClick={() => isLast ? router.push('/auth/register') : setStep(s => s + 1)}
          style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {isLast ? t.start : t.next}
        </button>
      </div>
    </div>
  );
}
