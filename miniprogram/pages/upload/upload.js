// pages/upload/upload.js
const { generateUUID, formatFileSize, showToast, showLoading } = require('../../utils/util')
const { CLOUD_FUNCTIONS, STORAGE_PATHS, CONVERSION_PRESETS } = require('../../utils/config')
const livePhotoBridge = require('../../utils/livePhotoBridge')

Page({
  data: {
    videoFile: null,
    imageFile: null,
    selected: false,
    selectedPreset: 'standard',
    isUploading: false,
    errorMessage: '',
    usingPlugin: false, // 是否使用原生插件
  },

  onLoad() {
    // 检测是否可以使用原生插件
    const hasPlugin = livePhotoBridge.isAvailable()
    this.setData({ usingPlugin: hasPlugin })
    console.log('[upload] 原生插件可用:', hasPlugin)
  },

  // ===== 选择实况照片（插件优先） =====
  onChooseLivePhoto() {
    if (this.data.usingPlugin) {
      this.chooseViaPlugin()
    } else {
      this.chooseViaFallback()
    }
  },

  // ===== 方式 A：通过 iOS 原生插件选择 =====
  async chooseViaPlugin() {
    const self = this
    showLoading('打开相册...')

    try {
      const result = await livePhotoBridge.chooseLivePhoto()
      wx.hideLoading()

      // 读取文件信息
      const fs = wx.getFileSystemManager()

      // 读取视频文件
      const videoStat = fs.statSync(result.videoPath)
      if (videoStat.size > 30 * 1024 * 1024) {
        self.setData({ errorMessage: `文件超过 30MB 限制` })
        return
      }

      const videoFile = {
        tempFilePath: result.videoPath,
        size: videoStat.size,
        duration: 0, // 插件暂未返回时长
      }

      let imageFile = null
      if (result.imagePath) {
        try {
          const imgStat = fs.statSync(result.imagePath)
          imageFile = {
            tempFilePath: result.imagePath,
            size: imgStat.size,
          }
        } catch (_) {}
      }

      self.setData({ videoFile, imageFile })

      // 获取视频时长
      try {
        const info = await new Promise((resolve, reject) => {
          wx.getVideoInfo({
            src: result.videoPath,
            success: resolve,
            fail: reject,
          })
        })
        videoFile.duration = info.duration
        if (info.duration > 30) {
          self.setData({ errorMessage: `视频时长 ${Math.round(info.duration)}秒，超过30秒限制` })
          return
        }
      } catch (_) {}

      self.showSelected()

    } catch (err) {
      wx.hideLoading()
      console.error('[upload] 插件选择失败:', err)

      // 降级到 fallback
      self.setData({ errorMessage: '原生插件不可用，切换到普通选择模式' })
      self.chooseViaFallback()
    }
  },

  // ===== 方式 B：降级方案（wx.chooseMedia） =====
  chooseViaFallback() {
    const self = this

    wx.chooseMedia({
      count: 1,
      mediaType: ['mix'],
      sourceType: ['album'],
      success(res) {
        const files = res.tempFiles
        const videoFile = files.find(f => f.fileType === 'video')
        const imageFile = files.find(f => f.fileType === 'image')

        if (videoFile) {
          if (videoFile.duration > 30) {
            self.setData({ errorMessage: `视频时长 ${Math.round(videoFile.duration)}秒，超过30秒限制` })
            return
          }
          self.setData({ videoFile, imageFile: imageFile || null })
          self.showSelected()
        } else {
          self.setData({ errorMessage: '未识别到实况照片，请确保选择的是 Live Photo' })
        }
      },
      fail(err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') >= 0) return
        self.setData({ errorMessage: '选择失败：' + (err.errMsg || '') })
      },
    })
  },

  showSelected() {
    const v = this.data.videoFile
    if (!v) return

    let infoText = formatFileSize(v.size)
    if (v.duration) infoText += ` · ${Math.round(v.duration)}秒`
    if (this.data.imageFile) {
      infoText = `封面 ${formatFileSize(this.data.imageFile.size)} · ` + infoText
    }

    this.setData({
      selected: true,
      videoInfoText: infoText,
      errorMessage: '',
    })
  },

  onSelectPreset(e) {
    this.setData({ selectedPreset: e.currentTarget.dataset.preset })
  },

  onReset() {
    this.setData({
      videoFile: null,
      imageFile: null,
      selected: false,
      errorMessage: '',
      isUploading: false,
    })
  },

  // 开始转换
  async onStartConversion() {
    if (!this.data.videoFile) {
      showToast('请先选择实况照片')
      return
    }

    const videoFile = this.data.videoFile
    const preset = CONVERSION_PRESETS[this.data.selectedPreset]
    const taskId = generateUUID()

    this.setData({ isUploading: true, errorMessage: '' })
    showLoading('正在上传...')

    try {
      // 上传视频
      const videoUploadRes = await wx.cloud.uploadFile({
        cloudPath: STORAGE_PATHS.UPLOAD_VIDEO(taskId),
        filePath: videoFile.tempFilePath,
      })

      // 上传封面图
      let imageUploadRes = null
      if (this.data.imageFile) {
        try {
          imageUploadRes = await wx.cloud.uploadFile({
            cloudPath: `uploads/${taskId}/photo.heic`,
            filePath: this.data.imageFile.tempFilePath,
          })
        } catch (_) {}
      }

      wx.hideLoading()

      // 创建数据库记录
      const db = wx.cloud.database()
      await db.collection('tasks').add({
        data: {
          taskId,
          status: 'uploaded',
          openid: '',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
          inputFiles: {
            videoFileID: videoUploadRes.fileID,
            imageFileID: imageUploadRes?.fileID || '',
            videoSize: videoFile.size,
            imageSize: this.data.imageFile?.size || 0,
          },
          config: {
            resolution: preset.resolution,
            fps: preset.fps,
            preset: preset.preset,
            crf: preset.crf,
          },
          outputFiles: {},
        }
      })

      // 触发云函数
      wx.cloud.callFunction({
        name: CLOUD_FUNCTIONS.PROCESS,
        data: {
          taskId,
          videoFileID: videoUploadRes.fileID,
          imageFileID: imageUploadRes?.fileID || '',
          options: {
            resolution: preset.resolution,
            fps: preset.fps,
            preset: preset.preset,
            crf: preset.crf,
          },
        },
      })

      // 跳转处理页
      wx.navigateTo({
        url: `/pages/processing/processing?taskId=${taskId}`,
      })

      // 清理插件临时文件
      livePhotoBridge.cleanup()

    } catch (err) {
      wx.hideLoading()
      this.setData({
        isUploading: false,
        errorMessage: '上传失败：' + (err.errMsg || err.message || '未知错误'),
      })
    }
  },

  onTestLocal() {
    if (!this.data.videoFile) {
      showToast('请先选择实况照片')
      return
    }
    const v = this.data.videoFile
    let msg = [`视频大小：${formatFileSize(v.size)}`]
    if (v.duration) msg.push(`视频时长：${Math.round(v.duration)}秒`)
    if (this.data.imageFile) msg.push(`封面大小：${formatFileSize(this.data.imageFile.size)}`)

    wx.showModal({ title: '✅ 选择成功', content: msg.join('\n'), confirmText: '知道了' })
  },

  onShareAppMessage() {
    return {
      title: 'live动态壁纸 - Live Photo 转动态壁纸',
      path: '/pages/upload/upload',
    }
  },
})
