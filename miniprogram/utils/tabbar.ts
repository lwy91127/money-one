export function syncTabBar(page: WechatMiniprogram.Page.Instance<WechatMiniprogram.IAnyObject, WechatMiniprogram.IAnyObject>, selected: number): void {
  const tabBar = page.getTabBar?.();
  if (tabBar) {
    tabBar.setData({ selected });
  }
}
