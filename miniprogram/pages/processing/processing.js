// pages/processing/processing.js
const { callCloudFunction, showToast } = require('../../utils/util')
const { CLOUD_FUNCTIONS } = require('../../utils/config')

Page({
  data: {
    taskId: '',
    status: 'uploading',
    elapsed: 0,
    progressPercent: 15,
    errorMessage: '',
  },

  onLoad(options) {
    if (!options.taskId) {
      showToast('参数错误')
      wx.navigateBack()
      return
    }

    this.data.taskId = options.taskId
    this.startPolling()
    this.startTimer()
  },

  onUnload() {
    this.stopPolling()
    this.stopTimer()
  },

  // 开始轮询
  startPolling() {
    this.pollTimer = setInterval(async () => {
      try {
        const result = await callCloudFunction(CLOUD_FUNCTIONS.GET_STATUS, {
          taskId: this.data.taskId,
        })

        if (result.code !== 0 || !result.data) {
          // 任务可能还没创建，继续等待
          return
        }

        const { status, outputVideoFileID, errorMessage } = result.data

        // 更新进度百分比
        let percent = 15
        if (status === 'downloading') percent = 20
        else if (status === 'processing') {
          // 从 25% 开始线性增长到 85%
          const elapsed = this.data.elapsed || 1
          percent = Math.min(25 + Math.min(elapsed / 60, 1) * 60, 85)
        }
        else if (status === 'completed') percent = 100
        else if (status === 'failed') percent = 0

        this.setData({
          status,
          progressPercent: percent,
          errorMessage: errorMessage || '',
        })

        // 完成 → 跳转结果页
        if (status === 'completed') {
          this.stopPolling()
          this.stopTimer()
          wx.redirectTo({
            url: `/pages/result/result?taskId=${this.data.taskId}&fileID=${outputVideoFileID}`,
          })
        }

        // 失败 → 停止
        if (status === 'failed') {
          this.stopPolling()
          this.stopTimer()
        }

      } catch (err) {
        console.error('Poll error:', err)
        // 轮询错误不影响继续
      }
    }, 2000)
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },

  // 计时器
  startTimer() {
    const startTime = Date.now()
    this._startTime = startTime
    this.timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      this.setData({ elapsed })
    }, 1000)
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  // 重试：回到上传页
  onRetry() {
    wx.redirectTo({
      url: '/pages/upload/upload',
    })
  },
})
