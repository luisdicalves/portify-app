'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import { useUser } from '@/lib/hooks/useUser';

export default function PersonalPage() {
  const router = useRouter();
  const { user } = useUser();
  const { lang } = useApp();
  const t = useDict(lang);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, date_of_birth, user_handle')
        .eq('id', user.id)
        .single();
      if (profile) {
        setFirstName(profile.first_name ?? '');
        setLastName(profile.last_name ?? '');
        setDob(profile.date_of_birth ?? '');
        setHandle(profile.user_handle ?? '');
      }
      if (user.email) { setEmail(user.email); setSavedEmail(user.email); }
    })();
  }, [user]);

  async function saveEmail() {
    setMessage('');
    if (email === savedEmail) { router.back(); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email });
    setSaving(false);
    if (error) { setMessage(t.pdEmailError); return; }
    setMessage(t.pdEmailSaved);
  }

  const dobDisplay = dob
    ? new Date(dob).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB')
    : '—';

  const lockedRow = (label: string, value: string) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-high)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '13px 14px', opacity: 0.7 }}>
        <span style={{ fontSize: 15, color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>{value || '—'}</span>
        <span style={{ fontSize: 12, color: 'var(--outline)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock</span>{t.pdLocked}
        </span>
      </div>
    </div>
  );

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px 8px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{t.pdTitle}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {lockedRow(t.pdFirstName, firstName)}
        {lockedRow(t.pdLastName, lastName)}
        {lockedRow(t.pdDob, dobDisplay)}
        {lockedRow(t.pdUserId, handle ? `@${handle}` : '—')}

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{t.pdEmailLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-low)', border: '2px solid var(--primary-strong)', borderRadius: 'var(--radius-md)', padding: '0 13px', boxShadow: '0 0 0 3px rgba(0,82,204,0.14)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>mail</span>
            <input
              value={email}
              onChange={e => { setEmail(e.target.value); setMessage(''); }}
              type="email"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '12px 0', fontSize: 15, color: 'var(--on-surface)', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {message && (
          <div style={{ fontSize: 13, color: message === t.pdEmailSaved ? 'var(--gain)' : 'var(--loss)' }}>{message}</div>
        )}

        <button onClick={saveEmail} disabled={saving}
          style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, opacity: saving ? 0.7 : 1 }}>
          {t.save}
        </button>
      </div>
    </div>
  );
}
