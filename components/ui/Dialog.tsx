'use client';

import { useEffect, useRef } from 'react';
import Button from './Button';

// Dialog — PDS-561..567. Blocking modal requiring an explicit decision
// before the user can continue (distinct from Sheet, which is dismissible).
// Canonical home for every DLG-* reference in the SSP registry (e.g.
// DLG-002 Discard Unsaved Changes, DLG-070 Final Account Closure).
export default function Dialog({
  open,
  onClose,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** variant 'critical' — PDS-564: destructive confirmation shares Button's critical role. */
  primaryAction: { label: string; onClick: () => void; variant?: 'primary' | 'critical' };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // PDS-566 — return-focus contract: on close, focus returns to the control
  // that opened the Dialog.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
    } else {
      previouslyFocused.current?.focus?.();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        style={{
          width: '100%', maxWidth: 360,
          background: 'var(--surface-lowest)', borderRadius: 'var(--radius-panel)',
          padding: 20, boxShadow: 'var(--shadow)',
        }}
      >
        <div id="dialog-title" style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div id="dialog-description" style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5, marginBottom: 18 }}>{description}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {secondaryAction && (
            <Button variant="tertiary" fullWidth={false} onClick={() => { secondaryAction.onClick(); onClose(); }}>
              {secondaryAction.label}
            </Button>
          )}
          <Button variant={primaryAction.variant ?? 'primary'} fullWidth={false} onClick={() => { primaryAction.onClick(); onClose(); }}>
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
