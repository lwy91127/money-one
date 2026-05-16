import { deriveHoldings, derivePortfolioSummary, findFxRate, quoteForInstrument } from '../../services/portfolio';
import {
  currencyForMarket,
  localInstrumentSearch,
  marketOptions,
  normalizeSearchResults,
  queryInstrumentQuote,
  remoteInstrumentSearch,
  type MarketCode,
  type SearchKind
} from '../../services/instrumentSearch';
import { addAccount, addInstrumentPosition, loadAppData, setAccountCashBalance, updateSettings } from '../../services/store';
import type { AppData, CurrencyCode, Holding, Instrument, InstrumentSearchResult, Money, PortfolioSummary, Quote } from '../../types';
import { convertMoney, formatMoney, formatPercent, moneyToNumber } from '../../utils/money';
import { normalizeDecimalInput } from '../../utils/money';
import { syncTabBar } from '../../utils/tabbar';

type CreateAccountType = 'stock' | 'savings' | 'cash' | 'fund' | 'wealth' | 'brokerage';

const currencyOptions = [
  { label: 'CNY', value: 'CNY' },
  { label: 'USD', value: 'USD' },
  { label: 'HKD', value: 'HKD' },
  { label: 'EUR', value: 'EUR' },
  { label: 'JPY', value: 'JPY' }
];

const accountTypeOptions: Array<{ label: string; value: CreateAccountType; assetTypeId?: string; currency?: CurrencyCode }> = [
  { label: '股票', value: 'stock', assetTypeId: 'type_stock', currency: 'USD' },
  { label: '储蓄账户', value: 'savings', assetTypeId: 'type_cash' },
  { label: '现金账户', value: 'cash', assetTypeId: 'type_cash' },
  { label: '基金账户', value: 'fund', assetTypeId: 'type_fund' },
  { label: '理财账户', value: 'wealth', assetTypeId: 'type_fund' },
  { label: '证券账户', value: 'brokerage', assetTypeId: 'type_cash' }
];

let searchTimer: number | undefined;

function selectedTypeLabel(type: CreateAccountType): string {
  return accountTypeOptions.find((item) => item.value === type)?.label || '账户';
}

function isInvestmentAccountType(type: CreateAccountType): boolean {
  return type === 'stock' || type === 'fund';
}

function searchKindFor(type: CreateAccountType): SearchKind {
  return type === 'fund' ? 'fund' : 'stock';
}

function investmentUi(type: CreateAccountType) {
  const isFund = type === 'fund';
  return {
    isInvestmentType: isInvestmentAccountType(type),
    isFundType: isFund,
    codeLabel: isFund ? '基金代码' : '股票代码',
    unitsLabel: isFund ? '份' : '股',
    priceLabel: isFund ? '净值' : '价格',
    searchPlaceholder: isFund ? '搜索基金' : '搜索股票',
    searchHint: isFund ? '输入基金代码或名称开始搜索。' : '输入股票代码或名称开始搜索。'
  };
}

function assetTypeIdForCreate(data: AppData, type: CreateAccountType): string | undefined {
  const option = accountTypeOptions.find((item) => item.value === type);
  return (
    data.assetTypes.find((item) => item.id === option?.assetTypeId)?.id ||
    data.assetTypes.find((item) => item.category === 'asset')?.id
  );
}

function formatStockPrice(quote: Quote | null, currency: CurrencyCode, hide = false): string {
  if (!quote) return `${currency} --`;
  return formatMoney(quote.price, hide);
}

function formatHoldingAmount(quote: Quote | null, shares: string, currency: CurrencyCode, hide = false): string {
  const normalizedShares = normalizeDecimalInput(shares);
  const price = Number(quote?.price.amount || 0);
  if (!quote || !normalizedShares || price <= 0) return formatMoney({ amount: '0.0000', currency }, hide);
  return formatMoney({ amount: (price * Number(normalizedShares)).toFixed(4), currency: quote.price.currency }, hide);
}

function syncLabel(data: AppData): string {
  if (!data.settings.cloudSyncEnabled) return '本地';
  if (data.syncMeta.status === 'synced') return '已同步';
  if (data.syncMeta.status === 'conflict') return '冲突';
  if (data.syncMeta.status === 'error') return '错误';
  return '待同步';
}

function marketLabel(instrument?: Instrument): string {
  const market = `${instrument?.market || ''}`.toUpperCase();
  const currency = `${instrument?.currency || ''}`.toUpperCase();
  if (market.includes('NASDAQ') || market.includes('NYSE') || market.includes('US') || currency === 'USD') return '美国市场';
  if (market.includes('HK') || currency === 'HKD') return '香港市场';
  if (market.includes('SH') || market.includes('SZ') || market.includes('CN') || currency === 'CNY') return '中国市场';
  return '其他市场';
}

function marketCode(label: string): string {
  if (label === '美国市场') return 'US';
  if (label === '香港市场') return 'HK';
  if (label === '中国市场') return 'CN';
  return 'OT';
}

function dayChangeFromQuote(quote?: Quote): number | undefined {
  if (!quote?.raw || typeof quote.raw !== 'object') return undefined;
  const raw = quote.raw as Record<string, string>;
  const change = Number(raw['09. change']);
  return Number.isFinite(change) ? change : undefined;
}

function convertToHome(data: AppData, value: Money): Money {
  return convertMoney(value, data.settings.homeCurrency, findFxRate(data.fxRates, value.currency, data.settings.homeCurrency));
}

function signedMoneyText(value: Money, hide: boolean): string {
  const amount = Number(value.amount);
  return `${amount >= 0 ? '+' : ''}${formatMoney(value, hide)}`;
}

function holdingRow(data: AppData, holding: Holding, hide: boolean): Record<string, unknown> | undefined {
  const instrument = data.instruments.find((item) => item.id === holding.instrumentId);
  if (!instrument) return undefined;
  const quote = quoteForInstrument(data.quotes, holding.instrumentId);
  const gain = Number(holding.unrealizedGain.amount);
  const costPerUnit = Number(holding.units) > 0 ? Number(holding.cost.amount) / Number(holding.units) : 0;
  const price = quote?.price || { amount: '0.0000', currency: holding.marketValue.currency };
  const gainPercent = Number(holding.cost.amount) > 0 ? gain / Number(holding.cost.amount) : 0;
  const dayChange = dayChangeFromQuote(quote);
  const dayGain = dayChange === undefined ? undefined : dayChange * Number(holding.units);
  const market = marketLabel(instrument);
  return {
    id: `${holding.accountId}_${holding.instrumentId}`,
    symbol: instrument.symbol || instrument.name,
    name: instrument.name,
    code: instrument.symbol || instrument.name,
    market,
    marketCode: marketCode(market),
    valueText: formatMoney(holding.marketValue, hide),
    unitsText: Number(holding.units).toLocaleString('en-US', { maximumFractionDigits: 4 }),
    priceText: formatMoney(price, hide),
    costText: formatMoney({ amount: costPerUnit.toFixed(4), currency: holding.cost.currency }, hide),
    gainText: signedMoneyText(holding.unrealizedGain, hide),
    gainPercentText: `${gain >= 0 ? '+' : ''}${formatPercent(gainPercent)}`,
    gainNegative: gain < 0,
    dayGainText: dayGain === undefined ? '--' : signedMoneyText({ amount: dayGain.toFixed(4), currency: holding.marketValue.currency }, hide),
    stale: quote?.stale || !quote
  };
}

function buildHoldingGroups(data: AppData, holdings: Holding[], hide: boolean): Array<Record<string, unknown>> {
  const groups = new Map<string, { label: string; marketCode: string; total: number; rows: Array<Record<string, unknown>> }>();
  holdings.forEach((holding) => {
    const row = holdingRow(data, holding, hide);
    if (!row) return;
    const label = String(row.market);
    const current = groups.get(label) || { label, marketCode: String(row.marketCode), total: 0, rows: [] };
    current.total += moneyToNumber(convertToHome(data, holding.marketValue));
    current.rows.push(row);
    groups.set(label, current);
  });
  return [...groups.values()]
    .sort((a, b) => b.total - a.total)
    .map((group) => ({
      id: group.label,
      label: group.label,
      marketCode: group.marketCode,
      count: String(group.rows.length),
      totalText: formatMoney({ amount: group.total.toFixed(4), currency: data.settings.homeCurrency }, hide),
      rows: group.rows
    }));
}

function buildDistribution(summary: PortfolioSummary, hide: boolean): Array<Record<string, string | number>> {
  return summary.assetTypeDistribution.map((item, index) => ({
    id: item.id,
    label: item.label,
    color: item.color,
    valueText: formatMoney(item.value, hide),
    percentText: formatPercent(item.percent),
    width: `${Math.max(4, Math.round(item.percent * 100))}%`,
    delay: `${index * 70}ms`
  }));
}

Page({
  data: {
    holdingTotalText: '',
    holdingGainText: '',
    realizedGainText: '',
    holdingGainNegative: false,
    hideIconClass: '',
    syncLabel: '本地',
    holdingGroups: [] as Array<Record<string, unknown>>,
    distribution: [] as Array<Record<string, string | number>>,
    topDistributionLabel: '暂无配置',
    topDistributionPercent: '0%',
    topDistributionValue: '',
    createVisible: false,
    currencyOptions,
    accountTypeOptions,
    marketOptions,
    isInvestmentType: false,
    isFundType: false,
    codeLabel: '股票代码',
    unitsLabel: '股',
    priceLabel: '价格',
    searchPlaceholder: '搜索股票',
    searching: false,
    searchHint: '选择股票类型后搜索标的。',
    stockResults: [] as InstrumentSearchResult[],
    selectedSymbol: '',
    selectedInstrument: null as InstrumentSearchResult | null,
    selectedQuote: null as Quote | null,
    priceText: 'USD --',
    holdingAmountText: 'USD 0.00',
    form: {
      name: '',
      accountType: 'savings' as CreateAccountType,
      market: 'US' as MarketCode,
      currency: 'CNY' as CurrencyCode,
      cashAmount: '',
      note: '',
      stockKeyword: '',
      shares: '',
      includeInSummary: true
    }
  },

  onShow() {
    syncTabBar(this, 0);
    this.loadDashboard();
  },

  onUnload() {
    if (searchTimer) clearTimeout(searchTimer);
  },

  loadDashboard() {
    const data = loadAppData();
    const summary = derivePortfolioSummary(data);
    const hide = data.settings.hideAmounts;
    const holdings = deriveHoldings(data);
    const total = holdings.reduce((sum, holding) => sum + moneyToNumber(convertToHome(data, holding.marketValue)), 0);
    const gain = holdings.reduce((sum, holding) => sum + moneyToNumber(convertToHome(data, holding.unrealizedGain)), 0);
    this.setData({
      holdingTotalText: formatMoney({ amount: total.toFixed(4), currency: data.settings.homeCurrency }, hide),
      holdingGainText: signedMoneyText({ amount: gain.toFixed(4), currency: data.settings.homeCurrency }, hide),
      realizedGainText: formatMoney({ amount: '0.0000', currency: data.settings.homeCurrency }, hide),
      holdingGainNegative: gain < 0,
      hideIconClass: hide ? 'hide-icon--hidden' : '',
      syncLabel: syncLabel(data),
      holdingGroups: buildHoldingGroups(data, holdings, hide),
      distribution: buildDistribution(summary, hide),
      topDistributionLabel: summary.assetTypeDistribution[0]?.label || '暂无配置',
      topDistributionPercent: summary.assetTypeDistribution[0] ? formatPercent(summary.assetTypeDistribution[0].percent) : '0%',
      topDistributionValue: summary.assetTypeDistribution[0] ? formatMoney(summary.assetTypeDistribution[0].value, hide) : ''
    });
  },

  openCreate() {
    const data = loadAppData();
    this.setData({
      createVisible: true,
      ...investmentUi('savings'),
      searching: false,
      searchHint: '选择股票类型后搜索标的。',
      stockResults: [],
      selectedSymbol: '',
      selectedInstrument: null,
      selectedQuote: null,
      priceText: `${data.settings.homeCurrency} --`,
      holdingAmountText: formatMoney({ amount: '0.0000', currency: data.settings.homeCurrency }),
      form: {
        name: '',
        accountType: 'savings',
        market: 'US',
        currency: data.settings.homeCurrency,
        cashAmount: '',
        note: '',
        stockKeyword: '',
        shares: '',
        includeInSummary: true
      }
    });
  },

  closeCreate() {
    this.setData({ createVisible: false });
  },

  onPopupVisibleChange(event: WechatMiniprogram.CustomEvent<{ visible: boolean }>) {
    this.setData({ createVisible: event.detail.visible });
  },

  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ 'form.name': event.detail.value });
  },

  selectAccountType(event: WechatMiniprogram.CustomEvent) {
    const accountType = event.currentTarget.dataset.type as CreateAccountType;
    if (!accountType) return;
    const currency = accountType === 'stock' ? currencyForMarket(this.data.form.market) : accountType === 'fund' ? 'CNY' : this.data.form.currency;
    const ui = investmentUi(accountType);
    this.setData({
      ...ui,
      'form.accountType': accountType,
      'form.currency': currency,
      stockResults: [],
      selectedSymbol: '',
      selectedInstrument: null,
      selectedQuote: null,
      priceText: formatStockPrice(null, currency),
      holdingAmountText: formatHoldingAmount(null, this.data.form.shares, currency),
      searchHint: ui.isInvestmentType ? ui.searchHint : '现金类账户只需要录入当前金额。'
    });
  },

  selectCurrency(event: WechatMiniprogram.CustomEvent) {
    const currency = event.currentTarget.dataset.currency as CurrencyCode;
    if (!currency) return;
    this.setData({ 'form.currency': currency });
  },

  selectMarket(event: WechatMiniprogram.CustomEvent) {
    const market = event.currentTarget.dataset.market as MarketCode;
    if (!market) return;
    const currency = currencyForMarket(market);
    this.setData({
      'form.market': market,
      'form.currency': currency,
      'form.stockKeyword': '',
      stockResults: [],
      selectedSymbol: '',
      selectedInstrument: null,
      selectedQuote: null,
      priceText: formatStockPrice(null, currency),
      holdingAmountText: formatHoldingAmount(null, this.data.form.shares, currency),
      searchHint: '市场已切换，请重新搜索标的。'
    });
  },

  onNoteInput(event: WechatMiniprogram.Input) {
    this.setData({ 'form.note': event.detail.value });
  },

  onCashAmountInput(event: WechatMiniprogram.Input) {
    this.setData({ 'form.cashAmount': event.detail.value });
  },

  onSharesInput(event: WechatMiniprogram.Input) {
    const shares = event.detail.value;
    this.setData({
      'form.shares': shares,
      holdingAmountText: formatHoldingAmount(this.data.selectedQuote, shares, this.data.form.currency)
    });
  },

  onStockSearchInput(event: WechatMiniprogram.Input) {
    const keyword = event.detail.value.trim();
    this.setData({
      'form.stockKeyword': keyword,
      selectedSymbol: '',
      selectedInstrument: null,
      selectedQuote: null,
      priceText: formatStockPrice(null, this.data.form.currency),
      holdingAmountText: formatHoldingAmount(null, this.data.form.shares, this.data.form.currency)
    });
    if (searchTimer) clearTimeout(searchTimer);
    if (keyword.length < 2) {
      this.setData({ stockResults: [], searchHint: '至少输入 2 个字符开始搜索。' });
      return;
    }
    searchTimer = setTimeout(() => {
      this.searchStocks(keyword);
    }, 320) as unknown as number;
  },

  async searchStocks(keyword: string) {
    const data = loadAppData();
    const kind = searchKindFor(this.data.form.accountType);
    const market = kind === 'stock' ? this.data.form.market : undefined;
    this.setData({ searching: true, searchHint: kind === 'fund' ? '正在搜索基金...' : '正在搜索股票...' });
    try {
      const remoteItems = await remoteInstrumentSearch(keyword, kind);
      const items = normalizeSearchResults(remoteItems, market, kind);
      const fallback = normalizeSearchResults(localInstrumentSearch(data, keyword, market, kind), market, kind);
      this.setData({
        stockResults: items.length ? items : fallback,
        searchHint: items.length || fallback.length ? `选择${kind === 'fund' ? '基金' : '股票'}后会自动查询当前${kind === 'fund' ? '净值' : '价格'}。` : `没有找到匹配${kind === 'fund' ? '基金' : '股票'}。`
      });
    } catch (error) {
      const fallback = normalizeSearchResults(localInstrumentSearch(data, keyword, market, kind), market, kind);
      this.setData({
        stockResults: fallback,
        searchHint: fallback.length ? '远程搜索不可用，已显示本地标的。' : '搜索不可用，请检查云函数配置。'
      });
    } finally {
      this.setData({ searching: false });
    }
  },

  selectStock(event: WechatMiniprogram.CustomEvent) {
    const symbol = event.currentTarget.dataset.symbol as string;
    const instrument = this.data.stockResults.find((item) => item.symbol === symbol);
    if (!instrument) return;
    this.setData({
      selectedSymbol: symbol,
      selectedInstrument: instrument,
      selectedQuote: null,
      'form.stockKeyword': `${instrument.symbol} ${instrument.name}`,
      'form.currency': instrument.currency,
      priceText: formatStockPrice(null, instrument.currency),
      holdingAmountText: formatHoldingAmount(null, this.data.form.shares, instrument.currency)
    });
    this.fetchSelectedQuote(instrument);
  },

  async fetchSelectedQuote(instrument: InstrumentSearchResult) {
    const isFund = this.data.form.accountType === 'fund';
    this.setData({ searching: true, searchHint: `正在获取 ${instrument.symbol} 当前${isFund ? '净值' : '价格'}...` });
    try {
      const quote = await queryInstrumentQuote(instrument);
      if (!quote) {
        this.setData({ searchHint: `未获取到当前${isFund ? '净值' : '价格'}，保存时会再次查询。` });
        return;
      }
      const hide = loadAppData().settings.hideAmounts;
      this.setData({
        selectedQuote: quote,
        priceText: formatStockPrice(quote, quote.price.currency, hide),
        holdingAmountText: formatHoldingAmount(quote, this.data.form.shares, quote.price.currency, hide),
        searchHint: `${instrument.symbol} 当前${isFund ? '净值' : '价格'}已更新。`
      });
    } catch (error) {
      this.setData({ searchHint: `${isFund ? '净值' : '价格'}获取失败，保存时会再次查询。` });
    } finally {
      this.setData({ searching: false });
    }
  },

  toggleIncludeInSummary() {
    this.setData({ 'form.includeInSummary': !this.data.form.includeInSummary });
  },

  async submitAccount() {
    const form = this.data.form;
    const data = loadAppData();
    const group = data.accountGroups[0];
    const assetTypeId = assetTypeIdForCreate(data, form.accountType);
    if (!group || !assetTypeId) {
      wx.showToast({ title: '账户类型不可用', icon: 'none' });
      return;
    }
    if (isInvestmentAccountType(form.accountType)) {
      await this.submitInvestmentAccount(group.id, assetTypeId);
    } else {
      this.submitCashAccount(group.id, assetTypeId);
    }
  },

  submitCashAccount(groupId: string, assetTypeId: string) {
    const form = this.data.form;
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写账户名称', icon: 'none' });
      return;
    }
    const amount = normalizeDecimalInput(form.cashAmount, { allowZero: true });
    if (!amount) {
      wx.showToast({ title: '请填写金额', icon: 'none' });
      return;
    }
    const tags = [selectedTypeLabel(form.accountType)];
    const nextData = addAccount({
      groupId,
      assetTypeId,
      name: form.name.trim(),
      currency: form.currency,
      category: 'asset',
      tags,
      note: form.note.trim() || undefined
    }, {
      includeInSummary: form.includeInSummary
    });
    const created = nextData.accounts[nextData.accounts.length - 1];
    if (created) {
      setAccountCashBalance({
        accountId: created.id,
        amount,
        currency: form.currency,
        note: form.note.trim() || '初始金额'
      });
    }
    wx.showToast({ title: '账户已新增', icon: 'success' });
    this.setData({ createVisible: false });
    this.loadDashboard();
    if (created) wx.navigateTo({ url: `/pages/accounts/detail?id=${created.id}` });
  },

  async submitInvestmentAccount(groupId: string, assetTypeId: string) {
    const form = this.data.form;
    const instrument = this.data.selectedInstrument;
    const units = normalizeDecimalInput(form.shares);
    const isFund = form.accountType === 'fund';
    if (!instrument || !units) {
      wx.showToast({ title: `请选择${isFund ? '基金并填写份数' : '股票并填写股数'}`, icon: 'none' });
      return;
    }
    this.setData({ searching: true, searchHint: `正在查询 ${instrument.symbol} 当前${isFund ? '净值' : '价格'}...` });
    try {
      const quote = (await queryInstrumentQuote(instrument)) || this.data.selectedQuote;
      if (!quote || quote.stale || Number(quote.price.amount) <= 0) {
        wx.showToast({ title: `未获取到当前${isFund ? '净值' : '价格'}`, icon: 'none' });
        return;
      }
      const accountName = form.name.trim() || instrument.symbol;
      const nextData = addAccount({
        groupId,
        assetTypeId,
        name: accountName,
        currency: instrument.currency,
        category: 'asset',
        tags: [isFund ? '基金' : '股票', instrument.market || this.data.form.market],
        note: form.note.trim() || instrument.name
      }, {
        includeInSummary: form.includeInSummary
      });
      const created = nextData.accounts[nextData.accounts.length - 1];
      if (!created) throw new Error('Account create failed.');
      addInstrumentPosition({
        accountId: created.id,
        instrument,
        units,
        price: quote.price.amount,
        quote,
        note: form.note.trim() || `新增 ${instrument.symbol}`
      });
      wx.showToast({ title: '持仓已新增', icon: 'success' });
      this.setData({ createVisible: false });
      this.loadDashboard();
      wx.navigateTo({ url: `/pages/accounts/detail?id=${created.id}` });
    } catch (error) {
      wx.showToast({ title: '新增失败，请重试', icon: 'none' });
    } finally {
      this.setData({ searching: false });
    }
  },

  toggleHide() {
    const data = loadAppData();
    updateSettings({ hideAmounts: !data.settings.hideAmounts });
    this.loadDashboard();
  }
});
