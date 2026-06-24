'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import Fab from '@/components/ui/Fab';
import { createClient } from '@/lib/supabase/client';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sem feed de preços de mercado: simula um ganho estável (não aleatório a cada render) a partir do ticker.
function simulatedGainPct(ticker: string) {
  const hash = ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ((hash % 41) - 15) / 100; // entre -15% e +25%
}

type Asset = {
  ticker: string;
  letter: string;
  units: number;
  value: number;
  gainPct: number;
  gain: boolean;
};

export default function PortfolioPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  async function fetchHoldings() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: holdings } = await supabase
      .from('holdings')
      .select('ticker, units, avg_price')
      .eq('user_id', user.id);

    const mapped: Asset[] = (holdings ?? []).map(h => {
      const gainPct = simulatedGainPct(h.ticker);
      const cost = h.units * h.avg_price;
      return {
        ticker: h.ticker,
        letter: h.ticker.charAt(0),
        units: h.units,
        value: cost * (1 + gainPct),
        gainPct,
        gain: gainPct >= 0,
      };
    });

    setAssets(mapped);
    setLoading(false);
  }

  useEffect(() => { fetchHoldings(); }, []);

  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Portfólio</span>
        <button onClick={() => router.push('/portfolio/add')} style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary-strong)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add</span>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Total value */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Valor estimado</div>
          <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{hidden ? '•••••• €' : `${eur.format(totalValue)} €`}</div>
        </div>

        {/* Asset cards */}
        {loading && <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', padding: 24 }}>A carregar...</div>}
        {!loading && assets.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', padding: 24 }}>Sem posições registadas.</div>
        )}
        {assets.map(a => (
          <div key={a.ticker} onClick={() => router.push(`/portfolio/${a.ticker}`)} style={{ cursor: 'pointer', background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {a.letter}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{a.ticker}</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.units} ações</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••••• €' : `${eur.format(a.value)} €`}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: a.gain ? 'var(--gain)' : 'var(--loss)' }}>{a.gain ? '+' : ''}{(a.gainPct * 100).toFixed(2)}%</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>chevron_right</span>
          </div>
        ))}
      </div>

      <Fab actions={[
        { icon: hidden ? 'visibility' : 'visibility_off', label: hidden ? 'Mostrar' : 'Ocultar', onClick: () => setHidden(h => !h) },
        { icon: 'refresh', label: 'Atualizar', onClick: fetchHoldings, color: 'var(--primary)' },
      ]} />

      <BottomNav />
    </div>
  );
}
