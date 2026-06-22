'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const { lang } = useApp();
  const t = useDict(lang);
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [terms, setTerms] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { setError('As palavras-passe não coincidem.'); return; }
    if (!terms) { setError('Aceite os termos para continuar.'); return; }
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { first_name: form.firstName, last_name: form.lastName } },
      });
      if (error) throw error;
      router.push('/auth/onboarding');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  }

  const pwStrength = form.password.length >= 8 ? (form.password.match(/[A-Z]/) && form.password.match(/\d/) ? 'strong' : 'medium') : form.password.length > 0 ? 'weak' : '';
  const strengthColor = { strong: 'var(--gain)', medium: '#f59e0b', weak: 'var(--loss)', '': 'transparent' }[pwStrength];
  const strengthW = { strong: '100%', medium: '66%', weak: '33%', '': '0' }[pwStrength];

  return (
    <div className="phone-shell">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px 8px' }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'block', marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)' }}>arrow_back_ios_new</span>
          </button>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{t.registerTitle}</div>
          <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 4 }}>{t.registerSubtitle}</div>
        </div>

        <form onSubmit={handleRegister} style={{ padding: '12px 24px 32px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {/* Name row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.regFirstName}</div>
              <input placeholder={t.firstNamePh} value={form.firstName} onChange={set('firstName')} required
                style={{ width: '100%', background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '13px', fontSize: 15, color: 'var(--on-surface)', outline: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.regLastName}</div>
              <input placeholder={t.lastNamePh} value={form.lastName} onChange={set('lastName')} required
                style={{ width: '100%', background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '13px', fontSize: 15, color: 'var(--on-surface)', outline: 'none' }} />
            </div>
          </div>

          {/* Email */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.emailLabel}</div>
            <div className="field-wrap">
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>mail</span>
              <input className="field-input" type="email" placeholder={t.emailPh} value={form.email} onChange={set('email')} required autoComplete="email" />
            </div>
          </div>

          {/* Password */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.passwordLabel}</div>
            <div className="field-wrap">
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>lock</span>
              <input className="field-input" type={showPw ? 'text' : 'password'} placeholder={t.passwordPh} value={form.password} onChange={set('password')} required autoComplete="new-password" />
              <span onClick={() => setShowPw(v => !v)} className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)', cursor: 'pointer' }}>{showPw ? 'visibility_off' : 'visibility'}</span>
            </div>
            {form.password && (
              <div style={{ marginTop: 8 }}>
                <div className="progress-bar"><div className="progress-fill" style={{ width: strengthW, background: strengthColor }} /></div>
              </div>
            )}
          </div>

          {/* Confirm */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.confirmPasswordLabel}</div>
            <div className="field-wrap">
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>lock</span>
              <input className="field-input" type="password" placeholder={t.passwordPh} value={form.confirmPassword} onChange={set('confirmPassword')} required autoComplete="new-password" />
            </div>
          </div>

          {/* Terms */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <button type="button" onClick={() => setTerms(v => !v)} style={{
              width: 24, height: 24, flex: 'none', borderRadius: 7,
              background: terms ? 'var(--primary-strong)' : 'transparent',
              border: `2px solid ${terms ? 'var(--primary-strong)' : 'var(--outline-variant)'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
            }}>
              {terms && <span className="material-symbols-outlined icf" style={{ fontSize: 16, color: '#fff' }}>check</span>}
            </button>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              {t.acceptTerms} <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{t.terms}</span> {t.and} <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{t.privacy}</span>
            </span>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--loss)', background: 'var(--loss-container)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
              {error}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? <span className="material-symbols-outlined" style={{ fontSize: 20 }}>progress_activity</span> : null}
            {t.createAccount}
          </button>

          <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--on-surface-variant)' }}>
            {t.haveAccount}{' '}
            <Link href="/auth/login" style={{ fontWeight: 700, color: 'var(--primary)' }}>{t.signIn}</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
