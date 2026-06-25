'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';

export default function SellPage() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Vender</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginBottom: 8 }}>Valor</div>
          <div style={{ fontSize: 44, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>8.493,00 €</div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 8 }}>
            Disponível: <b style={{ color: 'var(--on-surface)' }}>35 ações</b>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, background: 'var(--surface-low)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Tipo de ordem</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Mercado</span>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => setConfirming(true)}
          style={{ background: 'var(--loss-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Confirmar venda
        </button>
      </div>

      {confirming && (
        <div onClick={() => setConfirming(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 38, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--surface-highest)', margin: '0 auto 16px' }} />
            <div style={{ width: 50, height: 50, borderRadius: 'var(--radius-full)', background: 'var(--loss-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--loss)' }}>warning</span>
            </div>
            <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Confirmar venda</div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.45, marginBottom: 18 }}>
              Vais vender 35 ações por um valor estimado de 8.493,00 €. Esta ação não pode ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirming(false)} style={{ flex: 1, background: 'var(--surface-high)', color: 'var(--on-surface)', border: 'none', borderRadius: 'var(--radius-md)', padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={() => router.push('/portfolio')} style={{ flex: 1, background: 'var(--loss-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Vender
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
