export type CurrencyCode = 'CNY' | 'USD' | 'HKD' | 'EUR' | 'JPY' | string;

export type DecimalString = string;

export type Money = {
  amount: DecimalString;
  currency: CurrencyCode;
};

export type AssetCategory = 'asset' | 'liability';

export type ValuationMethod = 'cash' | 'manual' | 'market' | 'annualized';

export type AssetType = {
  id: string;
  name: string;
  category: AssetCategory;
  color: string;
  icon: string;
  valuationMethod: ValuationMethod;
  includeInNetWorth: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AccountGroup = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  includeInSummary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Account = {
  id: string;
  groupId: string;
  assetTypeId: string;
  name: string;
  currency: CurrencyCode;
  category: AssetCategory;
  tags?: string[];
  note?: string;
  archived: boolean;
  includeInSummary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type InstrumentKind = 'stock' | 'fund' | 'etf' | 'cash' | 'bond' | 'custom';

export type Instrument = {
  id: string;
  symbol?: string;
  name: string;
  kind: InstrumentKind;
  currency: CurrencyCode;
  market?: string;
  assetTypeId: string;
  annualizedYield?: DecimalString;
  createdAt: string;
  updatedAt: string;
};

export type TransactionType =
  | 'deposit'
  | 'withdraw'
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'valuation_adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'liability_charge'
  | 'liability_payment';

export type Transaction = {
  id: string;
  accountId: string;
  type: TransactionType;
  tradeDate: string;
  amount: Money;
  instrumentId?: string;
  units?: DecimalString;
  price?: Money;
  fee?: Money;
  linkedTransactionId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type Holding = {
  accountId: string;
  instrumentId: string;
  units: DecimalString;
  cost: Money;
  marketValue: Money;
  unrealizedGain: Money;
};

export type Quote = {
  instrumentId: string;
  symbol: string;
  price: Money;
  asOf: string;
  source: 'alpha_vantage' | 'twelve_data' | 'fmp' | 'yahoo' | 'eastmoney' | 'eastmoney_fund' | 'fallback' | 'manual' | 'mock';
  stale: boolean;
  raw?: unknown;
};

export type FxRate = {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: DecimalString;
  asOf: string;
  source: 'alpha_vantage' | 'manual' | 'mock';
  stale: boolean;
};

export type Snapshot = {
  id: string;
  date: string;
  totalAssets: Money;
  totalLiabilities: Money;
  netWorth: Money;
  byAccount: Array<{ accountId: string; value: Money }>;
  byAssetType: Array<{ assetTypeId: string; value: Money }>;
  createdAt: string;
};

export type SyncStatus = 'local_only' | 'synced' | 'pending' | 'conflict' | 'error';

export type SyncMeta = {
  enabled: boolean;
  status: SyncStatus;
  lastSyncedAt?: string;
  lastError?: string;
  pendingOperationCount: number;
};

export type AppSettings = {
  homeCurrency: CurrencyCode;
  hideAmounts: boolean;
  cloudSyncEnabled: boolean;
};

export type AppData = {
  accountGroups: AccountGroup[];
  accounts: Account[];
  assetTypes: AssetType[];
  instruments: Instrument[];
  transactions: Transaction[];
  quotes: Quote[];
  fxRates: FxRate[];
  snapshots: Snapshot[];
  syncMeta: SyncMeta;
  settings: AppSettings;
};

export type AccountBalance = {
  account: Account;
  accountGroup: AccountGroup;
  assetType: AssetType;
  cash: Money;
  holdingsValue: Money;
  total: Money;
  totalInHomeCurrency: Money;
};

export type DistributionItem = {
  id: string;
  label: string;
  value: Money;
  percent: number;
  color: string;
};

export type NetWorthPoint = {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export type PortfolioSummary = {
  homeCurrency: CurrencyCode;
  totalAssets: Money;
  totalLiabilities: Money;
  netWorth: Money;
  accountBalances: AccountBalance[];
  assetTypeDistribution: DistributionItem[];
  accountDistribution: DistributionItem[];
  trend: NetWorthPoint[];
};

export type InstrumentSearchResult = {
  symbol: string;
  name: string;
  kind: InstrumentKind | string;
  market?: string;
  currency: CurrencyCode;
  source?: string;
};
