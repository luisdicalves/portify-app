'use client';

import { ReactNode } from 'react';

export default function Card({
  padding = 14,
  elevated = false,
  onClick,
  children,
}: {
  padding?: number | string;
  elevated?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        background: 'var(--surface-lowest)',
        border: elevated ? 'none' : '1px solid var(--card-border)',
        borderRadius: 'var(--radius-panel)',
        padding,
        boxShadow: elevated ? 'var(--shadow)' : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  );
}
