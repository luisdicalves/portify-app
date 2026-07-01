/**
 * lib/sectorMap.ts
 *
 * Mapeia o campo finnhubIndustry (devolvido pelo Finnhub /stock/profile2)
 * para os ids de setor do Portify, usados no onboarding e no motor de
 * recomendações.
 *
 * Setores do Portify:
 *   tech | health | finance | energy | consumer | industry | realestate | materials | comms
 *
 * Fonte das strings Finnhub:
 *   https://finnhub.io/docs/api/company-profile2
 *   Campo finnhubIndustry — valores reais observados na API
 */

export type PortifySector =
  | 'tech'
  | 'health'
  | 'finance'
  | 'energy'
  | 'consumer'
  | 'industry'
  | 'realestate'
  | 'materials'
  | 'comms'
  | 'other'

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento principal finnhubIndustry → PortifySector
// Todas as strings em lowercase para comparação case-insensitive
// ─────────────────────────────────────────────────────────────────────────────

const SECTOR_MAP: Record<string, PortifySector> = {
  // ── Tecnologia ────────────────────────────────────────────────
  'technology':                        'tech',
  'software':                          'tech',
  'software—application':              'tech',
  'software—infrastructure':           'tech',
  'semiconductors':                    'tech',
  'semiconductor equipment & materials': 'tech',
  'computer hardware':                 'tech',
  'electronic components':             'tech',
  'electronics & computer distribution': 'tech',
  'information technology services':   'tech',
  'internet content & information':    'tech',
  'internet retail':                   'tech',
  'scientific & technical instruments':'tech',
  'data storage':                      'tech',
  'artificial intelligence':           'tech',

  // ── Saúde ─────────────────────────────────────────────────────
  'healthcare':                        'health',
  'health care':                       'health',
  'pharmaceuticals':                   'health',
  'drug manufacturers—general':        'health',
  'drug manufacturers—specialty & generic': 'health',
  'biotechnology':                     'health',
  'medical devices':                   'health',
  'medical instruments & supplies':    'health',
  'diagnostics & research':            'health',
  'health information services':       'health',
  'healthcare plans':                  'health',
  'medical care facilities':           'health',
  'pharmaceutical retailers':          'health',
  'hospitals':                         'health',

  // ── Finanças ──────────────────────────────────────────────────
  'financial services':                'finance',
  'banks—diversified':                 'finance',
  'banks—regional':                    'finance',
  'insurance—diversified':             'finance',
  'insurance—life':                    'finance',
  'insurance—property & casualty':     'finance',
  'insurance—specialty':               'finance',
  'insurance—reinsurance':             'finance',
  'asset management':                  'finance',
  'capital markets':                   'finance',
  'financial data & stock exchanges':  'finance',
  'credit services':                   'finance',
  'mortgage finance':                  'finance',
  'insurance brokers':                 'finance',
  'shell companies':                   'finance',

  // ── Energia ───────────────────────────────────────────────────
  'energy':                            'energy',
  'oil & gas integrated':              'energy',
  'oil & gas e&p':                     'energy',
  'oil & gas midstream':               'energy',
  'oil & gas refining & marketing':    'energy',
  'oil & gas drilling':                'energy',
  'oil & gas equipment & services':    'energy',
  'utilities—regulated electric':      'energy',
  'utilities—regulated gas':           'energy',
  'utilities—regulated water':         'energy',
  'utilities—renewable':               'energy',
  'utilities—independent power producers': 'energy',
  'utilities—diversified':             'energy',
  'solar':                             'energy',
  'thermal coal':                      'energy',
  'uranium':                           'energy',

  // ── Consumo ───────────────────────────────────────────────────
  'consumer cyclical':                 'consumer',
  'consumer defensive':                'consumer',
  'retail':                            'consumer',
  'specialty retail':                  'consumer',
  'department stores':                 'consumer',
  'discount stores':                   'consumer',
  'grocery stores':                    'consumer',
  'food distribution':                 'consumer',
  'packaged foods':                    'consumer',
  'beverages—non-alcoholic':           'consumer',
  'beverages—alcoholic':               'consumer',
  'beverages—brewers':                 'consumer',
  'beverages—wineries & distilleries': 'consumer',
  'household & personal products':     'consumer',
  'personal services':                 'consumer',
  'apparel retail':                    'consumer',
  'apparel manufacturing':             'consumer',
  'footwear & accessories':            'consumer',
  'home improvement retail':           'consumer',
  'furnishings, fixtures & appliances':'consumer',
  'restaurants':                       'consumer',
  'travel services':                   'consumer',
  'lodging':                           'consumer',
  'resorts & casinos':                 'consumer',
  'gambling':                          'consumer',
  'leisure':                           'consumer',
  'auto manufacturers':                'consumer',
  'auto parts':                        'consumer',
  'auto & truck dealerships':          'consumer',
  'recreational vehicles':             'consumer',
  'tobacco':                           'consumer',
  'education & training services':     'consumer',

  // ── Indústria ─────────────────────────────────────────────────
  'industrials':                       'industry',
  'aerospace & defense':               'industry',
  'airlines':                          'industry',
  'airports & air services':           'industry',
  'trucking':                          'industry',
  'railroads':                         'industry',
  'marine shipping':                   'industry',
  'integrated freight & logistics':    'industry',
  'specialty industrial machinery':    'industry',
  'farm & heavy construction machinery': 'industry',
  'tools & accessories':               'industry',
  'electrical equipment & parts':      'industry',
  'waste management':                  'industry',
  'engineering & construction':        'industry',
  'infrastructure operations':         'industry',
  'rental & leasing services':         'industry',
  'staffing & employment services':    'industry',
  'security & protection services':    'industry',
  'consulting services':               'industry',
  'conglomerates':                     'industry',
  'industrial distribution':           'industry',
  'metal fabrication':                 'industry',
  'pollution & treatment controls':    'industry',
  'paper & paper products':            'industry',
  'packaging & containers':            'industry',
  'printing services':                 'industry',

  // ── Imobiliário ───────────────────────────────────────────────
  'real estate':                       'realestate',
  'reit—diversified':                  'realestate',
  'reit—industrial':                   'realestate',
  'reit—office':                       'realestate',
  'reit—retail':                       'realestate',
  'reit—residential':                  'realestate',
  'reit—healthcare facilities':        'realestate',
  'reit—hotel & motel':                'realestate',
  'reit—specialty':                    'realestate',
  'reit—mortgage':                     'realestate',
  'real estate services':              'realestate',
  'real estate—development':           'realestate',
  'real estate—diversified':           'realestate',

  // ── Materiais ─────────────────────────────────────────────────
  'basic materials':                   'materials',
  'specialty chemicals':               'materials',
  'chemicals':                         'materials',
  'agricultural inputs':               'materials',
  'gold':                              'materials',
  'silver':                            'materials',
  'copper':                            'materials',
  'other industrial metals & mining':  'materials',
  'other precious metals & mining':    'materials',
  'steel':                             'materials',
  'aluminum':                          'materials',
  'coking coal':                       'materials',
  'lumber & wood production':          'materials',
  'building materials':                'materials',

  // ── Comunicações ──────────────────────────────────────────────
  'communication services':            'comms',
  'telecom services':                  'comms',
  'telecommunications':                'comms',
  'media':                             'comms',
  'entertainment':                     'comms',
  'broadcasting':                      'comms',
  'electronic gaming & multimedia':    'comms',
  'publishing':                        'comms',
  'advertising agencies':              'comms',
  'marketing services':                'comms',
};

// ─────────────────────────────────────────────────────────────────────────────
// Labels PT para exibição na UI
// ─────────────────────────────────────────────────────────────────────────────

export const SECTOR_LABELS_PT: Record<PortifySector, string> = {
  tech:        'Tecnologia',
  health:      'Saúde',
  finance:     'Finanças',
  energy:      'Energia',
  consumer:    'Consumo',
  industry:    'Indústria',
  realestate:  'Imobiliário',
  materials:   'Materiais',
  comms:       'Comunicações',
  other:       'Outros',
};

// ─────────────────────────────────────────────────────────────────────────────
// Funções
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte um finnhubIndustry string para o id de setor do Portify.
 * Devolve 'other' se não houver mapeamento.
 */
export function mapSector(finnhubIndustry: string | null | undefined): PortifySector {
  if (!finnhubIndustry) return 'other';
  const key = finnhubIndustry.toLowerCase().trim();
  return SECTOR_MAP[key] ?? fuzzyMatch(key) ?? 'other';
}

function fuzzyMatch(key: string): PortifySector | null {
  for (const [mapKey, sector] of Object.entries(SECTOR_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return sector;
  }
  return null;
}

/** Devolve o label em PT para um dado PortifySector. */
export function sectorLabel(sector: PortifySector): string {
  return SECTOR_LABELS_PT[sector] ?? 'Outros';
}

/** Verifica se um ativo é relevante para os setores preferidos do utilizador. */
export function isSectorMatch(
  assetSector: PortifySector,
  preferredSectors: string[],
): boolean {
  if (assetSector === 'other') return false;
  return preferredSectors.includes(assetSector);
}

/**
 * Score de match entre o setor do ativo e os setores preferidos.
 *   100 — setor preferido
 *    35 — setor não preferido
 *     0 — setor 'other'
 */
export function sectorMatchScore(
  assetSector: PortifySector,
  preferredSectors: string[],
): number {
  if (assetSector === 'other') return 0;
  return isSectorMatch(assetSector, preferredSectors) ? 100 : 35;
}
