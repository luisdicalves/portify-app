interface StepHeaderProps {
  step: number;
  total: number;
  back: () => void;
  title: string;
  sub?: string;
}

export function StepHeader({ step, total, back, title, sub }: StepHeaderProps) {
  return (
    <>
      {/* Back arrow row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 4px' }}>
        <span onClick={back} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>
          arrow_back_ios_new
        </span>
      </div>

      {/* Progress + labels */}
      <div style={{ padding: '4px 24px 8px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 5, borderRadius: 'var(--radius-full)',
              background: i < step ? 'var(--primary)' : 'var(--surface-highest)',
              transition: 'background 0.25s',
              display: 'block',
            }} />
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>
          Passo {step}/{total}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', textWrap: 'pretty' as never }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 6, textWrap: 'pretty' as never }}>
            {sub}
          </div>
        )}
      </div>
    </>
  );
}
