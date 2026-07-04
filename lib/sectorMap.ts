/**
 * lib/sectorMap.ts
 *
 * Mapeia strings de indústria (Finnhub/GICS) para os sectores internos do Portify,
 * e calcula a pontuação de correspondência sectorial para as recomendações.
 */

export type PortifySector =
  | 'technology'
  | 'healthcare'
  | 'financials'
  | 'consumer_discretionary'
  | 'consumer_staples'
  | 'industrials'
  | 'energy'
  | 'utilities'
  | 'materials'
  | 'real_estate'
  | 'communication_services'
  | 'other';

const SECTOR_MAP: Record<string, PortifySector> = {
  // Technology
  'Technology':                    'technology',
  'Software':                      'technology',
  'Semiconductors':                'technology',
  'Electronic Technology':         'technology',
  'Information Technology':        'technology',
  'Tech':                          'technology',
  // Healthcare
  'Health Technology':             'healthcare',
  'Health Services':               'healthcare',
  'Healthcare':                    'healthcare',
  'Pharmaceuticals':               'healthcare',
  'Biotechnology':                 'healthcare',
  'Medical Devices':               'healthcare',
  // Financials
  'Finance':                       'financials',
  'Financial':                     'financials',
  'Financials':                    'financials',
  'Banks':                         'financials',
  'Insurance':                     'financials',
  // Consumer Discretionary
  'Consumer Cyclical':             'consumer_discretionary',
  'Consumer Discretionary':        'consumer_discretionary',
  'Retail Trade':                  'consumer_discretionary',
  'Autos':                         'consumer_discretionary',
  // Consumer Staples
  'Consumer Defensive':            'consumer_staples',
  'Consumer Staples':              'consumer_staples',
  'Food & Beverage':               'consumer_staples',
  // Industrials
  'Industrials':                   'industrials',
  'Industrial Conglomerates':      'industrials',
  'Producer Manufacturing':        'industrials',
  'Transportation':                'industrials',
  // Energy
  'Energy':                        'energy',
  'Oil & Gas':                     'energy',
  'Mineral Energy':                'energy',
  // Utilities
  'Utilities':                     'utilities',
  'Electric Utilities':            'utilities',
  // Materials
  'Basic Materials':               'materials',
  'Materials':                     'materials',
  'Chemicals':                     'materials',
  'Metals & Mining':               'materials',
  // Real Estate
  'Real Estate':                   'real_estate',
  // Communication Services
  'Communication Services':        'communication_services',
  'Communications':                'communication_services',
  'Telecom':                       'communication_services',
};

export function mapSector(raw: string | undefined | null): PortifySector {
  if (!raw) return 'other';
  return SECTOR_MAP[raw] ?? 'other';
}

/**
 * Returns 0–100 score: 100 if asset sector is in preferredSectors,
 * 50 if preferredSectors is empty (neutral), 0 if not preferred.
 */
export function sectorMatchScore(
  sector: PortifySector,
  preferredSectors: string[],
): number {
  if (preferredSectors.length === 0) return 50;
  return preferredSectors.includes(sector) ? 100 : 0;
}
