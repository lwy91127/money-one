App({
  globalData: {},
  onLaunch() {
    if (typeof wx !== 'undefined' && wx.cloud) {
      wx.cloud.init({
        traceUser: true
      });
    }
  }
});
