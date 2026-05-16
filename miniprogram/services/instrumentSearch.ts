import type { AppData, CurrencyCode, InstrumentSearchResult, Quote } from '../types';
import { callCloudFunction } from './store';

export type MarketCode = 'US' | 'HK' | 'CN';
export type SearchKind = 'stock' | 'fund';

export const marketOptions: Array<{ label: string; value: MarketCode; currency: CurrencyCode }> = [
  { label: '美股', value: 'US', currency: 'USD' },
  { label: '港股', value: 'HK', currency: 'HKD' },
  { label: '沪深', value: 'CN', currency: 'CNY' }
];

export function currencyForMarket(market: MarketCode): CurrencyCode {
  return marketOptions.find((item) => item.value === market)?.currency || 'USD';
}

function matchesKind(item: InstrumentSearchResult, kind?: SearchKind): boolean {
  if (!kind) return true;
  const rawKind = String(item.kind || '').toLowerCase();
  const source = String(item.source || '').toLowerCase();
  if (kind === 'fund') return rawKind.includes('fund') || source.includes('fund');
  return !rawKind.includes('fund') && !source.includes('fund');
}

export function normalizeSearchResults(items: InstrumentSearchResult[], market?: MarketCode, kind?: SearchKind): InstrumentSearchResult[] {
  const targetCurrency = market ? currencyForMarket(market) : '';
  return items
    .filter((item) => item.symbol && item.name)
    .filter((item) => matchesKind(item, kind))
    .map((item) => ({
      symbol: item.symbol.toUpperCase(),
      name: item.name,
      kind: kind || item.kind || 'stock',
      market: item.market || (market === 'US' ? 'US' : market === 'HK' ? 'HK' : market === 'CN' ? 'CN' : 'Global'),
      currency: item.currency || targetCurrency || 'USD',
      source: item.source || 'alpha_vantage'
    }))
    .filter((item) => !targetCurrency || item.currency === targetCurrency || item.source === 'local')
    .slice(0, 12);
}

export function localInstrumentSearch(data: AppData, keyword: string, market?: MarketCode, kind?: SearchKind): InstrumentSearchResult[] {
  const lower = keyword.toLowerCase();
  const targetCurrency = market ? currencyForMarket(market) : '';
  return data.instruments
    .filter((item) => item.symbol?.toLowerCase().includes(lower) || item.name.toLowerCase().includes(lower))
    .filter((item) => !targetCurrency || item.currency === targetCurrency)
    .filter((item) => !kind || item.kind === kind || (kind === 'stock' && item.kind === 'etf'))
    .map((item) => ({
      symbol: item.symbol || item.name,
      name: item.name,
      kind: item.kind,
      market: item.market,
      currency: item.currency,
      source: 'local'
    }));
}

export async function remoteInstrumentSearch(keyword: string, kind?: SearchKind): Promise<InstrumentSearchResult[]> {
  const result = await callCloudFunction<{ items?: InstrumentSearchResult[]; error?: string; rawMessage?: string }>('searchInstrument', {
    keywords: keyword,
    kind
  });
  return result.items || [];
}

export async function queryInstrumentQuote(instrument: InstrumentSearchResult): Promise<Quote | undefined> {
  const result = await callCloudFunction<{ quotes?: Quote[]; errors?: unknown[]; error?: string }>('syncQuotes', {
    symbols: [
      {
        instrumentId: `preview_${instrument.symbol}`,
        symbol: instrument.symbol,
        currency: instrument.currency,
        market: instrument.market,
        kind: instrument.kind,
        source: instrument.source
      }
    ]
  });
  const quote = result.quotes?.[0];
  if (quote && !quote.stale && Number(quote.price.amount) > 0) return quote;
  return undefined;
}
