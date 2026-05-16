import { describe, expect, it } from 'vitest';
import { deriveAccountBalances, deriveHoldings, derivePortfolioSummary, findFxRate, makeSnapshotFromSummary } from '../miniprogram/services/portfolio';
import { seedData } from '../miniprogram/services/seed';
import type { AppData } from '../miniprogram/types';

function dataCopy(): AppData {
  return JSON.parse(JSON.stringify(seedData)) as AppData;
}

describe('portfolio ledger', () => {
  it('derives holdings from buy transactions', () => {
    const data = dataCopy();
    const holdings = deriveHoldings(data);
    const aapl = holdings.find((holding) => holding.instrumentId === 'instrument_aapl');

    expect(aapl?.units).toBe('32.0000');
    expect(aapl?.marketValue.amount).toBe('5969.2800');
  });

  it('keeps account cash separate from investment holdings', () => {
    const data = dataCopy();
    const broker = deriveAccountBalances(data).find((balance) => balance.account.id === 'account_us_broker');
    const summary = derivePortfolioSummary(data);

    expect(broker?.cash.amount).toBe('12000.0000');
    expect(broker?.holdingsValue.amount).toBe('5969.2800');
    expect(summary.assetTypeDistribution.some((item) => item.label === '现金')).toBe(true);
    expect(summary.assetTypeDistribution.some((item) => item.label === '股票/ETF')).toBe(true);
  });

  it('handles sells by reducing units and cost basis proportionally', () => {
    const data = dataCopy();
    data.transactions.push({
      id: 'tx_sell_half',
      accountId: 'account_us_broker',
      type: 'sell',
      tradeDate: '2099-01-01',
      amount: { amount: '3000.0000', currency: 'USD' },
      instrumentId: 'instrument_aapl',
      units: '16.0000',
      createdAt: '2099-01-01T00:00:00.000Z',
      updatedAt: '2099-01-01T00:00:00.000Z'
    });

    const aapl = deriveHoldings(data).find((holding) => holding.instrumentId === 'instrument_aapl');

    expect(aapl?.units).toBe('16.0000');
    expect(aapl?.cost.amount).toBe('3200.5000');
  });

  it('calculates assets, liabilities, and net worth in home currency', () => {
    const data = dataCopy();
    const summary = derivePortfolioSummary(data);

    expect(Number(summary.totalAssets.amount)).toBeGreaterThan(190000);
    expect(summary.totalLiabilities.amount).toBe('4200.0000');
    expect(Number(summary.netWorth.amount)).toBeCloseTo(Number(summary.totalAssets.amount) - 4200, 2);
  });

  it('does not count overpaid liability accounts as negative debt', () => {
    const data = dataCopy();
    data.transactions.push({
      id: 'tx_overpay_card',
      accountId: 'account_credit',
      type: 'liability_payment',
      tradeDate: '2099-01-01',
      amount: { amount: '5000.0000', currency: 'CNY' },
      createdAt: '2099-01-01T00:00:00.000Z',
      updatedAt: '2099-01-01T00:00:00.000Z'
    });

    const summary = derivePortfolioSummary(data);

    expect(summary.totalLiabilities.amount).toBe('0.0000');
    expect(summary.netWorth.amount).toBe(summary.totalAssets.amount);
  });

  it('uses inverse FX rate when only the opposite pair exists', () => {
    const rate = findFxRate([{ base: 'USD', quote: 'CNY', rate: '7.1200', asOf: '2026-01-01', source: 'manual', stale: false }], 'CNY', 'USD');
    expect(Number(rate)).toBeCloseTo(0.1404, 4);
  });

  it('rebuilds a snapshot from the current summary', () => {
    const data = dataCopy();
    const snapshot = makeSnapshotFromSummary(data);

    expect(snapshot.netWorth.currency).toBe('CNY');
    expect(snapshot.byAccount.length).toBe(data.accounts.length);
    expect(snapshot.byAssetType.length).toBeGreaterThan(0);
  });
});
