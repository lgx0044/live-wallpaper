// utils/config.js
// 云环境与转换参数配置

// 云函数名
const CLOUD_FUNCTIONS = {
  PROCESS: 'processLivePhoto',
  GET_STATUS: 'getStatus',
}

// 上传存储路径模板
const STORAGE_PATHS = {
  UPLOAD_VIDEO: (taskId) => `uploads/${taskId}/photo.MOV`,
  OUTPUT_VIDEO: (taskId) => `outputs/${taskId}/result.mp4`,
  OUTPUT_COVER: (taskId) => `outputs/${taskId}/cover.jpg`,
}

// 用户选择的媒体类型
const MEDIA_SOURCE = {
  SOURCE_TYPE: ['album'],
  MEDIA_TYPE: 'video',
  MAX_DURATION: 30, // 秒
}

// 转换参数（前端可调整）
const CONVERSION_PRESETS = {
  // 免费模式：快速低配
  free: {
    label: '快速模式',
    resolution: '720x1280',
    fps: 30,
    preset: 'ultrafast',
    crf: 28,
    description: '适合短 Live Photo，处理快',
  },
  // 标准模式
  standard: {
    label: '标准模式',
    resolution: '1080x1920',
    fps: 60,
    preset: 'veryfast',
    crf: 23,
    description: '平衡画质与速度',
  },
  // 高质量模式
  high: {
    label: '高质量模式',
    resolution: '1080x1920',
    fps: 60,
    preset: 'medium',
    crf: 18,
    description: '画质最好，处理稍慢',
  },
}

module.exports = {
  CLOUD_FUNCTIONS,
  STORAGE_PATHS,
  MEDIA_SOURCE,
  CONVERSION_PRESETS,
}
