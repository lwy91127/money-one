import type { AppData } from '../types';
import { daysAgoISO, nowISO } from '../utils/date';

const now = nowISO();

export const seedData: AppData = {
  settings: {
    homeCurrency: 'CNY',
    hideAmounts: false,
    cloudSyncEnabled: false
  },
  syncMeta: {
    enabled: false,
    status: 'local_only',
    pendingOperationCount: 0
  },
  assetTypes: [
    {
      id: 'type_cash',
      name: '现金',
      category: 'asset',
      color: '#2f7d57',
      icon: 'wallet',
      valuationMethod: 'cash',
      includeInNetWorth: true,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'type_stock',
      name: '股票/ETF',
      category: 'asset',
      color: '#355c9f',
      icon: 'chart-line',
      valuationMethod: 'market',
      includeInNetWorth: true,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'type_fund',
      name: '基金/理财',
      category: 'asset',
      color: '#9a6a2f',
      icon: 'chart-pie',
      valuationMethod: 'annualized',
      includeInNetWorth: true,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'type_liability',
      name: '负债',
      category: 'liability',
      color: '#a6453b',
      icon: 'minus-circle',
      valuationMethod: 'manual',
      includeInNetWorth: true,
      sortOrder: 4,
      createdAt: now,
      updatedAt: now
    }
  ],
  accountGroups: [
    {
      id: 'group_daily',
      name: '日常资金',
      color: '#2f7d57',
      sortOrder: 1,
      includeInSummary: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'group_invest',
      name: '投资账户',
      color: '#355c9f',
      sortOrder: 2,
      includeInSummary: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'group_liability',
      name: '负债',
      color: '#a6453b',
      sortOrder: 3,
      includeInSummary: true,
      createdAt: now,
      updatedAt: now
    }
  ],
  accounts: [
    {
      id: 'account_cash',
      groupId: 'group_daily',
      assetTypeId: 'type_cash',
      name: '现金与活期',
      currency: 'CNY',
      category: 'asset',
      archived: false,
      includeInSummary: true,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'account_us_broker',
      groupId: 'group_invest',
      assetTypeId: 'type_stock',
      name: '美股账户',
      currency: 'USD',
      category: 'asset',
      archived: false,
      includeInSummary: true,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'account_fund',
      groupId: 'group_invest',
      assetTypeId: 'type_fund',
      name: '稳健理财',
      currency: 'CNY',
      category: 'asset',
      archived: false,
      includeInSummary: true,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'account_credit',
      groupId: 'group_liability',
      assetTypeId: 'type_liability',
      name: '信用卡',
      currency: 'CNY',
      category: 'liability',
      archived: false,
      includeInSummary: true,
      sortOrder: 4,
      createdAt: now,
      updatedAt: now
    }
  ],
  instruments: [
    {
      id: 'instrument_aapl',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      kind: 'stock',
      currency: 'USD',
      market: 'NASDAQ',
      assetTypeId: 'type_stock',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'instrument_cashplus',
      name: '现金增强理财',
      kind: 'fund',
      currency: 'CNY',
      assetTypeId: 'type_fund',
      annualizedYield: '0.0280',
      createdAt: now,
      updatedAt: now
    }
  ],
  transactions: [
    {
      id: 'tx_cash_open',
      accountId: 'account_cash',
      type: 'deposit',
      tradeDate: daysAgoISO(170),
      amount: { amount: '86000.0000', currency: 'CNY' },
      note: '期初余额',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'tx_broker_cash',
      accountId: 'account_us_broker',
      type: 'deposit',
      tradeDate: daysAgoISO(130),
      amount: { amount: '12000.0000', currency: 'USD' },
      note: '入金',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'tx_aapl_buy',
      accountId: 'account_us_broker',
      type: 'buy',
      tradeDate: daysAgoISO(120),
      amount: { amount: '6400.0000', currency: 'USD' },
      instrumentId: 'instrument_aapl',
      units: '32.0000',
      price: { amount: '200.0000', currency: 'USD' },
      fee: { amount: '1.0000', currency: 'USD' },
      note: '买入 AAPL',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'tx_fund_open',
      accountId: 'account_fund',
      type: 'deposit',
      tradeDate: daysAgoISO(95),
      amount: { amount: '65000.0000', currency: 'CNY' },
      note: '理财本金',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'tx_fund_interest',
      accountId: 'account_fund',
      type: 'interest',
      tradeDate: daysAgoISO(30),
      amount: { amount: '168.0000', currency: 'CNY' },
      note: '理财收益',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'tx_card_charge',
      accountId: 'account_credit',
      type: 'liability_charge',
      tradeDate: daysAgoISO(20),
      amount: { amount: '4200.0000', currency: 'CNY' },
      note: '本期账单',
      createdAt: now,
      updatedAt: now
    }
  ],
  quotes: [
    {
      instrumentId: 'instrument_aapl',
      symbol: 'AAPL',
      price: { amount: '186.5400', currency: 'USD' },
      asOf: daysAgoISO(1),
      source: 'mock',
      stale: true
    }
  ],
  fxRates: [
    {
      base: 'USD',
      quote: 'CNY',
      rate: '7.1200',
      asOf: daysAgoISO(1),
      source: 'mock',
      stale: true
    },
    {
      base: 'HKD',
      quote: 'CNY',
      rate: '0.9100',
      asOf: daysAgoISO(1),
      source: 'mock',
      stale: true
    }
  ],
  snapshots: []
};
