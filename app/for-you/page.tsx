'use client';

import { useApp } from '@/lib/context';
import BottomNav from '@/components/ui/BottomNav';

const ARTICLES = [
  { tag: 'Análise', icon: 'monitoring', title: 'BCE mantém taxas: impacto no seu portfólio em 3 pontos', time: '5 min', date: 'Hoje' },
  { tag: 'Educação', icon: 'school', title: 'O que é um ETF? Guia completo para investidores iniciantes', time: '8 min', date: 'Ontem' },
  { tag: 'Mercado', icon: 'trending_up', title: 'Nvidia supera expectativas: NVDA sobe 12% após resultados', time: '3 min', date: 'Há 2 dias' },
];

const EN_ARTICLES = [
  { tag: 'Analysis', icon: 'monitoring', title: 'ECB holds rates: impact on your portfolio in 3 points', time: '5 min', date: 'Today' },
  { tag: 'Education', icon: 'school', title: 'What is an ETF? Complete guide for beginner investors', time: '8 min', date: 'Yesterday' },
  { tag: 'Market', icon: 'trending_up', title: 'Nvidia beats expectations: NVDA up 12% after earnings', time: '3 min', date: '2 days ago' },
];

export default function ForYouPage() {
  const { lang } = useApp();
  const articles = lang === 'pt' ? ARTICLES : EN_ARTICLES;

  return (
    <div className="phone-shell">
      <div className="top-bar">
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--primary)' }}>
          {lang === 'pt' ? 'Para Si' : 'For You'}
        </div>
        <button style={{ background: 'var(--surface-high)', border: 'none', borderRadius: 'var(--radius-full)', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>search</span>
        </button>
      </div>

      <div className="screen-content">
        {/* Featured */}
        <div style={{ margin: '16px 20px 0', padding: 24, background: 'linear-gradient(135deg, var(--primary-strong) 0%, #0040a2 100%)', borderRadius: 'var(--radius-2xl)', color: '#fff', boxShadow: '0 8px 32px rgba(0,82,204,0.35)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 8 }}>
            {lang === 'pt' ? 'Em Destaque' : 'Featured'}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginBottom: 12 }}>
            {lang === 'pt' ? 'O seu perfil Conservador em 2024: o que funcionou?' : 'Your Conservative profile in 2024: what worked?'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: 0.8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>schedule</span>
            {lang === 'pt' ? '6 min · Personalizado para si' : '6 min · Personalized for you'}
          </div>
        </div>

        <div className="section-header">{lang === 'pt' ? 'Artigos Recentes' : 'Recent Articles'}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px' }}>
          {articles.map((a, i) => (
            <div key={i} style={{ background: 'var(--surface-lowest)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--card-border)', padding: 16, cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <span className="material-symbols-outlined icf" style={{ fontSize: 24, color: 'var(--primary-strong)' }}>{a.icon}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--primary)', background: 'var(--primary-container)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>{a.tag}</span>
                  <span style={{ fontSize: 11, color: 'var(--outline)' }}>{a.date}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginBottom: 6 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--outline)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>{a.time}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 20 }} />
      </div>

      <BottomNav />
    </div>
  );
}
