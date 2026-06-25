'use client';

import { useEffect, useState } from 'react';

const WEEKDAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const MIN_AGE = 18;

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function maxDob() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setFullYear(d.getFullYear() - MIN_AGE);
  return d;
}

function isoFromDigits(digits: string, lang: 'pt' | 'en'): string | null {
  if (digits.length !== 8) return null;
  const day = lang === 'pt' ? +digits.slice(0, 2) : +digits.slice(2, 4);
  const month = lang === 'pt' ? +digits.slice(2, 4) : +digits.slice(0, 2);
  const year = +digits.slice(4, 8);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  if (year < 1900) return null;
  return toISO(year, month - 1, day);
}

function digitsFromIso(iso: string, lang: 'pt' | 'en') {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return lang === 'pt' ? `${d}${m}${y}` : `${m}${d}${y}`;
}

function formatDigits(digits: string, lang: 'pt' | 'en') {
  const a = lang === 'pt' ? digits.slice(0, 2) : digits.slice(0, 2);
  const b = digits.slice(2, 4);
  const c = digits.slice(4, 8);
  return [a, b, c].filter(Boolean).join('/');
}

export default function DatePicker({
  label, value, onChange, placeholder, lang, confirmLabel, errorText, ageErrorText,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder: string;
  lang: 'pt' | 'en';
  confirmLabel: string;
  errorText?: string;
  ageErrorText?: string;
}) {
  const [digits, setDigits] = useState(digitsFromIso(value, lang));
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const max = maxDob();
  const initial = value ? new Date(value) : max;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [picked, setPicked] = useState(value);

  useEffect(() => {
    setDigits(digitsFromIso(value, lang));
  }, [value, lang]);

  const weekdays = lang === 'pt' ? WEEKDAYS_PT : WEEKDAYS_EN;
  const months = lang === 'pt' ? MONTHS_PT : MONTHS_EN;

  const field = {
    display: 'flex', alignItems: 'center', gap: 9,
    background: 'var(--surface-low)', border: `1px solid ${error ? 'var(--loss)' : 'var(--card-border)'}`,
    borderRadius: 'var(--radius-md)', padding: '0 13px',
  } as const;

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
    setDigits(raw);

    if (raw.length < 8) {
      setError('');
      onChange('');
      return;
    }

    const iso = isoFromDigits(raw, lang);
    if (!iso) {
      setError(errorText ?? 'Data inválida.');
      onChange('');
      return;
    }
    if (new Date(iso) > max) {
      setError(ageErrorText ?? `Tem de ter pelo menos ${MIN_AGE} anos.`);
      onChange('');
      return;
    }
    setError('');
    onChange(iso);
  }

  function openDialog() {
    const d = value ? new Date(value) : max;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setPicked(value);
    setOpen(true);
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const viewIsAtOrAfterMaxMonth = viewYear === max.getFullYear() ? viewMonth >= max.getMonth() : viewYear > max.getFullYear();

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    if (y > max.getFullYear() || (y === max.getFullYear() && m > max.getMonth())) { y = max.getFullYear(); m = max.getMonth(); }
    setViewMonth(m);
    setViewYear(y);
  }

  function confirm() {
    if (!picked) return;
    setOpen(false);
    setDigits(digitsFromIso(picked, lang));
    setError('');
    onChange(picked);
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-variant)', marginBottom: 6 }}>{label}</div>
      <div style={field}>
        <span onClick={openDialog} className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)', cursor: 'pointer' }}>calendar_month</span>
        <input
          value={formatDigits(digits, lang)}
          onChange={handleTextChange}
          placeholder={placeholder}
          inputMode="numeric"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '13px 0', fontSize: 15, fontVariantNumeric: 'tabular-nums', color: 'var(--on-surface)', fontFamily: 'inherit' }}
        />
        <span onClick={openDialog} className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)', cursor: 'pointer' }}>expand_more</span>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--loss)', marginTop: 6 }}>{error}</div>}

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: 'var(--surface-lowest)', borderRadius: 'var(--radius-2xl)', padding: 20, boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 4 }}>
              <button type="button" onClick={() => shiftMonth(-12)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>keyboard_double_arrow_left</span>
              </button>
              <button type="button" onClick={() => shiftMonth(-1)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
              </button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{months[viewMonth]} {viewYear}</div>
              <button type="button" disabled={viewIsAtOrAfterMaxMonth} onClick={() => shiftMonth(1)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: viewIsAtOrAfterMaxMonth ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', opacity: viewIsAtOrAfterMaxMonth ? 0.35 : 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
              </button>
              <button type="button" disabled={viewIsAtOrAfterMaxMonth} onClick={() => shiftMonth(12)} style={{ width: 34, height: 34, border: 'none', background: 'var(--surface-high)', borderRadius: 'var(--radius-md)', cursor: viewIsAtOrAfterMaxMonth ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)', opacity: viewIsAtOrAfterMaxMonth ? 0.35 : 1 }}>
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
                const disabled = new Date(viewYear, viewMonth, d) > max;
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
              onClick={confirm}
              disabled={!picked}
              style={{ marginTop: 16, width: '100%', background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 'var(--radius-lg)', padding: 15, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: picked ? 1 : 0.6 }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
