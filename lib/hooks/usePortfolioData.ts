'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getHoldings } from '@/lib/db/holdings';
import { getTransactions, deleteTransaction as dbDeleteTransaction } from '@/lib/db/transactions';
import { fetchQuote, type Quote } from '@/lib/marketApi';
import { getUser } from '@/lib/hooks/useUser';
import { buildPortfolioState } from '@/lib/portfolio/portfolioState';
import { holdingsToPortfolioInput, quotesToLatestQuotes, logPortfolioStateWarnings, DEFAULT_CURRENCY } from '@/lib/portfolio/portfolioStateAdapters';
import type { Transaction } from '@/components/ui/TransactionCard';

const eur = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const POSITIVE_TYPES = new Set(['dividend', 'deposit', 'interest']);
const LABEL_BY_TYPE: Record<string, string> = {
  deposit: 'Depósito',
  interest: 'Juros',
  withholding_tax: 'WHT',
  interest_tax: 'Imposto',
};

export type Asset = {
  ticker: string;
  letter: string;
  units: number;
  value: number;
  cost: number;
  dayChange: number;
  gainPct: number;
  gain: boolean;
};

export type Dividend = { ticker: string; letter: string; amount: number; executed_at: string };

export function usePortfolioData(userId: string | undefined, lang: string) {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getClient() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [assets, setAssets]               = useState<Asset[]>([]);
  const [loading, setLoading]             = useState(true);
  const [txns, setTxns]                   = useState<Transaction[]>([]);
  const [dividends, setDividends]         = useState<Dividend[]>([]);
  const [cashSettings, setCashSettings]   = useState({ uninvestedCash: 0, freeFundsAnnualRatePct: 0 });

  async function loadHoldings() {
    setLoading(true);
    const u = await getUser();
    if (!u) { setLoading(false); return; }

    const holdings = await getHoldings(getClient(), u.id);
    const quotes = await Promise.all(holdings.map(h => fetchQuote(h.ticker)));
    const quoteByTicker: Record<string, Quote | undefined> = {};
    holdings.forEach((h, i) => { quoteByTicker[h.ticker] = quotes[i] ?? undefined; });

    const state = buildPortfolioState({
      holdings: holdingsToPortfolioInput(holdings),
      transactions: [],
      latestQuotes: quotesToLatestQuotes(quoteByTicker),
      userCurrency: DEFAULT_CURRENCY,
    });
    logPortfolioStateWarnings('portfolio', state.dataQualityWarnings);
    const holdingStateByTicker = new Map(state.holdings.map(h => [h.ticker, h]));

    setAssets(holdings.map(h => {
      const quote = quoteByTicker[h.ticker];
      const hs = holdingStateByTicker.get(h.ticker);
      const value = hs?.marketValue ?? h.units * h.avg_price;
      const cost = hs?.costBasis ?? h.units * h.avg_price;
      const gainPct = hs?.unrealizedGainPct ?? 0;
      return {
        ticker: h.ticker,
        letter: h.ticker.charAt(0),
        units: h.units,
        value,
        cost,
        dayChange: h.units * (quote?.change ?? 0),
        gainPct,
        gain: gainPct >= 0,
      };
    }));
    setLoading(false);
  }

  async function loadTransactions() {
    const u = await getUser();
    if (!u) return;
    const { data } = await getTransactions(getClient(), u.id);

    setTxns((data ?? []).map(row => {
      const gain = row.type === 'buy' ? false : POSITIVE_TYPES.has(row.type) || row.amount >= 0;
      const hasTicker = row.ticker != null && row.ticker !== '';
      const ticker = row.ticker ?? '';
      const executedAt = row.executed_at ?? new Date().toISOString();
      return {
        id: row.id,
        sym: hasTicker ? ticker : LABEL_BY_TYPE[row.type] ?? row.type,
        avatar: hasTicker ? ticker.charAt(0) : '',
        type: row.type as Transaction['type'],
        dateText: new Date(executedAt).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        executedAt,
        total: `${gain ? '+' : '-'}${eur.format(Math.abs(row.amount))} €`,
        totalColor: gain ? 'var(--gain)' : 'var(--on-surface)',
        units: row.units != null ? String(row.units) : undefined,
        unitVal: row.price != null ? `${eur.format(row.price)} €` : undefined,
        note: row.notes ?? undefined,
      };
    }));

    setDividends(
      (data ?? [])
        .filter(row => row.type === 'dividend' && row.ticker != null)
        .map(row => ({ ticker: row.ticker!, letter: row.ticker!.charAt(0), amount: row.amount, executed_at: row.executed_at ?? new Date().toISOString() }))
    );
  }

  async function removeTxn(id: string) {
    await dbDeleteTransaction(getClient(), id);
    setTxns(prev => prev.filter(tx => tx.id !== id));
  }

  async function loadCashSettings() {
    const u = await getUser();
    if (!u) return;
    const { data } = await getClient()
      .from('profiles').select('uninvested_cash, free_funds_annual_rate_pct').eq('id', u.id).single();
    if (data) setCashSettings({ uninvestedCash: data.uninvested_cash ?? 0, freeFundsAnnualRatePct: data.free_funds_annual_rate_pct ?? 0 });
  }

  useEffect(() => {
    if (!userId) return;
    loadHoldings(); loadTransactions(); loadCashSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { assets, loading, txns, dividends, cashSettings, removeTxn };
}
