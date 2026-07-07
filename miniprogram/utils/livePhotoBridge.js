/**
 * livePhotoBridge.js
 * 原生插件 JS Bridge 封装层
 *
 * 封装与 iOS 原生插件 LivePhotoReader 的通信
 * 提供 Promise 风格的 API，供小程序页面调用
 *
 * 通信方式：通过 WKScriptMessageHandler（插件注入方式）
 * 使用示意：
 *   const plugin = requirePlugin('live-photo-reader')
 *   const res = await plugin.chooseLivePhoto()
 *   // res = { imagePath: '...', videoPath: '...', imageSize: N, videoSize: N }
 */

const BRIDGE_NAME = 'LivePhotoReader'

/**
 * 检查插件是否可用
 * iOS 14+ 且插件已正确注入时返回 true
 */
function isAvailable() {
  if (typeof wx === 'undefined' || !wx.requirePlugin) {
    console.warn('[LivePhotoBridge] wx.requirePlugin 不可用')
    return false
  }
  try {
    const plugin = requirePlugin('live-photo-reader')
    return !!plugin
  } catch (e) {
    console.warn('[LivePhotoBridge] 插件未安装:', e.message)
    return false
  }
}

/**
 * 通过原生插件选择实况照片
 * @returns {Promise<{imagePath: string, videoPath: string, imageSize: number, videoSize: number}>}
 */
function chooseLivePhoto() {
  return new Promise((resolve, reject) => {
    if (!isAvailable()) {
      reject(new Error('LivePhotoReader 插件未安装或不可用'))
      return
    }

    try {
      const plugin = requirePlugin('live-photo-reader')

      plugin.chooseLivePhoto({
        success(res) {
          // 用户取消时返回空对象
          if (!res.videoPath) {
            reject(new Error('用户取消了选择'))
            return
          }
          resolve({
            imagePath: res.imagePath || '',
            videoPath: res.videoPath,
            imageSize: res.imageSize || 0,
            videoSize: res.videoSize || 0,
          })
        },
        fail(err) {
          reject(new Error(err.errMsg || '选择实况照片失败'))
        },
      })
    } catch (e) {
      reject(new Error('调用原生插件失败: ' + e.message))
    }
  })
}

/**
 * 读取视频文件为 ArrayBuffer（用于云存储上传）
 * @param {string} filePath 临时文件路径
 * @returns {Promise<ArrayBuffer>}
 */
function readFileAsBuffer(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success(res) {
        resolve(res.data)
      },
      fail(err) {
        reject(new Error('读取文件失败: ' + (err.errMsg || '')))
      },
    })
  })
}

/**
 * 上传双文件到云存储
 * @param {string} taskId 任务 ID
 * @param {object} files { imagePath, videoPath }
 * @returns {Promise<{videoFileID: string, imageFileID: string|null}>}
 */
async function uploadLivePhotoFiles(taskId, files) {
  const uploads = {}

  // 上传视频
  const videoRes = await wx.cloud.uploadFile({
    cloudPath: `uploads/${taskId}/photo.MOV`,
    filePath: files.videoPath,
  })
  uploads.videoFileID = videoRes.fileID

  // 上传封面图（如果有）
  if (files.imagePath) {
    try {
      const imgRes = await wx.cloud.uploadFile({
        cloudPath: `uploads/${taskId}/photo.heic`,
        filePath: files.imagePath,
      })
      uploads.imageFileID = imgRes.fileID
    } catch (e) {
      console.warn('[LivePhotoBridge] 封面上传失败（可忽略）:', e.message)
      uploads.imageFileID = null
    }
  } else {
    uploads.imageFileID = null
  }

  return uploads
}

/**
 * 清理临时文件
 */
function cleanup() {
  try {
    const plugin = requirePlugin('live-photo-reader')
    if (plugin.cleanup) {
      plugin.cleanup()
    }
  } catch (e) {
    // 忽略清理错误
  }
}

module.exports = {
  isAvailable,
  chooseLivePhoto,
  readFileAsBuffer,
  uploadLivePhotoFiles,
  cleanup,
}
