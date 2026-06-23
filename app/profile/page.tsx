'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/ui/BottomNav';

function SectionLabel({ label }: { label: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 6px 8px' }}>{label}</div>;
}

function SettingsRow({ icon, label, value, onPress, border = true }: { icon: string; label: string; value?: string; onPress?: () => void; border?: boolean }) {
  return (
    <div onClick={onPress} style={{ cursor: onPress ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottom: border ? '1px solid var(--hairline)' : 'none' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>{icon}</span>
        {label}
      </span>
      {value !== undefined
        ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--on-surface-variant)' }}>{value}<span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span></span>
        : onPress ? <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>chevron_right</span> : null
      }
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>{children}</div>;
}

export default function ProfilePage() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Perfil</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 16px 100px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 88, height: 88, borderRadius: 'var(--radius-full)', background: 'var(--primary-strong)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>RF</div>
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 'var(--radius-full)', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid var(--bg)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>edit</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Ricardo Ferreira</div>
            <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 2 }}>Membro desde 2024</div>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>trending_up</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Risco</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>Moderado</span>
          </div>
          <div style={{ flex: 1, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--gain)' }}>flag</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Objetivo</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--gain)' }}>Longo prazo</span>
          </div>
        </div>

        {/* Personal data */}
        <Card>
          <SettingsRow icon="manage_accounts" label="Dados pessoais" onPress={() => router.push('/profile/personal')} border={false} />
        </Card>

        {/* Investor profile */}
        <div>
          <SectionLabel label="Perfil de investidor" />
          <Card>
            <SettingsRow icon="local_fire_department" label="Perfil de risco" value="Moderado" onPress={() => router.push('/auth/risk')} />
            <SettingsRow icon="schedule" label="Horizonte temporal" value="5–10 anos" onPress={() => router.push('/auth/objective')} />
            <SettingsRow icon="target" label="Objetivo" value="Longo prazo" onPress={() => router.push('/auth/objective')} />
            <SettingsRow icon="sell" label="Setores" value="Tech, Saúde" onPress={() => router.push('/auth/sectors')} border={false} />
          </Card>
        </div>

        {/* Investment plan */}
        <div>
          <SectionLabel label="Plano de investimento" />
          <Card>
            <SettingsRow icon="account_balance_wallet" label="Plano ativo" value="250 €/Mensal" onPress={() => router.push('/auth/plan-set')} border={false} />
          </Card>
        </div>

        {/* Import / Export */}
        <div>
          <SectionLabel label="Portfólio" />
          <Card>
            <SettingsRow icon="description" label="Importar CSV" value="Importar" onPress={() => {}} />
            <SettingsRow icon="upload_file" label="Exportar dados" onPress={() => router.push('/profile/export')} />
            <SettingsRow icon="link" label="Ligar corretora" border={false} />
          </Card>
        </div>

        {/* Account */}
        <div>
          <SectionLabel label="Conta" />
          <Card>
            <SettingsRow icon="lock" label="Segurança" onPress={() => router.push('/profile/security')} />
            <SettingsRow icon="settings" label="Definições" onPress={() => {}} border={false} />
          </Card>
        </div>

        {/* Sign out */}
        <button onClick={signOut} style={{ background: 'var(--loss-container)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, color: 'var(--loss)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Terminar sessão
        </button>

      </div>

      <BottomNav />
    </div>
  );
}
