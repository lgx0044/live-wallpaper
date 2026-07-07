// pages/index/index.js
Page({
  onStart() {
    wx.navigateTo({
      url: '/pages/upload/upload',
    })
  },

  onShareAppMessage() {
    return {
      title: 'live动态壁纸 - 把 Live Photo 变成动态壁纸',
      path: '/pages/index/index',
    }
  },
})
