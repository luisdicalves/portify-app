'use client';

import { useState } from 'react';

const WEEKDAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function DatePicker({
  label, value, onChange, placeholder, lang, confirmLabel,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder: string;
  lang: 'pt' | 'en';
  confirmLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const initial = value ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [picked, setPicked] = useState(value);

  const weekdays = lang === 'pt' ? WEEKDAYS_PT : WEEKDAYS_EN;
  const months = lang === 'pt' ? MONTHS_PT : MONTHS_EN;

  const field = {
    display: 'flex', alignItems: 'center', gap: 9,
    background: 'var(--surface-low)', border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)', padding: '0 13px',
  } as const;

  const display = value
    ? new Date(value).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB')
    : placeholder;

  function open_() {
    const d = value ? new Date(value) : new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setPicked(value);
    setOpen(true);
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{label}</div>
      <div onClick={open_} style={{ ...field, cursor: 'pointer' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>calendar_month</span>
        <span style={{ flex: 1, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: value ? 'var(--on-surface)' : 'var(--outline)' }}>{display}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>expand_more</span>
      </div>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: 20, boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 4 }}>
              <button type="button" onClick={() => shiftMonth(-12)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>keyboard_double_arrow_left</span>
              </button>
              <button type="button" onClick={() => shiftMonth(-1)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
              </button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{months[viewMonth]} {viewYear}</div>
              <button type="button" onClick={() => shiftMonth(1)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
              </button>
              <button type="button" onClick={() => shiftMonth(12)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>keyboard_double_arrow_right</span>
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
                const isPicked = picked === iso;
                return (
                  <button key={i} type="button" onClick={() => setPicked(iso)} style={{
                    width: 36, height: 36, border: 'none', borderRadius: 'var(--radius-full)', cursor: 'pointer',
                    background: isPicked ? 'var(--primary-strong)' : 'transparent',
                    color: isPicked ? '#fff' : 'var(--on-surface)',
                    fontSize: 13, fontWeight: isPicked ? 700 : 500, fontFamily: 'inherit',
                  }}>{d}</button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => { if (picked) { onChange(picked); setOpen(false); } }}
              style={{ marginTop: 16, width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
