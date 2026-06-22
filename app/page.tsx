'use client';

import { useRouter } from 'next/navigation';

export default function SplashPage() {
  const router = useRouter();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '60px 32px 48px',
      maxWidth: 430,
      margin: '0 auto',
    }}>
      {/* Logo + tagline */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <div style={{
          width: 140, height: 140,
          borderRadius: 40,
          background: 'var(--primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 100, height: 100,
            borderRadius: 28,
            background: 'var(--primary-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 54, color: '#fff' }}>
              account_balance_wallet
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            Portify
          </div>
          <div style={{ fontSize: 17, color: 'var(--on-surface-variant)', marginTop: 12, lineHeight: 1.5 }}>
            Gestão de património<br />inteligente e simplificada.
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <button
          onClick={() => router.push('/auth/onboarding')}
          className="btn-primary"
          style={{ fontSize: 17, fontWeight: 700, padding: 18, borderRadius: 18 }}
        >
          Começar agora
        </button>
        <button
          onClick={() => router.push('/auth/login')}
          className="btn-secondary"
          style={{ fontSize: 17, fontWeight: 700, padding: 18, borderRadius: 18, color: 'var(--primary)' }}
        >
          Entrar
        </button>
      </div>
    </div>
  );
}
