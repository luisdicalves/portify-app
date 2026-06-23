'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
      router.push('/auth/pin');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.');
    } finally {
      setLoading(false);
    }
  }

  const field = {
    display: 'flex', alignItems: 'center', gap: 9,
    background: 'var(--surface-low)', border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)', padding: '0 13px',
  } as const;

  const input = {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    padding: '13px 0', fontSize: 15, color: 'var(--on-surface)', fontFamily: 'inherit',
  } as const;

  return (
    <div className="phone-shell" style={{ flexDirection: 'column', overflow: 'auto', padding: '28px 24px 24px' }}>
      {/* Logo + title */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--primary-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}>
          <span className="material-symbols-outlined icf" style={{ color: '#fff', fontSize: 34 }}>account_balance_wallet</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{t.loginTitle}</div>
          <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 6 }}>{t.loginSubtitle}</div>
        </div>
      </div>

      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Email */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.emailLabel}</div>
          <div style={field}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>mail</span>
            <input style={input} type="email" placeholder={t.emailPh} value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
        </div>

        {/* Password */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.passwordLabel}</div>
          <div style={field}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>lock</span>
            <input style={{ ...input, padding: '12px 0' }} type="password" placeholder={t.passwordPh} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--loss)', background: 'var(--loss-container)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, opacity: loading ? 0.7 : 1 }}>
          {t.signIn}
        </button>

        <button type="button" onClick={() => router.push('/dashboard')}
          style={{ background: 'var(--surface-high)', color: 'var(--on-surface)', border: 'none', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>face</span>
          {t.faceId}
        </button>
      </form>

      <div style={{ flex: 1 }} />

      <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--on-surface-variant)', paddingTop: 16 }}>
        {t.noAccount}{' '}
        <a onClick={() => router.push('/auth/register')} style={{ fontWeight: 700, color: 'var(--primary)', cursor: 'pointer' }}>{t.createAccount}</a>
      </div>
    </div>
  );
}
