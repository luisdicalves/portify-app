import { pt } from './pt';
import { en } from './en';

export type Lang = 'pt' | 'en';
export type Dict = typeof pt;

export { pt, en };

export function useDict(lang: Lang) {
  return lang === 'pt' ? pt : en;
}
