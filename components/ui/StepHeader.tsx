interface StepHeaderProps {
  step: number;
  total: number;
  back: () => void;
  title: string;
  sub?: string;
}

export function StepHeader({ step, total, back, title, sub }: StepHeaderProps) {
  return (
    <div style={{ padding: '20px 24px 0' }}>
      <button onClick={back} style={{ background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)' }}>arrow_back_ios_new</span>
      </button>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            height: 4, flex: 1, borderRadius: 'var(--radius-full)',
            background: i < step ? 'var(--primary-strong)' : 'var(--outline-variant)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 6 }}>
        Passo {step} de {total}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</div>
      {sub && <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}
