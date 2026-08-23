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
      style={{
        background: 'var(--surface-lowest)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius-lg)',
        padding,
        boxShadow: elevated ? 'var(--shadow)' : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  );
}
