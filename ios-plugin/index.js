/**
 * plugin/index.js
 * 小程序插件入口 — LivePhotoReader
 *
 * 在微信公众平台 → 设置 → 插件 中启用后，
 * 小程序 JS 层通过 requirePlugin('live-photo-reader') 调用
 */

const chooseLivePhoto = (options) => {
  const { success, fail, complete } = options || {}

  // 调用原生插件（通过 WKScriptMessageHandler 桥接）
  wx.NativeBridge.invoke('LivePhotoReader', 'chooseLivePhoto', {}, (err, res) => {
    if (err) {
      typeof fail === 'function' && fail({ errMsg: err })
      typeof complete === 'function' && complete({ errMsg: err })
      return
    }
    typeof success === 'function' && success(res)
    typeof complete === 'function' && complete(res)
  })
}

const cleanup = () => {
  wx.NativeBridge.invoke('LivePhotoReader', 'cleanup', {})
}

module.exports = {
  chooseLivePhoto,
  cleanup,
}
