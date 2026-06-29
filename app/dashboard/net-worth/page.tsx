'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Holding = { ticker: string; units: number; avg_price: number };

async function fetchPrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(ticker)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.price === 'number' ? data.price : null;
  } catch {
    return null;
  }
}

export default function NetWorthPage() {
  const router = useRouter();
  const { lang } = useApp();
  const t = useDict(lang);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: holdings } = await supabase
        .from('holdings')
        .select('ticker, units, avg_price')
        .eq('user_id', user.id);

      const hs: Holding[] = holdings ?? [];
      const prices = await Promise.all(hs.map(h => fetchPrice(h.ticker)));
      const value = hs.reduce((sum, h, i) => sum + h.units * (prices[i] ?? h.avg_price), 0);
      setTotalValue(value);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <span onClick={() => router.back()} className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface)', cursor: 'pointer' }}>arrow_back_ios_new</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{t.netWorthTitle}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--primary-strong)', borderRadius: 'var(--radius-lg)', padding: 18, color: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.8 }}>{t.netWorthTitle}</div>
          <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 4 }}>
            {loading ? '—' : `€ ${eur.format(totalValue)}`}
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{t.totalAssets}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : `+${eur.format(totalValue)} €`}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{t.liabilities}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>€ 0,00</div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 14 }}>{t.distribution}</div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
              <span>{t.investments}</span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : `${eur.format(totalValue)} €`}</b>
            </div>
            <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--surface-container)' }}>
              <div style={{ width: loading ? '0%' : '100%', height: '100%', borderRadius: 'var(--radius-full)', background: 'var(--primary)' }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 12 }}>
            {t.netWorthDisclaimer}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
