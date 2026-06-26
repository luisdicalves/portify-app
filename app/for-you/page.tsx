'use client';

import { useApp } from '@/lib/context';
import { useDict } from '@/lib/dict';
import BottomNav from '@/components/ui/BottomNav';

export default function ForYouPage() {
  const { lang } = useApp();
  const t = useDict(lang);

  return (
    <div className="phone-shell" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px 12px', borderBottom: '1px solid var(--card-border)' }}>
        <span className="material-symbols-outlined icf" style={{ fontSize: 22, color: 'var(--primary)' }}>auto_awesome</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{t.navFor}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', minHeight: 150,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          background: 'linear-gradient(150deg, var(--primary-strong), color-mix(in oklab, var(--primary-strong) 60%, #000))',
        }}>
          <div style={{ padding: 16 }}>
            <span style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 'var(--radius-xs)' }}>{t.markets}</span>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, lineHeight: 1.25, marginTop: 10 }}>{t.newsTitle}</div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 6 }}>{t.readMore}</div>
          </div>
        </div>

        <div style={{ background: 'var(--surface-lowest)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--gain-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--gain)' }}>trending_up</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t.insightDivTitle}</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{t.insightDivSub}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
            <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>savings</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t.insightPlanTitle}</div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{t.insightPlanSub}</div>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
