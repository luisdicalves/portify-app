export const RISK_OPTIONS = [
  { id: 'very_conservative', label: 'Muito conservador', desc: 'Aceito retornos baixos. Zero perdas.',       icon: 'shield' },
  { id: 'conservative',      label: 'Conservador',       desc: 'Prefiro proteger o capital.',                icon: 'security' },
  { id: 'moderate',          label: 'Moderado',          desc: 'Equilíbrio entre risco e retorno.',          icon: 'balance' },
  { id: 'aggressive',        label: 'Agressivo',         desc: 'Aceito volatilidade por mais retorno.',      icon: 'local_fire_department' },
  { id: 'very_aggressive',   label: 'Muito agressivo',   desc: 'Maximizar retorno. Aceito perdas elevadas.', icon: 'bolt' },
] as const;

export const OBJECTIVE_OPTIONS = [
  { id: 'emergency_fund',  label: 'Fundo de emergência',  desc: 'Reserva segura e acessível.',                    icon: 'health_and_safety' },
  { id: 'short_purchase',  label: 'Compra a curto prazo', desc: 'Casa, carro ou viagem (menos de 3 anos).',       icon: 'speed' },
  { id: 'income',          label: 'Rendimento passivo',   desc: 'Gerar rendimento com dividendos regulares.',     icon: 'payments' },
  { id: 'wealth_growth',   label: 'Crescimento',          desc: 'Fazer crescer o meu património.',                icon: 'trending_up' },
  { id: 'retirement',      label: 'Reforma',              desc: 'Construir capital para a reforma.',              icon: 'beach_access' },
  { id: 'legacy',          label: 'Legado',               desc: 'Deixar património para os meus herdeiros.',      icon: 'family_restroom' },
] as const;

export const SECTOR_OPTIONS = [
  { id: 'tech',       label: 'Tecnologia',   icon: 'computer' },
  { id: 'health',     label: 'Saúde',        icon: 'health_and_safety' },
  { id: 'finance',    label: 'Finanças',     icon: 'account_balance' },
  { id: 'energy',     label: 'Energia',      icon: 'bolt' },
  { id: 'consumer',   label: 'Consumo',      icon: 'shopping_bag' },
  { id: 'industry',   label: 'Indústria',    icon: 'factory' },
  { id: 'realestate', label: 'Imobiliário',  icon: 'apartment' },
  { id: 'materials',  label: 'Materiais',    icon: 'diamond' },
  { id: 'comms',      label: 'Comunicações', icon: 'cell_tower' },
] as const;
