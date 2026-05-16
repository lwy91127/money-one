import type { Account, AppData, AppSettings, AssetType, Instrument, InstrumentSearchResult, Quote, Transaction } from '../types';
import { makeId, nowISO } from '../utils/date';
import { normalizeDecimalInput } from '../utils/money';
import { seedData } from './seed';

const STORAGE_KEY = 'money_manager_app_data_v1';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canUseWxStorage(): boolean {
  return typeof wx !== 'undefined' && !!wx.getStorageSync;
}

export function loadAppData(): AppData {
  if (!canUseWxStorage()) return clone(seedData);
  const stored = wx.getStorageSync(STORAGE_KEY) as AppData | '';
  if (!stored) {
    const initial = clone(seedData);
    wx.setStorageSync(STORAGE_KEY, initial);
    return initial;
  }
  return stored;
}

export function saveAppData(data: AppData): void {
  if (canUseWxStorage()) {
    wx.setStorageSync(STORAGE_KEY, data);
  }
}

export async function syncAppData(): Promise<AppData> {
  const data = loadAppData();
  if (!data.settings.cloudSyncEnabled) return data;

  try {
    const result = await callCloudFunction<{ data?: AppData; conflicts?: unknown[] }>('syncUserData', { data });
    const syncedData = result.data || data;
    syncedData.settings.cloudSyncEnabled = true;
    syncedData.syncMeta.enabled = true;
    syncedData.syncMeta.status = result.conflicts?.length ? 'conflict' : 'synced';
    syncedData.syncMeta.pendingOperationCount = result.conflicts?.length ? data.syncMeta.pendingOperationCount : 0;
    syncedData.syncMeta.lastSyncedAt = new Date().toISOString();
    saveAppData(syncedData);
    return syncedData;
  } catch (error) {
    data.syncMeta.enabled = true;
    data.syncMeta.status = 'error';
    data.syncMeta.lastError = error instanceof Error ? error.message : '云同步失败';
    saveAppData(data);
    throw error;
  }
}

export function resetAppData(): AppData {
  const initial = clone(seedData);
  saveAppData(initial);
  return initial;
}

export function updateSettings(patch: Partial<AppSettings>): AppData {
  const data = loadAppData();
  data.settings = { ...data.settings, ...patch };
  data.syncMeta.enabled = data.settings.cloudSyncEnabled;
  data.syncMeta.status = data.settings.cloudSyncEnabled ? 'pending' : 'local_only';
  data.syncMeta.pendingOperationCount += 1;
  saveAppData(data);
  return data;
}

export function addTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): AppData {
  const data = loadAppData();
  const timestamp = nowISO();
  data.transactions.unshift({
    ...input,
    id: makeId('tx'),
    createdAt: timestamp,
    updatedAt: timestamp
  });
  data.syncMeta.pendingOperationCount += 1;
  data.syncMeta.status = data.settings.cloudSyncEnabled ? 'pending' : 'local_only';
  saveAppData(data);
  return data;
}

export function addAccount(
  input: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder' | 'archived' | 'includeInSummary'>,
  options: { includeInSummary?: boolean } = {}
): AppData {
  const data = loadAppData();
  const timestamp = nowISO();
  const account: Account = {
    ...input,
    id: makeId('account'),
    archived: false,
    includeInSummary: options.includeInSummary ?? true,
    sortOrder: data.accounts.length + 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  data.accounts.push(account);
  data.syncMeta.pendingOperationCount += 1;
  data.syncMeta.status = data.settings.cloudSyncEnabled ? 'pending' : 'local_only';
  saveAppData(data);
  return data;
}

export function deleteAccount(accountId: string): AppData {
  const data = loadAppData();
  const timestamp = nowISO();
  const account = data.accounts.find((item) => item.id === accountId);
  if (!account) {
    throw new Error('Account not found.');
  }
  account.archived = true;
  account.includeInSummary = false;
  account.updatedAt = timestamp;
  data.transactions = data.transactions.map((tx) =>
    tx.accountId === accountId
      ? {
          ...tx,
          deletedAt: tx.deletedAt || timestamp,
          updatedAt: timestamp
        }
      : tx
  );
  data.syncMeta.pendingOperationCount += 1;
  data.syncMeta.status = data.settings.cloudSyncEnabled ? 'pending' : 'local_only';
  saveAppData(data);
  return data;
}

export function setAccountCashBalance(input: { accountId: string; amount: string; currency?: string; note?: string }): AppData {
  const data = loadAppData();
  const account = data.accounts.find((item) => item.id === input.accountId);
  const normalizedAmount = normalizeDecimalInput(input.amount, { allowZero: true });
  if (!account || !normalizedAmount) {
    throw new Error('Invalid account cash balance input.');
  }
  const timestamp = nowISO();
  data.transactions.unshift({
    id: makeId('tx'),
    accountId: account.id,
    type: 'valuation_adjustment',
    tradeDate: timestamp.slice(0, 10),
    amount: { amount: normalizedAmount, currency: input.currency || account.currency },
    note: input.note || '更新现金余额',
    createdAt: timestamp,
    updatedAt: timestamp
  });
  data.syncMeta.pendingOperationCount += 1;
  data.syncMeta.status = data.settings.cloudSyncEnabled ? 'pending' : 'local_only';
  saveAppData(data);
  return data;
}

export function addAssetType(input: Omit<AssetType, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>): AppData {
  const data = loadAppData();
  const timestamp = nowISO();
  data.assetTypes.push({
    ...input,
    id: makeId('type'),
    sortOrder: data.assetTypes.length + 1,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  data.syncMeta.pendingOperationCount += 1;
  saveAppData(data);
  return data;
}

function instrumentKindFromSearch(kind: string): Instrument['kind'] {
  const normalized = kind.toLowerCase();
  if (normalized.includes('fund')) return 'fund';
  if (normalized.includes('etf')) return 'etf';
  if (normalized.includes('bond')) return 'bond';
  if (normalized.includes('stock') || normalized.includes('equity')) return 'stock';
  return 'custom';
}

function assetTypeIdForInstrument(data: AppData, kind: Instrument['kind']): string {
  const type = data.assetTypes.find((item) => {
    if (kind === 'fund') return item.id === 'type_fund' || item.name.includes('基金');
    return item.id === 'type_stock' || item.name.includes('股票');
  });
  return type?.id || data.assetTypes.find((item) => item.category === 'asset')?.id || data.assetTypes[0].id;
}

export function addInstrumentPosition(input: {
  accountId: string;
  instrument: InstrumentSearchResult;
  units: string;
  price: string;
  quote?: Quote;
  fee?: string;
  note?: string;
}): AppData {
  const data = loadAppData();
  const timestamp = nowISO();
  const account = data.accounts.find((item) => item.id === input.accountId && !item.archived);
  if (!account) {
    throw new Error('Account not found.');
  }
  const symbol = input.instrument.symbol.trim().toUpperCase();
  const kind = instrumentKindFromSearch(String(input.instrument.kind || 'stock'));
  let instrument = data.instruments.find((item) => item.symbol?.toUpperCase() === symbol && item.currency === input.instrument.currency);
  if (!instrument) {
    instrument = {
      id: makeId('instrument'),
      symbol,
      name: input.instrument.name || symbol,
      kind,
      currency: input.instrument.currency,
      market: input.instrument.market,
      assetTypeId: assetTypeIdForInstrument(data, kind),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    data.instruments.push(instrument);
  }
  const normalizedPrice = normalizeDecimalInput(input.price);
  const normalizedUnits = normalizeDecimalInput(input.units);
  const normalizedFee = normalizeDecimalInput(input.fee || '0', { allowZero: true });
  if (!normalizedPrice || !normalizedUnits || !normalizedFee) {
    throw new Error('Invalid instrument position input.');
  }
  const price = Number(normalizedPrice);
  const units = Number(normalizedUnits);
  const fee = Number(normalizedFee);
  const quote: Quote = input.quote
    ? {
        ...input.quote,
        instrumentId: instrument.id,
        symbol,
        price: { amount: price.toFixed(4), currency: instrument.currency }
      }
    : {
        instrumentId: instrument.id,
        symbol,
        price: { amount: price.toFixed(4), currency: instrument.currency },
        asOf: timestamp.slice(0, 10),
        source: 'manual',
        stale: true
      };
  data.quotes = [quote, ...data.quotes.filter((item) => item.instrumentId !== instrument.id)];
  data.transactions.unshift({
    id: makeId('tx'),
    accountId: account.id,
    type: 'buy',
    tradeDate: timestamp.slice(0, 10),
    amount: { amount: (price * units).toFixed(4), currency: instrument.currency },
    instrumentId: instrument.id,
    units: units.toFixed(4),
    price: { amount: price.toFixed(4), currency: instrument.currency },
    fee: fee > 0 ? { amount: fee.toFixed(4), currency: instrument.currency } : undefined,
    note: input.note || `新增 ${symbol}`,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  data.syncMeta.pendingOperationCount += 1;
  data.syncMeta.status = data.settings.cloudSyncEnabled ? 'pending' : 'local_only';
  saveAppData(data);
  return data;
}

export async function callCloudFunction<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error('Cloud functions are only available inside WeChat Mini Program runtime.');
  }
  const response = await wx.cloud.callFunction({ name, data: payload });
  return response.result as T;
}
