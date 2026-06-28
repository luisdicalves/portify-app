export function Skeleton({ width = '100%', height = 16, radius = 'var(--radius-md)', style }: { width?: number | string; height?: number | string; radius?: string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)' }}>
      <Skeleton width={40} height={40} radius="var(--radius-full)" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="25%" height={11} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <Skeleton width={60} height={14} />
        <Skeleton width={40} height={11} />
      </div>
    </div>
  );
}

export function SkeletonChart({ height = 110 }: { height?: number }) {
  return <Skeleton width="100%" height={height} radius="var(--radius-md)" />;
}
