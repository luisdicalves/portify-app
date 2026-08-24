'use client';

import { ReactNode } from 'react';

// Alert — PDS-171..178. Base intents are exactly information/warning/critical/
// neutral (PDS-172) — "positive" is explicitly NOT a generic Alert variant and
// is intentionally left out here (a constrained 5th value exists per
// PDS-607..609, but no genuine screen-level all-clear usage exists in this
// app yet, so it isn't added speculatively).
type AlertIntent = 'information' | 'warning' | 'critical' | 'neutral';

const INTENT_STYLE: Record<AlertIntent, { bg: string; border: string; fg: string }> = {
  information: { bg: 'var(--information-container)', border: 'var(--information)', fg: 'var(--information-strong)' },
  warning: { bg: 'var(--warning-container)', border: 'var(--warning)', fg: 'var(--warning-strong)' },
  critical: { bg: 'var(--critical-container)', border: 'var(--critical)', fg: 'var(--critical)' },
  neutral: { bg: 'var(--surface-container)', border: 'var(--card-border)', fg: 'var(--on-surface-variant)' },
};

// Alert base anatomy — PDS-174: icon/status -> title -> description -> optional action.
export default function Alert({
  intent,
  icon,
  title,
  description,
  action,
  testId,
}: {
  intent: AlertIntent;
  icon?: string;
  title?: string;
  description: string | ReactNode;
  action?: { label: string; onClick: () => void };
  testId?: string;
}) {
  const { bg, border, fg } = INTENT_STYLE[intent];
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        background: bg, border: `1px solid ${border}`,
        borderRadius: 'var(--radius-lg)', padding: '10px 14px',
      }}
    >
      {icon && (
        <span className="material-symbols-outlined icf" style={{ fontSize: 16, color: fg, flexShrink: 0, marginTop: 1 }}>
          {icon}
        </span>
      )}
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontSize: 13, fontWeight: 700, color: fg, marginBottom: 2 }}>{title}</div>}
        <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{description}</div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: fg, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
