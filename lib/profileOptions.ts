import type { SelectOption } from '@/components/ui/SelectList';

export const EXPERIENCE_OPTIONS: SelectOption[] = [
  { id: 'none',         label: 'Nenhuma',     desc: 'Nunca investi.',                               icon: 'person' },
  { id: 'beginner',     label: 'Iniciante',   desc: 'Investi pontualmente.',                        icon: 'school' },
  { id: 'intermediate', label: 'Intermédio',  desc: 'Invisto regularmente há 1–3 anos.',            icon: 'trending_up' },
  { id: 'experienced',  label: 'Experiente',  desc: 'Invisto há mais de 3 anos.',                   icon: 'workspace_premium' },
  { id: 'professional', label: 'Profissional',desc: 'Trabalho ou trabalhei na área financeira.',    icon: 'business_center' },
];

export const REACTION_OPTIONS: SelectOption[] = [
  { id: 'sell_all',  label: 'Vendo tudo',  desc: 'Prefiro sair e evitar mais perdas.',            icon: 'trending_down' },
  { id: 'sell_some', label: 'Vendo parte', desc: 'Reduzo a exposição para ficar mais tranquilo.',  icon: 'remove_circle' },
  { id: 'hold',      label: 'Aguardo',     desc: 'Não faço nada. Espero que o mercado recupere.',  icon: 'pause_circle' },
  { id: 'buy_more',  label: 'Compro mais', desc: 'É uma oportunidade. Aumento a minha posição.',   icon: 'add_shopping_cart' },
];

export const FINANCIAL_OPTIONS: SelectOption[] = [
  { id: 'unstable',    label: 'Instável',    desc: 'Rendimento variável ou incerto.',          icon: 'warning' },
  { id: 'stable',      label: 'Estável',     desc: 'Rendimento fixo, despesas cobertas.',      icon: 'check_circle' },
  { id: 'comfortable', label: 'Confortável', desc: 'Poupo regularmente sem esforço.',          icon: 'savings' },
  { id: 'wealthy',     label: 'Elevada',     desc: 'Grande capacidade de poupança mensal.',    icon: 'diamond' },
];

export const LIQUIDITY_OPTIONS: SelectOption[] = [
  { id: 'critical', label: 'É crítico',  desc: 'Posso precisar do dinheiro a qualquer momento.', icon: 'emergency' },
  { id: 'possible', label: 'É possível', desc: 'Pode acontecer em situação de emergência.',       icon: 'warning_amber' },
  { id: 'unlikely', label: 'Improvável', desc: 'Tenho reservas. Dificilmente vou precisar.',      icon: 'check' },
  { id: 'never',    label: 'Nunca',      desc: 'Este dinheiro é intocável até ao fim do prazo.',  icon: 'lock' },
];

export const LIQUIDITY_CRITICAL_WARNING = 'Se podes precisar deste dinheiro a qualquer momento, considera uma conta poupança em vez de investimento. O mercado pode estar em baixa quando precisares de sacar.';

export const RISK_OPTIONS: SelectOption[] = [
  { id: 'very_conservative', label: 'Muito conservador', desc: 'Aceito retornos baixos. Zero perdas.',       icon: 'shield' },
  { id: 'conservative',      label: 'Conservador',       desc: 'Prefiro proteger o capital.',                icon: 'security' },
  { id: 'moderate',          label: 'Moderado',          desc: 'Equilíbrio entre risco e retorno.',          icon: 'balance' },
  { id: 'aggressive',        label: 'Agressivo',         desc: 'Aceito volatilidade por mais retorno.',      icon: 'local_fire_department' },
  { id: 'very_aggressive',   label: 'Muito agressivo',   desc: 'Maximizar retorno. Aceito perdas elevadas.', icon: 'bolt' },
];

export const OBJECTIVE_OPTIONS: SelectOption[] = [
  { id: 'emergency_fund',  label: 'Fundo de emergência',  desc: 'Reserva segura e acessível.',                    icon: 'health_and_safety' },
  { id: 'short_purchase',  label: 'Compra a curto prazo', desc: 'Casa, carro ou viagem (menos de 3 anos).',       icon: 'speed' },
  { id: 'income',          label: 'Rendimento passivo',   desc: 'Gerar rendimento com dividendos regulares.',     icon: 'payments' },
  { id: 'wealth_growth',   label: 'Crescimento',          desc: 'Fazer crescer o meu património.',                icon: 'trending_up' },
  { id: 'retirement',      label: 'Reforma',              desc: 'Construir capital para a reforma.',              icon: 'beach_access' },
  { id: 'legacy',          label: 'Legado',               desc: 'Deixar património para os meus herdeiros.',      icon: 'family_restroom' },
];

export const SECTOR_OPTIONS: SelectOption[] = [
  { id: 'tech',       label: 'Tecnologia',   icon: 'computer' },
  { id: 'health',     label: 'Saúde',        icon: 'health_and_safety' },
  { id: 'finance',    label: 'Finanças',     icon: 'account_balance' },
  { id: 'energy',     label: 'Energia',      icon: 'bolt' },
  { id: 'consumer',   label: 'Consumo',      icon: 'shopping_bag' },
  { id: 'industry',   label: 'Indústria',    icon: 'factory' },
  { id: 'realestate', label: 'Imobiliário',  icon: 'apartment' },
  { id: 'materials',  label: 'Materiais',    icon: 'diamond' },
  { id: 'comms',      label: 'Comunicações', icon: 'cell_tower' },
];
