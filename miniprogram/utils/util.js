// utils/util.js
// 通用工具函数

/**
 * 生成 UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (!bytes) return '未知'
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1024 / 1024).toFixed(1) + 'MB'
}

/**
 * 格式化时长（秒 → mm:ss）
 */
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 格式化已用时间（秒 → 中文）
 */
function formatElapsedTime(seconds) {
  if (seconds < 60) return `${seconds}秒`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}分${s}秒`
}

/**
 * 安全调用云函数（带重试）
 */
async function callCloudFunction(name, data, retries = 2) {
  let lastError = null
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await wx.cloud.callFunction({
        name,
        data,
      })
      return res.result
    } catch (err) {
      lastError = err
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
      }
    }
  }
  throw lastError
}

/**
 * 显示 toast（封装 wx.showToast）
 */
function showToast(title, icon = 'none', duration = 2000) {
  wx.showToast({ title, icon, duration })
}

/**
 * 显示加载框
 */
function showLoading(title = '处理中...') {
  wx.showLoading({ title, mask: true })
}

module.exports = {
  generateUUID,
  formatFileSize,
  formatDuration,
  formatElapsedTime,
  callCloudFunction,
  showToast,
  showLoading,
}
