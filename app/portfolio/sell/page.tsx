'use client';

import { useRouter } from 'next/navigation';

export default function SellPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Vender</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Amount display */}
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginBottom: 8 }}>Valor</div>
          <div style={{ fontSize: 44, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>8.493,00 €</div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 8 }}>
            Disponível: <b style={{ color: 'var(--on-surface)' }}>35 ações</b>
          </div>
        </div>

        {/* Order type */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, background: 'var(--surface-low)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Tipo de ordem</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Mercado</span>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => router.push('/portfolio')}
          style={{ background: 'var(--loss-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Confirmar venda
        </button>
      </div>
    </div>
  );
}
