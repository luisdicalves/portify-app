'use client';

import { useRouter } from 'next/navigation';

export default function ExportPage() {
  const router = useRouter();

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 24px 8px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer', display: 'block', marginBottom: 8 }}>arrow_back_ios_new</span>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Exportar dados</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Icon + description */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--primary)' }}>upload_file</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>
            Exporta o histórico completo de transações e posições do teu portfólio.
          </div>
        </div>

        {/* Format buttons */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 8 }}>Formato</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ flex: 1, background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>CSV</button>
            <button style={{ flex: 1, background: 'var(--surface-high)', color: 'var(--on-surface)', border: 'none', borderRadius: 'var(--radius-md)', padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>PDF</button>
          </div>
        </div>

        {/* Period */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, background: 'var(--surface-low)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Período</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600 }}>
            Todo o tempo
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <button style={{ background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 21 }}>download</span>
          Transferir
        </button>
      </div>
    </div>
  );
}
