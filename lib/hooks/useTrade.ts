'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getHolding, upsertHolding, updateHolding, deleteHolding } from '@/lib/db/holdings';
import { insertTransaction } from '@/lib/db/transactions';
import { getUser } from '@/lib/hooks/useUser';

export function useTrade(onDone?: () => void) {
  const [saving, setSaving] = useState(false);

  async function confirmTrade(
    mode: 'buy' | 'sell',
    ticker: string,
    shares: string,
    avgPrice: string,
    tradeDate: string,
    time: string,
    errorLabel: string,
    onError: (msg: string) => void,
    afterDone?: () => void,
  ) {
    const unitsNum = parseFloat(shares.replace(',', '.'));
    const priceNum = parseFloat(avgPrice.replace(',', '.'));
    if (!unitsNum || unitsNum <= 0 || !priceNum || priceNum <= 0) {
      onError(errorLabel);
      return;
    }

    setSaving(true);
    const u = await getUser();
    if (!u) { setSaving(false); return; }
    const supabase = createClient();

    const [hh, mm] = time.split(':').map(Number);
    const executedAt = new Date(tradeDate);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) executedAt.setHours(hh, mm);
    const amount = unitsNum * priceNum;

    await insertTransaction(supabase, {
      user_id: u.id, ticker, type: mode, units: unitsNum, price: priceNum, amount, executed_at: executedAt.toISOString(),
    });

    const holding = await getHolding(supabase, u.id, ticker);

    if (mode === 'buy') {
      if (holding) {
        const newUnits = holding.units + unitsNum;
        const newAvg = (holding.units * holding.avg_price + unitsNum * priceNum) / newUnits;
        await updateHolding(supabase, u.id, ticker, { units: newUnits, avg_price: newAvg });
      } else {
        await upsertHolding(supabase, u.id, ticker, unitsNum, priceNum);
      }
    } else if (holding) {
      const newUnits = holding.units - unitsNum;
      if (newUnits <= 0) {
        await deleteHolding(supabase, u.id, ticker);
      } else {
        await updateHolding(supabase, u.id, ticker, { units: newUnits });
      }
    }

    sessionStorage.removeItem('rec-etag');
    setSaving(false);
    onDone?.();
    afterDone?.();
  }

  return { saving, confirmTrade };
}
