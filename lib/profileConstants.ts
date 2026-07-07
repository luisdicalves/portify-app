// Shared plan constants — alinhados com os valores do onboarding (plan-set)
export const PLAN_AMOUNT_VALUES = [50, 100, 250, 500, 1000, 2000];
export const PLAN_AMOUNTS       = ['50 €', '100 €', '250 €', '500 €', '1.000 €', '2.000 €'];
export const PLAN_PERIODS       = ['Semanal', 'Quinzenal', 'Mensal', 'Trimestral', 'Semestral', 'Anual'];
export const PLAN_FREQUENCIES   = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'] as const;

// Nº de contribuições por ano para cada periodicidade — usado para compor
// juros ao ritmo certo (calcFV/calcPMT/calcYears).
export const PLAN_FREQUENCY_PERIODS_PER_YEAR: Record<(typeof PLAN_FREQUENCIES)[number], number> = {
  weekly:     52,
  biweekly:   26,
  monthly:    12,
  quarterly:  4,
  semiannual: 2,
  annual:     1,
};
