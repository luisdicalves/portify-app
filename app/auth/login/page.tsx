'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const { lang } = useApp();
  const t = useDict(lang);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="phone-shell" style={{ justifyContent: 'center', padding: '0 24px' }}>
      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 32 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'var(--primary-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow)',
        }}>
          <span className="material-symbols-outlined icf" style={{ color: '#fff', fontSize: 38 }}>account_balance_wallet</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>{t.loginTitle}</div>
          <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 6 }}>{t.loginSubtitle}</div>
        </div>
      </div>

      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        {/* Email */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.emailLabel}</div>
          <div className="field-wrap">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>mail</span>
            <input
              className="field-input"
              type="email"
              placeholder={t.emailPh}
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)' }}>{t.passwordLabel}</span>
            <span style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>{t.forgotPassword}</span>
          </div>
          <div className="field-wrap">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>lock</span>
            <input
              className="field-input"
              type="password"
              placeholder={t.passwordPh}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--loss)', background: 'var(--loss-container)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            {error}
          </div>
        )}

        <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? <span className="material-symbols-outlined" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>progress_activity</span> : null}
          {t.signIn}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => router.push('/dashboard')}
          style={{ gap: 9 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>face</span>
          {t.faceId}
        </button>
      </form>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
        <span style={{ fontSize: 13, color: 'var(--outline)' }}>{t.orContinue}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
      </div>

      <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 20 }}>
        {t.noAccount}{' '}
        <Link href="/auth/register" style={{ fontWeight: 700, color: 'var(--primary)' }}>
          {t.createAccount}
        </Link>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link href="/auth/onboarding" style={{ fontSize: 13, color: 'var(--outline)' }}>
          Ver onboarding →
        </Link>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
