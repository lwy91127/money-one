import { deriveAccountBalances, deriveHoldings, quoteForInstrument } from '../../services/portfolio';
import { addInstrumentPosition, callCloudFunction, deleteAccount, loadAppData, setAccountCashBalance } from '../../services/store';
import type { AppData, Holding, InstrumentSearchResult, Money, Quote } from '../../types';
import { formatMoney, normalizeDecimalInput } from '../../utils/money';

let searchTimer: number | undefined;

function normalizeSearchResults(items: InstrumentSearchResult[]): InstrumentSearchResult[] {
  return items
    .filter((item) => item.symbol && item.name)
    .slice(0, 12)
    .map((item) => ({
      symbol: item.symbol.toUpperCase(),
      name: item.name,
      kind: item.kind || 'stock',
      market: item.market || 'Global',
      currency: item.currency || 'USD',
      source: item.source || 'alpha_vantage'
    }));
}

function localSearch(data: AppData, keyword: string): InstrumentSearchResult[] {
  const lower = keyword.toLowerCase();
  return data.instruments
    .filter((item) => item.symbol?.toLowerCase().includes(lower) || item.name.toLowerCase().includes(lower))
    .map((item) => ({
      symbol: item.symbol || item.name,
      name: item.name,
      kind: item.kind,
      market: item.market,
      currency: item.currency,
      source: 'local'
    }));
}

function dayChangeFromQuote(quote?: Quote): number | undefined {
  if (!quote?.raw || typeof quote.raw !== 'object') return undefined;
  const raw = quote.raw as Record<string, string>;
  const change = Number(raw['09. change']);
  return Number.isFinite(change) ? change : undefined;
}

Page({
  data: {
    accountId: '',
    accountName: '',
    accountMeta: '',
    categoryLabel: '资产',
    categoryTheme: 'primary',
    canAddHolding: false,
    totalText: '',
    cashText: '',
    holdingsText: '',
    homeTotalText: '',
    holdings: [] as Array<Record<string, unknown>>,
    cashVisible: false,
    cashForm: {
      amount: ''
    },
    holdingVisible: false,
    searching: false,
    searchKeyword: '',
    searchHint: '输入关键字后实时搜索股票、ETF、基金；远程不可用时显示本地标的。',
    searchResults: [] as InstrumentSearchResult[],
    selectedSymbol: '',
    selectedInstrument: null as InstrumentSearchResult | null,
    selectedQuote: null as Quote | null,
    positionForm: {
      units: ''
    }
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ accountId: query.id || '' });
    this.reload();
  },

  onUnload() {
    if (searchTimer) clearTimeout(searchTimer);
  },

  goBack() {
    wx.navigateBack();
  },

  refreshAccount() {
    this.reload();
  },

  async deleteCurrentAccount() {
    const result = await wx.showModal({
      title: '删除账户',
      content: '删除后该账户和账户内现金、持仓会从统计中移除。',
      confirmText: '删除',
      confirmColor: '#b94a3e'
    });
    if (!result.confirm) return;
    try {
      deleteAccount(this.data.accountId);
      wx.showToast({ title: '账户已删除', icon: 'success' });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  reload() {
    const data = loadAppData();
    const balance = deriveAccountBalances(data).find((item) => item.account.id === this.data.accountId);
    if (!balance) {
      wx.showToast({ title: '账户不存在', icon: 'none' });
      return;
    }
    const hide = data.settings.hideAmounts;
    const holdings = deriveHoldings(data)
      .filter((holding) => holding.accountId === balance.account.id)
      .map((holding) => this.formatHolding(data, holding, hide));
    const tagText = balance.account.tags?.length ? balance.account.tags.join(' · ') : '账户';

    this.setData({
      accountName: balance.account.name,
      accountMeta: `${tagText} · ${balance.account.currency}`,
      categoryLabel: balance.account.category === 'liability' ? '负债' : '资产',
      categoryTheme: balance.account.category === 'liability' ? 'danger' : 'primary',
      canAddHolding: balance.account.category === 'asset',
      totalText: formatMoney(balance.total, hide),
      cashText: formatMoney(balance.cash, hide),
      holdingsText: formatMoney(balance.holdingsValue, hide),
      homeTotalText: formatMoney(balance.totalInHomeCurrency, hide),
      holdings,
      'cashForm.amount': Number(balance.cash.amount).toFixed(2)
    });
  },

  formatHolding(data: AppData, holding: Holding, hide: boolean) {
    const instrument = data.instruments.find((item) => item.id === holding.instrumentId);
    const quote = quoteForInstrument(data.quotes, holding.instrumentId);
    const gainNumber = Number(holding.unrealizedGain.amount);
    const dayChange = dayChangeFromQuote(quote);
    const dayGain: Money | undefined =
      dayChange === undefined
        ? undefined
        : { amount: (dayChange * Number(holding.units)).toFixed(4), currency: quote?.price.currency || holding.marketValue.currency };
    const dayGainNumber = dayGain ? Number(dayGain.amount) : 0;
    return {
      id: `${holding.accountId}_${holding.instrumentId}`,
      symbol: instrument?.symbol || instrument?.name || '自定义',
      name: instrument?.name || '未知标的',
      valueText: formatMoney(holding.marketValue, hide),
      gainText: `${gainNumber >= 0 ? '+' : ''}${formatMoney(holding.unrealizedGain, hide)}`,
      gainNegative: gainNumber < 0,
      dayGainText: dayGain ? `${dayGainNumber >= 0 ? '+' : ''}${formatMoney(dayGain, hide)}` : '--',
      dayGainNegative: dayGainNumber < 0,
      unitsText: `${Number(holding.units).toFixed(4)} 份`,
      priceText: quote ? `${quote.stale ? '手动价' : '最新价'} ${formatMoney(quote.price, hide)}` : '暂无价格'
    };
  },

  openCashSheet() {
    this.setData({ cashVisible: true });
  },

  closeCashSheet() {
    this.setData({ cashVisible: false });
  },

  onCashPopupChange(event: WechatMiniprogram.CustomEvent<{ visible: boolean }>) {
    this.setData({ cashVisible: event.detail.visible });
  },

  onCashAmountInput(event: WechatMiniprogram.Input) {
    this.setData({ 'cashForm.amount': event.detail.value });
  },

  submitCashBalance() {
    const amount = this.data.cashForm.amount;
    if (!normalizeDecimalInput(amount, { allowZero: true })) {
      wx.showToast({ title: '现金金额无效', icon: 'none' });
      return;
    }
    try {
      setAccountCashBalance({
        accountId: this.data.accountId,
        amount
      });
    } catch (error) {
      wx.showToast({ title: '现金金额无效', icon: 'none' });
      return;
    }
    wx.showToast({ title: '现金已更新', icon: 'success' });
    this.setData({ cashVisible: false });
    this.reload();
  },

  openHoldingSheet() {
    this.setData({
      holdingVisible: true,
      searchKeyword: '',
      searchResults: [],
      selectedSymbol: '',
      selectedInstrument: null,
      selectedQuote: null,
      searchHint: '输入关键字后实时搜索股票、ETF、基金；远程不可用时显示本地标的。',
      positionForm: { units: '' }
    });
  },

  closeHoldingSheet() {
    this.setData({ holdingVisible: false });
  },

  onHoldingPopupChange(event: WechatMiniprogram.CustomEvent<{ visible: boolean }>) {
    this.setData({ holdingVisible: event.detail.visible });
  },

  onSearchInput(event: WechatMiniprogram.Input) {
    const keyword = event.detail.value.trim();
    this.setData({ searchKeyword: keyword, selectedSymbol: '', selectedInstrument: null });
    if (searchTimer) clearTimeout(searchTimer);
    if (keyword.length < 2) {
      this.setData({ searchResults: [], searchHint: '至少输入 2 个字符开始搜索。' });
      return;
    }
    searchTimer = setTimeout(() => {
      this.searchInstruments(keyword);
    }, 320) as unknown as number;
  },

  async searchInstruments(keyword: string) {
    const data = loadAppData();
    this.setData({ searching: true, searchHint: '正在搜索市场标的...' });
    try {
      const result = await callCloudFunction<{ items?: InstrumentSearchResult[]; error?: string; rawMessage?: string }>('searchInstrument', {
        keywords: keyword
      });
      const items = normalizeSearchResults(result.items || []);
      this.setData({
        searchResults: items.length ? items : normalizeSearchResults(localSearch(data, keyword)),
        searchHint: result.error || result.rawMessage || (items.length ? '选择一个标的后输入股数。' : '没有远程结果，已显示本地匹配。')
      });
    } catch (error) {
      const localItems = normalizeSearchResults(localSearch(data, keyword));
      this.setData({
        searchResults: localItems,
        searchHint: localItems.length ? '远程搜索不可用，已显示本地标的。' : '搜索不可用，请检查云函数配置。'
      });
    } finally {
      this.setData({ searching: false });
    }
  },

  selectInstrument(event: WechatMiniprogram.CustomEvent) {
    const symbol = event.currentTarget.dataset.symbol;
    const instrument = this.data.searchResults.find((item) => item.symbol === symbol);
    if (instrument) {
      this.setData({ selectedSymbol: symbol, selectedInstrument: instrument, selectedQuote: null });
      this.fetchSelectedQuote(instrument);
    }
  },

  async queryInstrumentQuote(instrument: InstrumentSearchResult): Promise<Quote | undefined> {
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
  },

  async fetchSelectedQuote(instrument: InstrumentSearchResult) {
    this.setData({ searching: true, searchHint: `正在获取 ${instrument.symbol} 最新可用价格...` });
    try {
      const quote = await this.queryInstrumentQuote(instrument);
      if (quote) {
        const hide = loadAppData().settings.hideAmounts;
        this.setData({
          selectedQuote: quote,
          searchHint: `${instrument.symbol} 当前价 ${formatMoney(quote.price, hide)}，输入股数后保存。`
        });
        return;
      }
      this.setData({ searchHint: '未获取到当前价，保存时会再次查询。' });
    } catch (error) {
      this.setData({ searchHint: '价格获取失败，保存时会再次查询。' });
    } finally {
      this.setData({ searching: false });
    }
  },

  onUnitsInput(event: WechatMiniprogram.Input) {
    this.setData({ 'positionForm.units': event.detail.value });
  },

  async submitHolding() {
    const instrument = this.data.selectedInstrument;
    const { units } = this.data.positionForm;
    if (!instrument || !units) {
      wx.showToast({ title: '请选择标的并填写股数', icon: 'none' });
      return;
    }
    if (!normalizeDecimalInput(units)) {
      wx.showToast({ title: '股数无效', icon: 'none' });
      return;
    }
    this.setData({ searching: true, searchHint: `正在查询 ${instrument.symbol} 当前价格...` });
    try {
      const quote = (await this.queryInstrumentQuote(instrument)) || this.data.selectedQuote;
      if (!quote || quote.stale || Number(quote.price.amount) <= 0) {
        wx.showToast({ title: '未获取到当前价格', icon: 'none' });
        return;
      }
      addInstrumentPosition({
        accountId: this.data.accountId,
        instrument,
        units,
        price: quote.price.amount,
        quote
      });
    } catch (error) {
      wx.showToast({ title: '持仓新增失败', icon: 'none' });
      return;
    } finally {
      this.setData({ searching: false });
    }
    wx.showToast({ title: '持仓已新增', icon: 'success' });
    this.setData({ holdingVisible: false });
    this.reload();
  }
});
