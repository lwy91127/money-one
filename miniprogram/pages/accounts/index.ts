import { deriveHoldings, derivePortfolioSummary, quoteForInstrument } from '../../services/portfolio';
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
import { addAccount, addInstrumentPosition, loadAppData, setAccountCashBalance } from '../../services/store';
import type { AppData, CurrencyCode, Holding, InstrumentSearchResult, Quote } from '../../types';
import { formatMoney } from '../../utils/money';
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

function rowFromHolding(data: ReturnType<typeof loadAppData>, holding: Holding, hide: boolean): Record<string, unknown> | undefined {
  const instrument = data.instruments.find((item) => item.id === holding.instrumentId);
  const account = data.accounts.find((item) => item.id === holding.accountId);
  if (!instrument || !account) return undefined;
  const quote = quoteForInstrument(data.quotes, holding.instrumentId);
  return {
    id: `holding_${holding.accountId}_${holding.instrumentId}`,
    accountId: holding.accountId,
    name: instrument.symbol || instrument.name,
    note: `${instrument.kind === 'fund' ? '基金' : '股票'} · ${instrument.name}`,
    amountText: formatMoney(holding.marketValue, hide),
    currency: holding.marketValue.currency,
    badge: instrument.currency,
    stale: quote?.stale || !quote,
    type: 'holding'
  };
}

Page({
  data: {
    totalText: '',
    assetsText: '',
    liabilitiesText: '',
    accountCount: '0',
    assetAccountCount: '0',
    liabilityCount: '0',
    accounts: [] as Array<Record<string, unknown>>,
    assetRows: [] as Array<Record<string, unknown>>,
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
    syncTabBar(this, 1);
    this.reload();
  },

  onUnload() {
    if (searchTimer) clearTimeout(searchTimer);
  },

  openAccount(event: WechatMiniprogram.CustomEvent) {
    const accountId = event.currentTarget.dataset.id;
    if (accountId) {
      wx.navigateTo({ url: `/pages/accounts/detail?id=${accountId}` });
    }
  },

  reload() {
    const data = loadAppData();
    const summary = derivePortfolioSummary(data);
    const hide = data.settings.hideAmounts;
    const holdings = deriveHoldings(data);
    const holdingAccountIds = new Set(holdings.map((holding) => holding.accountId));
    const accounts = summary.accountBalances.map((balance) => {
      const tagsText = balance.account.tags?.length ? balance.account.tags.join(' · ') : '账户';
      return {
      id: balance.account.id,
      name: balance.account.name,
      category: balance.account.category,
      tagsText,
      currency: balance.account.currency,
      totalText: formatMoney(balance.totalInHomeCurrency, hide),
      stale: data.quotes.some((quote) => quote.stale) || data.fxRates.some((rate) => rate.stale)
      };
    });
    const cashRows = summary.accountBalances
      .filter((balance) => Number(balance.cash.amount) !== 0 || !holdingAccountIds.has(balance.account.id))
      .map((balance) => ({
        id: `account_${balance.account.id}`,
        accountId: balance.account.id,
        name: balance.account.name,
        note: balance.account.tags?.length ? balance.account.tags.join(' · ') : '储蓄账户',
        amountText: formatMoney(balance.cash.amount === '0.0000' ? balance.totalInHomeCurrency : balance.cash, hide),
        currency: balance.account.currency,
        badge: balance.account.currency,
        type: 'account',
        stale: false
      }));
    const holdingRows = holdings
      .map((holding) => rowFromHolding(data, holding, hide))
      .filter(Boolean) as Array<Record<string, unknown>>;
    this.setData({
      totalText: formatMoney(summary.netWorth, hide),
      assetsText: formatMoney(summary.totalAssets, hide),
      liabilitiesText: formatMoney(summary.totalLiabilities, hide),
      accountCount: String(summary.accountBalances.length),
      assetAccountCount: String(summary.accountBalances.filter((balance) => balance.account.category === 'asset').length),
      liabilityCount: String(summary.accountBalances.filter((balance) => balance.account.category === 'liability').length),
      accounts,
      assetRows: [...cashRows, ...holdingRows]
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
    const nextData = addAccount({
      groupId,
      assetTypeId,
      name: form.name.trim(),
      currency: form.currency,
      category: 'asset',
      tags: [selectedTypeLabel(form.accountType)],
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
    this.reload();
    if (created) {
      wx.navigateTo({ url: `/pages/accounts/detail?id=${created.id}` });
    }
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
      const nextData = addAccount({
        groupId,
        assetTypeId,
        name: form.name.trim() || instrument.symbol,
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
      wx.showToast({ title: '账户已新增', icon: 'success' });
      this.setData({ createVisible: false });
      this.reload();
      wx.navigateTo({ url: `/pages/accounts/detail?id=${created.id}` });
    } catch (error) {
      wx.showToast({ title: '新增失败，请重试', icon: 'none' });
    } finally {
      this.setData({ searching: false });
    }
  }
});
