import { describe, expect, it } from 'vitest';

const { normalizeFx, normalizeQuote } = require('../cloudfunctions/syncQuotes/alphaVantage');
const { eastmoneySecId, quoteFrom, yahooSymbol } = require('../cloudfunctions/syncQuotes/providers');
const { matchesRequestedKind, normalizeKind, uniqueItems } = require('../cloudfunctions/searchInstrument/providers');

describe('Alpha Vantage normalizers', () => {
  it('normalizes global quote payloads', () => {
    const quote = normalizeQuote(
      { instrumentId: 'instrument_aapl', symbol: 'AAPL', currency: 'USD' },
      {
        'Global Quote': {
          '01. symbol': 'AAPL',
          '05. price': '186.5400',
          '07. latest trading day': '2026-05-07'
        }
      }
    );

    expect(quote.price.amount).toBe('186.5400');
    expect(quote.asOf).toBe('2026-05-07');
    expect(quote.stale).toBe(false);
  });

  it('normalizes daily quote payloads', () => {
    const quote = normalizeQuote(
      { instrumentId: 'instrument_ibm', symbol: 'IBM', currency: 'USD' },
      {
        'Meta Data': { '2. Symbol': 'IBM' },
        'Time Series (Daily)': {
          '2026-05-06': { '4. close': '145.23' },
          '2026-05-05': { '4. close': '144.10' }
        }
      }
    );

    expect(quote.price.amount).toBe('145.2300');
    expect(quote.asOf).toBe('2026-05-06');
    expect(quote.stale).toBe(false);
  });

  it('marks quote payloads stale when the provider returns a limit or error object', () => {
    const quote = normalizeQuote({ instrumentId: 'instrument_ibm', symbol: 'IBM', currency: 'USD' }, { Note: 'rate limited' });

    expect(quote.stale).toBe(true);
    expect(quote.price.amount).toBe('0.0000');
  });

  it('normalizes FX payloads', () => {
    const fx = normalizeFx('USD', 'CNY', {
      'Realtime Currency Exchange Rate': {
        '5. Exchange Rate': '7.123456',
        '6. Last Refreshed': '2026-05-06 12:00:00'
      }
    });

    expect(fx.rate).toBe('7.1235');
    expect(fx.stale).toBe(false);
  });
});

describe('market data provider helpers', () => {
  it('maps mainland and Hong Kong symbols to provider-specific quote codes', () => {
    expect(eastmoneySecId({ symbol: '600519', currency: 'CNY' })).toBe('1.600519');
    expect(eastmoneySecId({ symbol: '000001', currency: 'CNY' })).toBe('0.000001');
    expect(eastmoneySecId({ symbol: '700', currency: 'HKD' })).toBe('116.00700');

    expect(yahooSymbol({ symbol: '600519', currency: 'CNY' })).toBe('600519.SS');
    expect(yahooSymbol({ symbol: '000001', currency: 'CNY' })).toBe('000001.SZ');
    expect(yahooSymbol({ symbol: '700', currency: 'HKD' })).toBe('0700.HK');
  });

  it('normalizes generic provider quotes', () => {
    const quote = quoteFrom(
      { instrumentId: 'preview_AAPL', symbol: 'AAPL', currency: 'USD' },
      'twelve_data',
      '287.44',
      '2026-05-08',
      { close: '287.44' }
    );

    expect(quote.price.amount).toBe('287.4400');
    expect(quote.source).toBe('twelve_data');
    expect(quote.stale).toBe(false);
  });

  it('deduplicates search results and maps instrument kinds', () => {
    expect(normalizeKind('Mutual Fund')).toBe('fund');
    expect(normalizeKind('ETF')).toBe('etf');
    expect(
      uniqueItems([
        { symbol: 'AAPL', name: 'Apple', kind: 'stock', currency: 'USD' },
        { symbol: 'AAPL', name: 'Apple Inc.', kind: 'stock', currency: 'USD' },
        { symbol: 'BABA', name: 'Alibaba', kind: 'stock', currency: 'USD' }
      ])
    ).toHaveLength(2);
  });

  it('separates stock and fund search results', () => {
    expect(matchesRequestedKind({ kind: 'fund', source: 'eastmoney_fund' }, 'fund')).toBe(true);
    expect(matchesRequestedKind({ kind: 'stock', source: 'eastmoney' }, 'fund')).toBe(false);
    expect(matchesRequestedKind({ kind: 'stock', source: 'eastmoney' }, 'stock')).toBe(true);
    expect(matchesRequestedKind({ kind: 'fund', source: 'eastmoney_fund' }, 'stock')).toBe(false);
  });
});
