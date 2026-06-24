'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { createClient } from '@/lib/supabase/client';
import DatePicker from '@/components/ui/DatePicker';

export default function RegisterPage() {
  const { lang } = useApp();
  const t = useDict(lang);
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', dob: '', username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [terms, setTerms] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!terms) { setError('Aceite os termos para continuar.'); return; }
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { first_name: form.firstName, last_name: form.lastName, username: form.username, dob: form.dob } },
      });
      if (error) throw error;
      router.push('/auth/pin-set');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  }

  // Password strength — 4 segments
  const pwLen = form.password.length;
  const hasUpper = /[A-Z]/.test(form.password);
  const hasNum = /\d/.test(form.password);
  const hasSpecial = /[^A-Za-z0-9]/.test(form.password);
  const strength = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 8 ? 2 : (hasUpper && hasNum) ? (hasSpecial ? 4 : 3) : 2;
  const strengthLabel = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'][strength];
  const strengthColor = ['', 'var(--loss)', '#f59e0b', '#84cc16', 'var(--gain)'][strength];

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

        <form onSubmit={handleRegister} style={{ padding: '12px 24px 24px', display: 'flex', flexDirection: 'column', gap: 13 }}>

          {/* Name row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.regFirstName}</div>
              <input placeholder={t.firstNamePh} value={form.firstName} onChange={set('firstName')} required
                style={{ width: '100%', background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '13px', fontSize: 15, color: 'var(--on-surface)', outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.regLastName}</div>
              <input placeholder={t.lastNamePh} value={form.lastName} onChange={set('lastName')} required
                style={{ width: '100%', background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '13px', fontSize: 15, color: 'var(--on-surface)', outline: 'none', fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* Date of Birth */}
          <DatePicker
            label={t.regDob}
            placeholder={t.regDobPh}
            value={form.dob}
            onChange={iso => setForm(f => ({ ...f, dob: iso }))}
            lang={lang}
            confirmLabel={t.confirm}
          />

          {/* Username */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>Nome de utilizador</div>
            <div style={field}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>alternate_email</span>
              <input style={input} placeholder="o_teu_username" value={form.username} onChange={set('username')} required autoComplete="username" />
            </div>
          </div>

          {/* Email */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.emailLabel}</div>
            <div style={field}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>mail</span>
              <input style={input} type="email" placeholder={t.emailPh} value={form.email} onChange={set('email')} required autoComplete="email" />
            </div>
          </div>

          {/* Password */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.passwordLabel}</div>
            <div style={field}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>lock</span>
              <input style={{ ...input, padding: '12px 0' }} type={showPw ? 'text' : 'password'} placeholder={t.passwordPh} value={form.password} onChange={set('password')} required autoComplete="new-password" />
              <span onClick={() => setShowPw(v => !v)} className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)', cursor: 'pointer' }}>{showPw ? 'visibility_off' : 'visibility'}</span>
            </div>
            {form.password && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                  {[1,2,3,4].map(i => (
                    <span key={i} style={{ flex: 1, height: 4, borderRadius: 'var(--radius-full)', background: i <= strength ? strengthColor : 'var(--surface-highest)', transition: 'background .3s' }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor }}>{strengthLabel}</span>
              </div>
            )}
          </div>

          {/* Terms */}
          <div onClick={() => setTerms(v => !v)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginTop: 2 }}>
            <span style={{
              width: 22, height: 22, flex: 'none', borderRadius: 6, marginTop: 1,
              background: terms ? 'var(--primary-strong)' : 'transparent',
              border: `2px solid ${terms ? 'var(--primary-strong)' : 'var(--outline-variant)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {terms && <span className="material-symbols-outlined icf" style={{ fontSize: 17, color: '#fff' }}>check</span>}
            </span>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              {t.acceptTerms} <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{t.terms}</span> {t.and} <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{t.privacy}</span>
            </span>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--loss)', background: 'var(--loss-container)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
              {error}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            {loading ? '...' : t.createAccount}
          </button>

          <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--on-surface-variant)', paddingTop: 6 }}>
            {t.haveAccount}{' '}
            <Link href="/auth/login" style={{ fontWeight: 700, color: 'var(--primary)' }}>{t.signIn}</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
