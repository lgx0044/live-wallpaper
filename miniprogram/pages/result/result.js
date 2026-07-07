// pages/result/result.js
const { showToast } = require('../../utils/util')

Page({
  data: {
    taskId: '',
    videoFileID: '',
    tempFilePath: '',
    isSaving: false,
    resultInfo: null,
  },

  onLoad(options) {
    if (!options.fileID) {
      showToast('参数错误')
      wx.navigateBack()
      return
    }

    this.setData({
      taskId: options.taskId || '',
      videoFileID: options.fileID,
    })

    this.downloadResult()
  },

  // 下载结果文件到本地临时路径
  async downloadResult() {
    wx.showLoading({ title: '加载结果...' })

    try {
      const res = await wx.cloud.downloadFile({
        fileID: this.data.videoFileID,
      })

      this.setData({
        tempFilePath: res.tempFilePath,
        resultInfo: {
          duration: '约 1 秒',
        },
      })

      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      showToast('加载失败：' + (err.errMsg || err.message || '未知错误'))
    }
  },

  // 保存到相册
  async onSaveToAlbum() {
    if (this.data.isSaving || !this.data.tempFilePath) return

    this.setData({ isSaving: true })

    try {
      // 1. 尝试授权
      const authSetting = await wx.getSetting()
      if (!authSetting.authSetting['scope.writePhotosAlbum']) {
        const authRes = await wx.authorize({
          scope: 'scope.writePhotosAlbum',
        }).catch(() => {
          // 授权失败，引导用户去设置
          return null
        })

        if (authRes === null) {
          // 用户拒绝授权 → 弹窗引导
          const modalRes = await wx.showModal({
            title: '需要相册权限',
            content: '请允许保存视频到相册，你可以在设置中开启权限',
            confirmText: '去设置',
            cancelText: '取消',
          })
          if (modalRes.confirm) {
            wx.openSetting()
          }
          this.setData({ isSaving: false })
          return
        }
      }

      // 2. 保存视频
      await wx.saveVideoToPhotosAlbum({
        filePath: this.data.tempFilePath,
      })

      wx.showModal({
        title: '保存成功 ✅',
        content: '已保存到相册，现在可以去设置为动态壁纸了！',
        confirmText: '去设置',
        cancelText: '好的',
        success: (res) => {
          if (res.confirm) {
            // 引导用户打开照片 App（只能提示，无法直接跳转）
            showToast('请打开系统「照片」应用')
          }
        },
      })

    } catch (err) {
      // 处理常见错误
      let msg = err.errMsg || err.message || ''
      if (msg.includes('fail auth deny') || msg.includes('deny')) {
        msg = '请在设置中开启相册权限后重试'
      } else if (msg.includes('cancel')) {
        msg = '' // 用户取消不提示
      } else {
        msg = '保存失败：' + msg
      }
      if (msg) showToast(msg)
    } finally {
      this.setData({ isSaving: false })
    }
  },

  // 再转一个
  onConvertAnother() {
    wx.redirectTo({
      url: '/pages/upload/upload',
    })
  },

  // 分享
  onShareAppMessage() {
    return {
      title: 'live动态壁纸 - 我刚刚把 Live Photo 变成了动态壁纸！',
      path: '/pages/index/index',
    }
  },
})
