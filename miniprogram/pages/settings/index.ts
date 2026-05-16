import { loadAppData, resetAppData, updateSettings } from '../../services/store';
import type { CurrencyCode } from '../../types';
import { syncTabBar } from '../../utils/tabbar';

Page({
  data: {
    homeCurrency: 'CNY',
    hideAmounts: false,
    hideIconClass: '',
    currencyPickerVisible: false,
    currencyValue: ['CNY'],
    currencyOptions: [
      { label: '人民币 CNY', value: 'CNY' },
      { label: '美元 USD', value: 'USD' },
      { label: '港币 HKD', value: 'HKD' },
      { label: '欧元 EUR', value: 'EUR' }
    ]
  },

  onShow() {
    syncTabBar(this, 2);
    this.reload();
  },

  reload() {
    const data = loadAppData();
    this.setData({
      homeCurrency: data.settings.homeCurrency,
      hideAmounts: data.settings.hideAmounts,
      hideIconClass: data.settings.hideAmounts ? 'settings-eye--hidden' : '',
      currencyValue: [data.settings.homeCurrency]
    });
  },

  toggleHideAmounts() {
    const data = loadAppData();
    updateSettings({ hideAmounts: !data.settings.hideAmounts });
    this.reload();
  },

  openCurrencyPicker() {
    this.setData({ currencyPickerVisible: true });
  },

  closeCurrencyPicker() {
    this.setData({ currencyPickerVisible: false });
  },

  onCurrencyChange(event: WechatMiniprogram.CustomEvent<{ value: CurrencyCode[] }>) {
    updateSettings({ homeCurrency: event.detail.value[0] });
    this.setData({ currencyPickerVisible: false });
    this.reload();
  },

  async resetData() {
    const result = await wx.showModal({
      title: '确认重置',
      content: '这会清空本机数据并恢复示例资产，操作不可撤销。',
      confirmText: '重置',
      confirmColor: '#b94a3e'
    });
    if (!result.confirm) return;
    resetAppData();
    wx.showToast({ title: '已重置', icon: 'success' });
    this.reload();
  }
});
