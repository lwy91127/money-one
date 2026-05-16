import { addTransaction, loadAppData } from '../../services/store';
import { deriveAccountBalances } from '../../services/portfolio';
import type { AppData, TransactionType } from '../../types';
import { todayISO } from '../../utils/date';
import { formatMoney, normalizeDecimalInput } from '../../utils/money';
import { syncTabBar } from '../../utils/tabbar';

const assetTypeOptions = [
  { label: '存入', value: 'deposit' },
  { label: '取出', value: 'withdraw' },
  { label: '利息/收益', value: 'interest' }
];

const liabilityTypeOptions = [
  { label: '负债新增', value: 'liability_charge' },
  { label: '负债还款', value: 'liability_payment' }
];

const allTypeOptions = [...assetTypeOptions, ...liabilityTypeOptions];

function typeLabel(type: string): string {
  return allTypeOptions.find((item) => item.value === type)?.label || type;
}

function loadRows(data: AppData) {
  const hide = data.settings.hideAmounts;
  return data.transactions.slice(0, 60).map((tx, index, list) => {
    const account = data.accounts.find((item) => item.id === tx.accountId);
    const negative = ['withdraw', 'transfer_out', 'liability_payment'].includes(tx.type);
    return {
      id: tx.id,
      title: account?.name || '未知账户',
      note: `${tx.tradeDate}${tx.note ? ` · ${tx.note}` : ''}`,
      amountText: `${negative ? '-' : '+'}${formatMoney(tx.amount, hide)}`,
      typeLabel: typeLabel(tx.type),
      negative,
      last: index === list.length - 1
    };
  });
}

Page({
  data: {
    transactions: [] as Array<Record<string, unknown>>,
    transactionCount: '0',
    todayCount: '0',
    inflowCount: '0',
    outflowCount: '0',
    createVisible: false,
    accountPickerVisible: false,
    typePickerVisible: false,
    accountPickerValue: [] as string[],
    typePickerValue: ['deposit'],
    accountOptions: [] as Array<{ label: string; value: string }>,
    typeOptions: assetTypeOptions,
    form: {
      accountId: '',
      accountName: '选择账户',
      type: 'deposit' as TransactionType,
      typeLabel: '存入',
      currentBalanceText: '',
      afterBalanceText: '',
      amount: '',
      note: ''
    }
  },

  onShow() {
    syncTabBar(this, 2);
    this.reload();
  },

  reload() {
    const data = loadAppData();
    const balances = deriveAccountBalances(data);
    const today = todayISO();
    const activeTransactions = data.transactions.filter((tx) => !tx.deletedAt);
    const outflowTypes = ['withdraw', 'buy', 'transfer_out', 'liability_payment'];
    this.setData({
      transactions: loadRows(data),
      transactionCount: String(activeTransactions.length),
      todayCount: String(activeTransactions.filter((tx) => tx.tradeDate === today).length),
      inflowCount: String(activeTransactions.filter((tx) => !outflowTypes.includes(tx.type)).length),
      outflowCount: String(activeTransactions.filter((tx) => outflowTypes.includes(tx.type)).length),
      accountOptions: data.accounts.filter((item) => !item.archived).map((account) => {
        const balance = balances.find((item) => item.account.id === account.id);
        return { label: `${account.name} · ${balance ? formatMoney(balance.total, false) : account.currency}`, value: account.id };
      })
    });
  },

  optionsForAccount(accountId: string) {
    const account = loadAppData().accounts.find((item) => item.id === accountId);
    return account?.category === 'liability' ? liabilityTypeOptions : assetTypeOptions;
  },

  balanceTextForAccount(accountId: string) {
    const data = loadAppData();
    const balance = deriveAccountBalances(data).find((item) => item.account.id === accountId);
    return balance ? formatMoney(balance.total, data.settings.hideAmounts) : '';
  },

  previewBalanceText(accountId: string, type: TransactionType, amount: string) {
    const data = loadAppData();
    const account = data.accounts.find((item) => item.id === accountId);
    const balance = deriveAccountBalances(data).find((item) => item.account.id === accountId);
    if (!account || !balance) return '';
    const numericAmount = Number(amount || 0);
    const current = Number(balance.total.amount || 0);
    const direction = ['withdraw', 'liability_payment'].includes(type) ? -1 : 1;
    return formatMoney({ amount: (current + numericAmount * direction).toFixed(4), currency: account.currency }, data.settings.hideAmounts);
  },

  openCreate() {
    const data = loadAppData();
    const firstAccount = data.accounts.find((item) => !item.archived);
    const options = firstAccount?.category === 'liability' ? liabilityTypeOptions : assetTypeOptions;
    const firstType = options[0].value as TransactionType;
    this.setData({
      createVisible: true,
      typeOptions: options,
      form: {
        accountId: firstAccount?.id || '',
        accountName: firstAccount?.name || '选择账户',
        type: firstType,
        typeLabel: typeLabel(firstType),
        currentBalanceText: firstAccount ? this.balanceTextForAccount(firstAccount.id) : '',
        afterBalanceText: firstAccount ? this.previewBalanceText(firstAccount.id, firstType, '') : '',
        amount: '',
        note: ''
      },
      accountPickerValue: firstAccount ? [firstAccount.id] : [],
      typePickerValue: [firstType]
    });
  },

  closeCreate() {
    this.setData({ createVisible: false });
  },

  onPopupVisibleChange(event: WechatMiniprogram.CustomEvent<{ visible: boolean }>) {
    this.setData({ createVisible: event.detail.visible });
  },

  openAccountPicker() {
    this.setData({ accountPickerVisible: true });
  },

  openTypePicker() {
    this.setData({ typePickerVisible: true });
  },

  closePickers() {
    this.setData({ accountPickerVisible: false, typePickerVisible: false });
  },

  onAccountPickerChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    const accountId = event.detail.value[0];
    const account = loadAppData().accounts.find((item) => item.id === accountId);
    const options = this.optionsForAccount(accountId);
    const firstType = options[0].value as TransactionType;
    this.setData({
      accountPickerVisible: false,
      accountPickerValue: [accountId],
      typeOptions: options,
      typePickerValue: [firstType],
      'form.accountId': accountId,
      'form.accountName': account?.name || '选择账户',
      'form.type': firstType,
      'form.typeLabel': typeLabel(firstType),
      'form.currentBalanceText': this.balanceTextForAccount(accountId),
      'form.afterBalanceText': this.previewBalanceText(accountId, firstType, this.data.form.amount)
    });
  },

  onTypePickerChange(event: WechatMiniprogram.CustomEvent<{ value: TransactionType[] }>) {
    const type = event.detail.value[0];
    this.setData({
      typePickerVisible: false,
      typePickerValue: [type],
      'form.type': type,
      'form.typeLabel': typeLabel(type),
      'form.afterBalanceText': this.previewBalanceText(this.data.form.accountId, type, this.data.form.amount)
    });
  },

  onAmountInput(event: WechatMiniprogram.Input) {
    const amount = event.detail.value;
    this.setData({
      'form.amount': amount,
      'form.afterBalanceText': this.previewBalanceText(this.data.form.accountId, this.data.form.type, amount)
    });
  },

  onNoteInput(event: WechatMiniprogram.Input) {
    this.setData({ 'form.note': event.detail.value });
  },

  submitTransaction() {
    const data = loadAppData();
    const account = data.accounts.find((item) => item.id === this.data.form.accountId);
    if (!account || !this.data.form.amount) {
      wx.showToast({ title: '请补全交易', icon: 'none' });
      return;
    }
    const normalizedAmount = normalizeDecimalInput(this.data.form.amount);
    if (!normalizedAmount) {
      wx.showToast({ title: '变动金额需大于 0', icon: 'none' });
      return;
    }
    addTransaction({
      accountId: account.id,
      type: this.data.form.type,
      tradeDate: todayISO(),
      amount: { amount: normalizedAmount, currency: account.currency },
      note: this.data.form.note || '账户资金变动'
    });
    wx.showToast({ title: '资金已更新', icon: 'success' });
    this.setData({ createVisible: false });
    this.reload();
  }
});
