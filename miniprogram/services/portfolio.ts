import type {
  Account,
  AccountBalance,
  AppData,
  DistributionItem,
  FxRate,
  Holding,
  Money,
  NetWorthPoint,
  PortfolioSummary,
  Quote,
  Transaction
} from '../types';
import {
  addMoney,
  convertMoney,
  decimalToUnits,
  divideMoney,
  money,
  moneyToNumber,
  multiplyMoney,
  negateMoney,
  unitsToDecimal
} from '../utils/money';
import { daysAgoISO, sortByDateAsc, todayISO } from '../utils/date';

type LedgerState = {
  cashByAccount: Map<string, bigint>;
  unitsByAccountInstrument: Map<string, bigint>;
  costByAccountInstrument: Map<string, bigint>;
};

function key(accountId: string, instrumentId: string): string {
  return `${accountId}::${instrumentId}`;
}

export function findFxRate(fxRates: FxRate[], base: string, quote: string): string | undefined {
  if (base === quote) return '1';
  const direct = fxRates.find((rate) => rate.base === base && rate.quote === quote);
  if (direct) return direct.rate;
  const inverse = fxRates.find((rate) => rate.base === quote && rate.quote === base);
  if (inverse && decimalToUnits(inverse.rate) !== 0n) return divideMoney(money(1, quote), inverse.rate).amount;
  return undefined;
}

export function quoteForInstrument(quotes: Quote[], instrumentId: string): Quote | undefined {
  return quotes
    .filter((quote) => quote.instrumentId === instrumentId)
    .sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
}

export function applyTransaction(state: LedgerState, tx: Transaction): void {
  if (tx.deletedAt) return;
  const accountCash = state.cashByAccount.get(tx.accountId) || 0n;
  const amountUnits = decimalToUnits(tx.amount.amount);
  const units = decimalToUnits(tx.units || '0');
  const holdingKey = tx.instrumentId ? key(tx.accountId, tx.instrumentId) : '';
  const currentUnits = holdingKey ? state.unitsByAccountInstrument.get(holdingKey) || 0n : 0n;
  const currentCost = holdingKey ? state.costByAccountInstrument.get(holdingKey) || 0n : 0n;

  switch (tx.type) {
    case 'deposit':
    case 'transfer_in':
    case 'dividend':
    case 'interest':
    case 'liability_charge':
      state.cashByAccount.set(tx.accountId, accountCash + amountUnits);
      break;
    case 'withdraw':
    case 'transfer_out':
    case 'liability_payment':
      state.cashByAccount.set(tx.accountId, accountCash - amountUnits);
      break;
    case 'buy':
      if (holdingKey) {
        state.unitsByAccountInstrument.set(holdingKey, currentUnits + units);
        state.costByAccountInstrument.set(holdingKey, currentCost + amountUnits + decimalToUnits(tx.fee?.amount));
      }
      break;
    case 'sell':
      if (holdingKey) {
        const remainingUnits = currentUnits - units;
        const soldCost = currentUnits === 0n ? 0n : (currentCost * units) / currentUnits;
        state.unitsByAccountInstrument.set(holdingKey, remainingUnits);
        state.costByAccountInstrument.set(holdingKey, currentCost - soldCost);
      }
      break;
    case 'valuation_adjustment':
      state.cashByAccount.set(tx.accountId, amountUnits);
      break;
  }
}

export function buildLedger(transactions: Transaction[], untilDate?: string): LedgerState {
  const state: LedgerState = {
    cashByAccount: new Map(),
    unitsByAccountInstrument: new Map(),
    costByAccountInstrument: new Map()
  };

  sortByDateAsc(transactions)
    .filter((tx) => !untilDate || tx.tradeDate <= untilDate)
    .forEach((tx) => applyTransaction(state, tx));

  return state;
}

export function deriveHoldings(data: AppData, ledger = buildLedger(data.transactions)): Holding[] {
  const holdings: Holding[] = [];
  ledger.unitsByAccountInstrument.forEach((units, compoundKey) => {
    if (units <= 0n) return;
    const [accountId, instrumentId] = compoundKey.split('::');
    const instrument = data.instruments.find((item) => item.id === instrumentId);
    if (!instrument) return;
    const quote = quoteForInstrument(data.quotes, instrumentId);
    const costUnits = ledger.costByAccountInstrument.get(compoundKey) || 0n;
    const unitDecimal = unitsToDecimal(units, 4);
    const price = quote?.price || money(0, instrument.currency);
    const marketValue = multiplyMoney(price, unitDecimal);
    const cost: Money = { amount: unitsToDecimal(costUnits, 4), currency: instrument.currency };
    holdings.push({
      accountId,
      instrumentId,
      units: unitDecimal,
      cost,
      marketValue,
      unrealizedGain: {
        amount: unitsToDecimal(decimalToUnits(marketValue.amount) - costUnits, 4),
        currency: instrument.currency
      }
    });
  });
  return holdings;
}

function convertToHome(data: AppData, value: Money): Money {
  const rate = findFxRate(data.fxRates, value.currency, data.settings.homeCurrency);
  return convertMoney(value, data.settings.homeCurrency, rate);
}

export function deriveAccountBalances(data: AppData, ledger = buildLedger(data.transactions)): AccountBalance[] {
  const holdings = deriveHoldings(data, ledger);
  return data.accounts
    .filter((account) => !account.archived)
    .map((account) => {
      const group = data.accountGroups.find((item) => item.id === account.groupId) || data.accountGroups[0];
      const assetType = data.assetTypes.find((item) => item.id === account.assetTypeId) || data.assetTypes[0];
      const cash = { amount: unitsToDecimal(ledger.cashByAccount.get(account.id) || 0n, 4), currency: account.currency };
      const accountHoldings = holdings.filter((holding) => holding.accountId === account.id);
      const holdingsValue = addMoney(
        accountHoldings.map((holding) => convertMoney(holding.marketValue, account.currency, findFxRate(data.fxRates, holding.marketValue.currency, account.currency))),
        account.currency
      );
      const total = addMoney([cash, holdingsValue], account.currency);
      const signedTotal = account.category === 'liability' ? total : total;
      return {
        account,
        accountGroup: group,
        assetType,
        cash,
        holdingsValue,
        total: signedTotal,
        totalInHomeCurrency: convertToHome(data, signedTotal)
      };
    });
}

function summarizeDistribution(
  balances: AccountBalance[],
  getId: (balance: AccountBalance) => string,
  getLabel: (balance: AccountBalance) => string,
  getColor: (balance: AccountBalance) => string,
  currency: string
): DistributionItem[] {
  const totals = new Map<string, { label: string; color: string; units: bigint }>();
  balances.forEach((balance) => {
    if (!balance.account.includeInSummary) return;
    const id = getId(balance);
    const current = totals.get(id) || { label: getLabel(balance), color: getColor(balance), units: 0n };
    current.units += decimalToUnits(balance.totalInHomeCurrency.amount);
    totals.set(id, current);
  });
  const absoluteTotal = [...totals.values()].reduce((sum, item) => sum + (item.units < 0n ? -item.units : item.units), 0n);
  return [...totals.entries()]
    .map(([id, item]) => ({
      id,
      label: item.label,
      value: { amount: unitsToDecimal(item.units < 0n ? -item.units : item.units, 4), currency },
      percent: absoluteTotal === 0n ? 0 : Number(item.units < 0n ? -item.units : item.units) / Number(absoluteTotal),
      color: item.color
    }))
    .filter((item) => decimalToUnits(item.value.amount) > 0n)
    .sort((a, b) => moneyToNumber(b.value) - moneyToNumber(a.value));
}

function summarizeAssetTypeDistribution(data: AppData, balances: AccountBalance[], holdings: Holding[]): DistributionItem[] {
  const currency = data.settings.homeCurrency;
  const totals = new Map<string, { label: string; color: string; units: bigint }>();
  const cashType =
    data.assetTypes.find((type) => type.id === 'type_cash') ||
    data.assetTypes.find((type) => type.valuationMethod === 'cash' && type.category === 'asset') ||
    data.assetTypes.find((type) => type.category === 'asset');

  const addValue = (assetTypeId: string | undefined, value: Money) => {
    if (!assetTypeId) return;
    const units = decimalToUnits(convertToHome(data, value).amount);
    if (units <= 0n) return;
    const assetType = data.assetTypes.find((type) => type.id === assetTypeId);
    if (!assetType || assetType.category !== 'asset' || !assetType.includeInNetWorth) return;
    const current = totals.get(assetType.id) || { label: assetType.name, color: assetType.color, units: 0n };
    current.units += units;
    totals.set(assetType.id, current);
  };

  balances
    .filter((balance) => balance.account.category === 'asset' && balance.account.includeInSummary)
    .forEach((balance) => addValue(cashType?.id, balance.cash));

  holdings.forEach((holding) => {
    const account = data.accounts.find((item) => item.id === holding.accountId);
    if (!account || account.category !== 'asset' || !account.includeInSummary) return;
    const instrument = data.instruments.find((item) => item.id === holding.instrumentId);
    addValue(instrument?.assetTypeId, holding.marketValue);
  });

  const absoluteTotal = [...totals.values()].reduce((sum, item) => sum + item.units, 0n);
  return [...totals.entries()]
    .map(([id, item]) => ({
      id,
      label: item.label,
      value: { amount: unitsToDecimal(item.units, 4), currency },
      percent: absoluteTotal === 0n ? 0 : Number(item.units) / Number(absoluteTotal),
      color: item.color
    }))
    .filter((item) => decimalToUnits(item.value.amount) > 0n)
    .sort((a, b) => moneyToNumber(b.value) - moneyToNumber(a.value));
}

export function deriveTrend(data: AppData): NetWorthPoint[] {
  const dates = [daysAgoISO(180), daysAgoISO(150), daysAgoISO(120), daysAgoISO(90), daysAgoISO(60), daysAgoISO(30), todayISO()];
  return dates.map((date) => {
    const ledger = buildLedger(data.transactions, date);
    const balances = deriveAccountBalances(data, ledger).filter((balance) => balance.account.includeInSummary);
    const assets = balances
      .filter((balance) => balance.account.category === 'asset')
      .reduce((sum, balance) => sum + moneyToNumber(balance.totalInHomeCurrency), 0);
    const liabilities = balances
      .filter((balance) => balance.account.category === 'liability')
      .reduce((sum, balance) => sum + Math.max(moneyToNumber(balance.totalInHomeCurrency), 0), 0);
    return {
      date,
      assets,
      liabilities,
      netWorth: assets - liabilities
    };
  });
}

export function derivePortfolioSummary(data: AppData): PortfolioSummary {
  const holdings = deriveHoldings(data);
  const balances = deriveAccountBalances(data).filter((balance) => balance.account.includeInSummary);
  const assets = balances
    .filter((balance) => balance.account.category === 'asset')
    .map((balance) => balance.totalInHomeCurrency);
  const liabilities = balances
    .filter((balance) => balance.account.category === 'liability')
    .map((balance) => {
      const units = decimalToUnits(balance.totalInHomeCurrency.amount);
      return {
        ...balance.totalInHomeCurrency,
        amount: units > 0n ? balance.totalInHomeCurrency.amount : '0.0000'
      };
    });
  const totalAssets = addMoney(assets, data.settings.homeCurrency);
  const totalLiabilities = addMoney(liabilities, data.settings.homeCurrency);
  const netWorth = addMoney([totalAssets, negateMoney(totalLiabilities)], data.settings.homeCurrency);

  return {
    homeCurrency: data.settings.homeCurrency,
    totalAssets,
    totalLiabilities,
    netWorth,
    accountBalances: balances,
    assetTypeDistribution: summarizeAssetTypeDistribution(data, balances, holdings),
    accountDistribution: summarizeDistribution(
      balances,
      (balance) => balance.account.id,
      (balance) => balance.account.name,
      (balance) => balance.assetType.color,
      data.settings.homeCurrency
    ),
    trend: deriveTrend(data)
  };
}

export function makeSnapshotFromSummary(data: AppData) {
  const summary = derivePortfolioSummary(data);
  return {
    id: `snapshot_${todayISO()}`,
    date: todayISO(),
    totalAssets: summary.totalAssets,
    totalLiabilities: summary.totalLiabilities,
    netWorth: summary.netWorth,
    byAccount: summary.accountBalances.map((balance) => ({
      accountId: balance.account.id,
      value: balance.totalInHomeCurrency
    })),
    byAssetType: summary.assetTypeDistribution.map((item) => ({
      assetTypeId: item.id,
      value: item.value
    })),
    createdAt: new Date().toISOString()
  };
}
