'use client';

import { useRouter } from 'next/navigation';

const BENEFITS = [
  'Acompanha o progresso do teu objetivo financeiro',
  'Recebe uma projeção personalizada por IA',
  'Sabe exatamente quanto e quando investir',
];

export default function PlanAskPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 24px 8px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer', display: 'block', marginBottom: 8 }}>
          arrow_back_ios_new
        </span>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, textWrap: 'pretty' as never }}>Queres definir um plano?</div>
        <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 4, textWrap: 'pretty' as never }}>Um plano ajuda-te a saber quanto investir e quando atinges os teus objetivos.</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 20px', display: 'flex', flexDirection: 'column' }}>
        {/* Benefits card */}
        <div style={{ background: 'var(--gain-container)', border: '1px solid var(--gain)', borderRadius: 'var(--radius-lg)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {BENEFITS.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--gain-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined icf" style={{ fontSize: 17, color: '#fff' }}>check</span>
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{b}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 20 }} />

        <button onClick={() => router.push('/auth/plan-set')}
          style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Sim, quero definir um plano
        </button>
        <button onClick={() => router.push('/auth/summary')}
          style={{ background: 'transparent', border: 'none', color: 'var(--on-surface-variant)', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 14, marginTop: 4 }}>
          Saltar este passo
        </button>
      </div>
    </div>
  );
}
