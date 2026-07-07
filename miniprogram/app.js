// app.js
App({
  globalData: {
    // 云环境 ID，部署时替换为实际环境
    envId: 'live-wallpaper-prod', // 部署时替换为实际环境 ID
  },

  onLaunch() {
    // 初始化云开发
    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: true,
    })
  },
})
