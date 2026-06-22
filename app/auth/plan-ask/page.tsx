'use client';

import { useRouter } from 'next/navigation';

export default function PlanAskPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ justifyContent: 'space-between', padding: '0 24px' }}>
      <div style={{ paddingTop: 20 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)' }}>arrow_back_ios_new</span>
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32 }}>
        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 100, height: 100, borderRadius: 28, background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined icf" style={{ fontSize: 52, color: 'var(--primary-strong)' }}>savings</span>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Queres definir um plano?</div>
          <div style={{ fontSize: 15, color: 'var(--on-surface-variant)', marginTop: 8, lineHeight: 1.6 }}>Um plano ajuda-te a saber quanto investir e quando atinges os teus objetivos.</div>
        </div>

        {/* Benefits */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            'Acompanha o progresso do teu objetivo financeiro',
            'Recebe uma projeção personalizada por IA',
            'Sabe exatamente quanto e quando investir',
          ].map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span className="material-symbols-outlined icf" style={{ fontSize: 20, color: 'var(--gain)', flex: 'none', marginTop: 1 }}>check_circle</span>
              <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 48 }}>
        <button className="btn-primary" onClick={() => router.push('/auth/plan-set')}>
          Sim, quero definir um plano
        </button>
        <button className="btn-secondary" onClick={() => router.push('/auth/summary')}>
          Saltar este passo
        </button>
      </div>
    </div>
  );
}
