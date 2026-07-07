// processLivePhoto 云函数
// 功能：从云存储下载用户上传的 Live Photo MOV → FFmpeg 转码 → 上传结果
//
// 配置要求：
//   免费版（默认）：256MB, 60s timeout → 720p, 30fps, ultrafast
//   付费版（按需）：1024MB, 300s timeout → 1080p, 60fps, medium
//
// FFmpeg 部署方式（二选一）：
//   A. CloudBase Layer 挂载到 /opt/bin/ffmpeg
//   B. 直接放在云函数目录 ./ffmpeg 下

const cloud = require('wx-server-sdk')
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ─── 配置 ──────────────────────────────────────────────────────

const FFMPEG_PATH = '/opt/bin/ffmpeg'   // Layer 挂载路径
const TEMP_DIR = '/tmp'
const MAX_FILE_SIZE = 30 * 1024 * 1024  // 30MB
const MAX_DURATION = 30                  // 30秒
const TIMEOUT_BUFFER_MS = 10000          // 保留缓冲

// 默认配置（免费版友好）
const DEFAULT_CONFIG = {
  resolution: '720x1280',
  fps: 30,
  preset: 'ultrafast',
  crf: 28,
}

// ─── 工具函数 ──────────────────────────────────────────────────

function generateTaskId() {
  return crypto.randomUUID()
}

function ffmpegPromise(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        // 超时错误
        if (error.killed) {
          reject(new Error('FFmpeg execution timed out'))
        } else {
          reject(new Error(stderr.slice(0, 1000) || error.message))
        }
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}

function getHumanReadableDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`
}

// ─── 主逻辑 ────────────────────────────────────────────────────

exports.main = async (event, context) => {
  const { taskId, videoFileID, imageFileID, options = {} } = event
  const { OPENID } = cloud.getWXContext()

  // 合并配置
  const cfg = {
    resolution: options.resolution || DEFAULT_CONFIG.resolution,
    fps: options.fps || DEFAULT_CONFIG.fps,
    preset: options.preset || DEFAULT_CONFIG.preset,
    crf: options.crf || DEFAULT_CONFIG.crf,
  }

  const startTime = Date.now()
  const taskDir = path.join(TEMP_DIR, taskId)
  const inputVideo = path.join(taskDir, 'input.MOV')
  const outputVideo = path.join(taskDir, 'result.mp4')
  const outputCover = path.join(taskDir, 'cover.jpg')

  try {
    // 1. 创建临时目录
    fs.mkdirSync(taskDir, { recursive: true })

    // 2. 更新状态：下载中
    try {
      await db.collection('tasks').doc(taskId).update({
        data: { status: 'downloading', updatedAt: db.serverDate() }
      })
    } catch (_) { /* 首次创建可能来自客户端并发的 add */ }

    // 3. 从云存储下载视频
    console.log(`[${taskId}] Downloading video: ${videoFileID}`)
    const videoRes = await cloud.downloadFile({ fileID: videoFileID })
    fs.writeFileSync(inputVideo, videoRes.fileContent)
    const videoSize = fs.statSync(inputVideo).size
    console.log(`[${taskId}] Video downloaded: ${(videoSize / 1024 / 1024).toFixed(2)}MB`)

    // 4. 效验文件大小
    if (videoSize > MAX_FILE_SIZE) {
      throw new Error(`文件超过大小限制 (${Math.round(videoSize / 1024 / 1024)}MB > ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`)
    }

    // 5. 可选：如果有封面图也下载
    // （wx.chooseMedia 可能不返回封面图，作为可选项处理）
    let hasCover = false
    if (imageFileID) {
      try {
        const imgRes = await cloud.downloadFile({ fileID: imageFileID })
        fs.writeFileSync(path.join(taskDir, 'input.HEIC'), imgRes.fileContent)
        hasCover = true
      } catch (e) {
        console.log(`[${taskId}] Cover download skipped: ${e.message}`)
      }
    }

    // 6. 验证 FFmpeg
    if (!fs.existsSync(FFMPEG_PATH)) {
      throw new Error(`FFmpeg 未找到 (${FFMPEG_PATH})，请检查 Layer 配置`)
    }

    // 7. 更新状态：转换中
    await db.collection('tasks').doc(taskId).update({
      data: { status: 'processing', updatedAt: db.serverDate() }
    })

    // 8. 执行 FFmpeg 转换
    const [width, height] = cfg.resolution.split('x')
    const filterStr = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${cfg.fps}`

    // 获取剩余可用时间
    const remaining = context.getRemainingTimeInMillis?.() ?? 60000
    const ffTimeout = Math.max(remaining - TIMEOUT_BUFFER_MS, 10000)

    console.log(`[${taskId}] Running FFmpeg: ${cfg.resolution} @ ${cfg.fps}fps, preset=${cfg.preset}, crf=${cfg.crf}, timeout=${ffTimeout}ms`)

    const ffmpegArgs = [
      '-i', inputVideo,
      '-vf', filterStr,
      '-c:v', 'libx264',
      '-preset', cfg.preset,
      '-crf', String(cfg.crf),
      '-pix_fmt', 'yuv420p',
      '-an',
      '-movflags', '+faststart',
      '-y',
      outputVideo,
    ]

    await ffmpegPromise(FFMPEG_PATH, ffmpegArgs, ffTimeout)

    const outputSize = fs.statSync(outputVideo).size
    console.log(`[${taskId}] FFmpeg done: ${(outputSize / 1024).toFixed(1)}KB`)

    // 9. 提取首帧作为封面
    try {
      const coverArgs = [
        '-i', outputVideo,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputCover,
      ]
      await ffmpegPromise(FFMPEG_PATH, coverArgs, 10000)
    } catch (e) {
      console.log(`[${taskId}] Cover extraction skipped: ${e.message}`)
    }

    // 10. 上传结果到云存储
    console.log(`[${taskId}] Uploading results...`)

    const videoUploadRes = await cloud.uploadFile({
      cloudPath: `outputs/${taskId}/result.mp4`,
      fileContent: fs.createReadStream(outputVideo),
    })

    let coverUploadRes = null
    if (fs.existsSync(outputCover)) {
      coverUploadRes = await cloud.uploadFile({
        cloudPath: `outputs/${taskId}/cover.jpg`,
        fileContent: fs.createReadStream(outputCover),
      })
    }

    // 11. 计算耗时
    const duration = Date.now() - startTime
    console.log(`[${taskId}] Completed in ${getHumanReadableDuration(duration / 1000)}`)

    // 12. 更新数据库为完成
    const updateData = {
      status: 'completed',
      updatedAt: db.serverDate(),
      processingDuration: duration,
      'outputFiles.videoFileID': videoUploadRes.fileID,
      'outputFiles.outputSize': outputSize,
    }
    if (coverUploadRes) {
      updateData['outputFiles.coverFileID'] = coverUploadRes.fileID
    }

    try {
      await db.collection('tasks').doc(taskId).update({ data: updateData })
    } catch (e) {
      console.error(`[${taskId}] DB update warning: ${e.message}`)
    }

    return {
      code: 0,
      data: {
        status: 'completed',
        outputVideoFileID: videoUploadRes.fileID,
        outputCoverFileID: coverUploadRes?.fileID || null,
        duration,
      }
    }

  } catch (err) {
    const duration = Date.now() - startTime
    console.error(`[${taskId}] Failed (${getHumanReadableDuration(duration / 1000)}): ${err.message}`)

    // 更新数据库为失败
    try {
      await db.collection('tasks').doc(taskId).update({
        data: {
          status: 'failed',
          updatedAt: db.serverDate(),
          errorMessage: err.message.slice(0, 500),
          processingDuration: duration,
        }
      })
    } catch (_) { /* 忽略 DB 错误 */ }

    return { code: 500, error: err.message }
  } finally {
    // 清理临时文件
    try {
      fs.rmSync(taskDir, { recursive: true, force: true })
    } catch (_) { /* 忽略清理错误 */ }
  }
}
