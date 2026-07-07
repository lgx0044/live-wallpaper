// getStatus 云函数
// 功能：查询转码任务状态（轮询用）
// 轻量级，256MB / 5s 超时即可

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { taskId } = event

  if (!taskId) {
    return { code: 400, error: 'Missing taskId' }
  }

  try {
    const result = await db.collection('tasks').where({
      taskId
    }).get()

    if (!result.data || result.data.length === 0) {
      return { code: 404, error: 'Task not found' }
    }

    const task = result.data[0]

    return {
      code: 0,
      data: {
        taskId: task.taskId,
        status: task.status || 'unknown',
        outputVideoFileID: task.outputFiles?.videoFileID || null,
        outputCoverFileID: task.outputFiles?.coverFileID || null,
        errorMessage: task.errorMessage || null,
        processingDuration: task.processingDuration || null,
        createdAt: task.createdAt || null,
      }
    }
  } catch (err) {
    console.error('getStatus error:', err)
    return { code: 500, error: err.message }
  }
}
