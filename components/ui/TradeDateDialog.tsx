'use client';

import { useState } from 'react';

const WEEKDAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function TradeDateDialog({
  value, onConfirm, onClose, lang, confirmLabel,
}: {
  value: string;
  onConfirm: (iso: string) => void;
  onClose: () => void;
  lang: 'pt' | 'en';
  confirmLabel: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const initial = value ? new Date(value) : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [picked, setPicked] = useState(value);

  const weekdays = lang === 'pt' ? WEEKDAYS_PT : WEEKDAYS_EN;
  const months = lang === 'pt' ? MONTHS_PT : MONTHS_EN;

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const viewIsAtOrAfterCurrentMonth = viewYear === today.getFullYear() ? viewMonth >= today.getMonth() : viewYear > today.getFullYear();

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth())) { y = today.getFullYear(); m = today.getMonth(); }
    setViewMonth(m);
    setViewYear(y);
  }

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl)', padding: 20, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button type="button" onClick={() => shiftMonth(-1)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{months[viewMonth]} {viewYear}</div>
          <button type="button" disabled={viewIsAtOrAfterCurrentMonth} onClick={() => shiftMonth(1)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: viewIsAtOrAfterCurrentMonth ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', opacity: viewIsAtOrAfterCurrentMonth ? 0.35 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, justifyItems: 'center', marginBottom: 6 }}>
          {weekdays.map((w, i) => (
            <span key={i} style={{ width: 36, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--on-surface-variant)' }}>{w}</span>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, justifyItems: 'center' }}>
          {cells.map((d, i) => {
            if (d === null) return <span key={i} style={{ width: 36, height: 36 }} />;
            const iso = toISO(viewYear, viewMonth, d);
            const disabled = new Date(viewYear, viewMonth, d) > today;
            const isPicked = picked === iso;
            return (
              <button key={i} type="button" disabled={disabled} onClick={() => setPicked(iso)} style={{
                width: 36, height: 36, border: 'none', borderRadius: 'var(--radius-full)', cursor: disabled ? 'default' : 'pointer',
                background: isPicked ? 'var(--primary-strong)' : 'transparent',
                color: disabled ? 'var(--outline-variant)' : isPicked ? '#fff' : 'var(--on-surface)',
                opacity: disabled ? 0.5 : 1,
                fontSize: 13, fontWeight: isPicked ? 700 : 500, fontFamily: 'inherit',
              }}>{d}</button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => picked && onConfirm(picked)}
          disabled={!picked}
          style={{ marginTop: 16, width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: picked ? 1 : 0.6 }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
