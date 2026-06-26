'use client';

export type Transaction = {
  id: string;
  sym: string;
  avatar: string;
  type: 'buy' | 'sell' | 'dividend';
  dateText: string;
  total: string;
  totalColor: string;
  units?: string;
  unitVal?: string;
};

const BADGE_STYLE: Record<Transaction['type'], { bg: string; color: string }> = {
  buy: { bg: 'var(--primary-container)', color: 'var(--primary)' },
  sell: { bg: 'var(--loss-container)', color: 'var(--loss)' },
  dividend: { bg: 'var(--gain-container)', color: 'var(--gain)' },
};

export default function TransactionCard({
  tx, expanded, onToggle, onDelete, labels,
}: {
  tx: Transaction;
  expanded: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  labels: { buy: string; sell: string; dividend: string; units: string; unitVal: string; delete: string };
}) {
  const badge = BADGE_STYLE[tx.type];
  const badgeLabel = tx.type === 'buy' ? labels.buy : tx.type === 'sell' ? labels.sell : labels.dividend;
  const hasUnits = tx.units != null && tx.unitVal != null;

  return (
    <div onClick={onToggle} style={{ cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 44, height: 44, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>{tx.avatar}</div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{tx.sym}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: badge.bg, color: badge.color }}>{badgeLabel}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>{tx.dateText}</div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none', marginLeft: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tx.totalColor, fontVariantNumeric: 'tabular-nums' }}>{tx.total}</div>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)', transition: 'transform .2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>expand_more</span>
      </div>

      {expanded && (
        <div style={{ paddingTop: 13, marginTop: 13, borderTop: '1px solid var(--hairline)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }} onClick={e => e.stopPropagation()}>
          {hasUnits && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{labels.units}</div>
              <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{tx.units}</div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
            {hasUnits && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{labels.unitVal}</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{tx.unitVal}</div>
              </div>
            )}
            {onDelete && (
              <button onClick={onDelete} title={labels.delete} style={{ flex: 'none', width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--loss-container)', color: 'var(--loss)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>delete</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
