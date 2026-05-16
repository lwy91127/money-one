Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/dashboard/index',
        text: '资产',
        icon: 'asset'
      },
      {
        pagePath: '/pages/accounts/index',
        text: '账户',
        icon: 'account'
      },
      {
        pagePath: '/pages/settings/index',
        text: '设置',
        icon: 'settings'
      }
    ]
  },
  methods: {
    switchTab(event: WechatMiniprogram.CustomEvent) {
      const { index, path } = event.currentTarget.dataset;
      if (typeof index === 'number') {
        this.setData({ selected: index });
      }
      if (path) {
        wx.switchTab({ url: path });
      }
    }
  }
});
