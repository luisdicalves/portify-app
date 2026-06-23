'use client';

import { useRouter } from 'next/navigation';

export default function SplashPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: 24 }}>
        {/* Logo */}
        <div style={{ width: 160, height: 160, borderRadius: 40, background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 100, height: 100, borderRadius: 28, background: 'var(--primary-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}>
            <span className="material-symbols-outlined icf" style={{ color: '#fff', fontSize: 54 }}>account_balance_wallet</span>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.02em' }}>Portify</div>
          <div style={{ fontSize: 16, color: 'var(--on-surface-variant)', marginTop: 8, maxWidth: 240, textWrap: 'pretty' as never }}>
            Todo o seu património num só lugar
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ padding: '24px 24px 34px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button onClick={() => router.push('/auth/onboarding')}
          style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Começar agora
        </button>
        <button onClick={() => router.push('/auth/login')}
          style={{ background: 'var(--surface-high)', color: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Entrar
        </button>
      </div>
    </div>
  );
}
