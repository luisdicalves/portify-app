'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getHolding, upsertHolding, updateHolding, deleteHolding } from '@/lib/db/holdings';
import { insertTransaction } from '@/lib/db/transactions';
import { fetchQuote, fetchHistory, type Quote, type HistoryPoint } from '@/lib/marketApi';
import { getUser } from '@/lib/hooks/useUser';
import type { RiskReport } from '@/lib/riskScore';

export type Holding = { units: number; avg_price: number };

export function useAssetDetail(ticker: string, userId: string | undefined, lang: string) {
  const [holding, setHolding]           = useState<Holding | null>(null);
  const [quote, setQuote]               = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [history, setHistory]           = useState<HistoryPoint[] | null>(null);
  const [riskReport, setRiskReport]     = useState<RiskReport | null>(null);
  const [riskLoading, setRiskLoading]   = useState(false);
  const [riskRequested, setRiskRequested] = useState(false);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const supabase = createClient();
      setHolding(await getHolding(supabase, userId, ticker));
    })();
  }, [userId, ticker]);

  useEffect(() => {
    setQuoteLoading(true);
    fetchQuote(ticker).then(q => { setQuote(q); setQuoteLoading(false); });
  }, [ticker]);

  useEffect(() => {
    fetchHistory(ticker, 30).then(pts => setHistory(pts));
  }, [ticker]);

  async function loadRiskReport() {
    setRiskRequested(true);
    setRiskLoading(true);
    try {
      const res = await fetch(`/api/risk?symbol=${encodeURIComponent(ticker)}&lang=${lang}`);
      if (!res.ok) throw new Error('risk_failed');
      setRiskReport(await res.json());
    } catch {
      setRiskReport(null);
    } finally {
      setRiskLoading(false);
    }
  }

  async function confirmTrade(
    sheet: 'buy' | 'sell',
    shares: string,
    avgPrice: string,
    tradeDate: string,
    time: string,
    errorLabel: string,
    onError: (msg: string) => void,
    onDone: () => void,
  ) {
    const unitsNum = parseFloat(shares.replace(',', '.'));
    const priceNum = parseFloat(avgPrice.replace(',', '.'));
    if (!unitsNum || unitsNum <= 0 || !priceNum || priceNum <= 0) { onError(errorLabel); return; }

    setSaving(true);
    const u = await getUser();
    if (!u) { setSaving(false); return; }
    const supabase = createClient();

    const [hh, mm] = time.split(':').map(Number);
    const executedAt = new Date(tradeDate);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) executedAt.setHours(hh, mm);
    const amount = unitsNum * priceNum;

    await insertTransaction(supabase, {
      user_id: u.id, ticker, type: sheet, units: unitsNum, price: priceNum, amount, executed_at: executedAt.toISOString(),
    });

    if (sheet === 'buy') {
      if (holding) {
        const newUnits = holding.units + unitsNum;
        const newAvg = (holding.units * holding.avg_price + unitsNum * priceNum) / newUnits;
        await updateHolding(supabase, u.id, ticker, { units: newUnits, avg_price: newAvg });
        setHolding({ units: newUnits, avg_price: newAvg });
      } else {
        await upsertHolding(supabase, u.id, ticker, unitsNum, priceNum);
        setHolding({ units: unitsNum, avg_price: priceNum });
      }
    } else if (holding) {
      const newUnits = holding.units - unitsNum;
      if (newUnits <= 0) {
        await deleteHolding(supabase, u.id, ticker);
        setHolding(null);
      } else {
        await updateHolding(supabase, u.id, ticker, { units: newUnits });
        setHolding({ ...holding, units: newUnits });
      }
    }

    sessionStorage.removeItem('rec-etag');
    setSaving(false);
    onDone();
  }

  return { holding, quote, quoteLoading, history, riskReport, riskLoading, riskRequested, saving, loadRiskReport, confirmTrade };
}
