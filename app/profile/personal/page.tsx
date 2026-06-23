'use client';

import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';

function Row({ icon, label, value, onClick, border = true }: { icon: string; label: string; value?: string; onClick?: () => void; border?: boolean }) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderBottom: border ? '1px solid var(--hairline)' : 'none' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 21, color: 'var(--primary)' }}>{icon}</span>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--on-surface-variant)' }}>
        {value}
        {onClick && <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>}
      </span>
    </div>
  );
}

export default function PersonalPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Perfil</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 16px 100px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 88, height: 88, borderRadius: 'var(--radius-full)', background: 'var(--primary-strong)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>RF</div>
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 'var(--radius-full)', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid var(--bg)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>edit</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Ricardo Ferreira</div>
            <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 2 }}>Membro desde jan 2024</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>trending_up</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Risco</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>Moderado</span>
          </div>
          <div style={{ flex: 1, background: 'var(--surface-low)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--gain)' }}>flag</span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Objetivo</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--gain)' }}>Reforma</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Row icon="manage_accounts" label="Dados pessoais" onClick={() => {}} border={false} />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 6px 8px' }}>Perfil de investidor</div>
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Row icon="local_fire_department" label="Risco" value="Moderado" onClick={() => router.push('/auth/risk')} />
            <Row icon="schedule" label="Horizonte" value="5-10 anos" onClick={() => router.push('/auth/objective')} />
            <Row icon="target" label="Objetivo" value="Reforma" onClick={() => router.push('/auth/objective')} border={false} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 6px 8px' }}>Conta</div>
          <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Row icon="security" label="Segurança" onClick={() => router.push('/profile/security')} />
            <Row icon="upload_file" label="Exportar dados" onClick={() => router.push('/profile/export')} border={false} />
          </div>
        </div>

        <button style={{ background: 'var(--loss-container)', color: 'var(--loss)', border: '1px solid var(--loss)', borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Terminar sessão
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
