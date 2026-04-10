/**
 * SQL 执行引擎
 * 支持大文件流式处理，使用 Worker 线程保护 UI
 */
import { BrowserWindow } from 'electron'
import { Worker } from 'worker_threads'
import { join } from 'path'
import type { ConnectionConfig, ExecutionProgress, ExecutionReport } from '../renderer/src/types'
import { getDriverModule } from './drivers'
import { randomUUID } from 'crypto'

// 执行上下文
interface ExecutionContext {
  taskId: string
  taskName: string
  connection: ConnectionConfig
  sqlFilePath: string
  batchSize: number
  stopOnError: boolean
  mainWindow: BrowserWindow
  isPaused: boolean
  isCancelled: boolean
  startTime: Date
  totalStatements: number
  executedStatements: number
  successfulStatements: number
  failedStatements: number
  errors: Array<{ lineNumber: number; statement: string; error: string; timestamp: Date }>
  peakMemoryMB: number
  worker?: Worker
}

// 活动执行映射
const activeExecutions = new Map<string, ExecutionContext>()

/**
 * 开始执行任务
 */
export async function startExecution(
  taskId: string,
  taskName: string,
  connection: ConnectionConfig,
  sqlFilePath: string,
  batchSize: number,
  stopOnError: boolean,
  mainWindow: BrowserWindow
): Promise<ExecutionReport> {
  // 检查是否已有执行中的任务
  if (activeExecutions.has(taskId)) {
    throw new Error('该任务正在执行中')
  }
  
  // 检查驱动是否已安装
  const driver = getDriverModule(connection.type)
  if (!driver) {
    throw new Error(`${connection.type === 'postgresql' ? 'PostgreSQL' : 'MySQL'} 驱动未安装`)
  }
  
  // 创建执行上下文
  const context: ExecutionContext = {
    taskId,
    taskName,
    connection,
    sqlFilePath,
    batchSize,
    stopOnError,
    mainWindow,
    isPaused: false,
    isCancelled: false,
    startTime: new Date(),
    totalStatements: 0,
    executedStatements: 0,
    successfulStatements: 0,
    failedStatements: 0,
    errors: [],
    peakMemoryMB: 0
  }
  
  activeExecutions.set(taskId, context)
  
  // 发送初始进度
  sendProgress(context, {
    taskId,
    status: 'running',
    currentStatement: '',
    totalStatements: 0,
    executedStatements: 0,
    successfulStatements: 0,
    failedStatements: 0,
    percent: 0,
    elapsedTime: 0,
    estimatedTime: 0,
    averageSpeed: 0,
    memoryUsage: 0
  })
  
  try {
    // 使用 Worker 线程执行
    return await executeInWorker(context)
  } catch (error: any) {
    console.error('执行失败:', error)
    context.errors.push({
      lineNumber: 0,
      statement: '',
      error: error.message,
      timestamp: new Date()
    })
    // 返回失败报告
    const report: ExecutionReport = {
      id: randomUUID(),
      taskId: context.taskId,
      taskName: context.taskName,
      connectionInfo: {
        name: context.connection.name,
        type: context.connection.type,
        host: context.connection.host,
        database: context.connection.database
      },
      sqlFilePath: context.sqlFilePath,
      startTime: context.startTime,
      endTime: new Date(),
      totalDuration: Date.now() - context.startTime.getTime(),
      status: 'failed',
      totalStatements: context.totalStatements,
      successfulStatements: context.successfulStatements,
      failedStatements: context.failedStatements,
      averageSpeed: 0,
      peakMemoryMB: context.peakMemoryMB,
      errors: context.errors
    }
    activeExecutions.delete(context.taskId)
    return report
  }
}

/**
 * 在 Worker 线程中执行 SQL
 */
function executeInWorker(context: ExecutionContext): Promise<ExecutionReport> {
  return new Promise((resolve, reject) => {
    // 使用独立的 worker 文件
    const workerPath = join(__dirname, 'worker.js')
    console.log('[主进程] 创建 Worker, 路径:', workerPath)
    console.log('[主进程] SQL文件:', context.sqlFilePath)
    
    const worker = new Worker(workerPath, {
      workerData: {
        connection: context.connection,
        sqlFilePath: context.sqlFilePath,
        batchSize: context.batchSize,
        stopOnError: context.stopOnError
      }
    })
    
    // 保存 worker 引用
    context.worker = worker
    
    // 接收 Worker 消息
    worker.on('message', (message: any) => {
      console.log('[主进程] 收到 Worker 消息:', message.type, message)
      if (message.type === 'progress') {
        context.totalStatements = message.totalStatements
        context.executedStatements = message.executedStatements
        context.successfulStatements = message.successfulStatements
        context.failedStatements = message.failedStatements
        context.peakMemoryMB = Math.max(context.peakMemoryMB, message.peakMemoryMB)
        
        if (message.error) {
          context.errors.push({
            lineNumber: message.error.lineNumber,
            statement: message.error.statement,
            error: message.error.error,
            timestamp: new Date()
          })
        }
        
        // 发送进度到渲染进程
        sendProgress(context, {
          taskId: context.taskId,
          status: context.isPaused ? 'paused' : (context.isCancelled ? 'cancelled' : 'running'),
          currentStatement: message.currentStatementPreview || '',
          totalStatements: message.totalStatements,
          executedStatements: message.executedStatements,
          successfulStatements: message.successfulStatements,
          failedStatements: message.failedStatements,
          percent: message.percent,
          elapsedTime: Date.now() - context.startTime.getTime(),
          estimatedTime: message.estimatedRemainingTime || 0,
          averageSpeed: message.currentSpeed || 0,
          memoryUsage: message.peakMemoryMB || 0
        })
      } else if (message.type === 'complete') {
        // 执行完成，生成报告
        const report: ExecutionReport = {
          id: randomUUID(),
          taskId: context.taskId,
          taskName: context.taskName,
          connectionInfo: {
            name: context.connection.name,
            type: context.connection.type,
            host: context.connection.host,
            database: context.connection.database
          },
          sqlFilePath: context.sqlFilePath,
          startTime: context.startTime,
          endTime: new Date(),
          totalDuration: Date.now() - context.startTime.getTime(),
          status: context.isCancelled ? 'cancelled' : 
                  (context.failedStatements === 0 ? 'success' : 
                   (context.successfulStatements === 0 ? 'failed' : 'partial')),
          totalStatements: context.totalStatements,
          successfulStatements: context.successfulStatements,
          failedStatements: context.failedStatements,
          averageSpeed: message.averageSpeed || 0,
          peakMemoryMB: context.peakMemoryMB,
          errors: context.errors
        }
        
        activeExecutions.delete(context.taskId)
        resolve(report)
      } else if (message.type === 'error') {
        activeExecutions.delete(context.taskId)
        reject(new Error(message.error))
      }
    })
    
    worker.on('error', (error) => {
      console.error('[主进程] Worker 错误:', error)
      activeExecutions.delete(context.taskId)
      reject(error)
    })
    
    worker.on('exit', (code) => {
      console.log('[主进程] Worker 退出, 退出码:', code)
      if (code !== 0) {
        activeExecutions.delete(context.taskId)
        reject(new Error(`Worker 退出码: ${code}`))
      }
    })
  })
}

/**
 * 发送进度到渲染进程
 */
function sendProgress(context: ExecutionContext, progress: ExecutionProgress): void {
  context.mainWindow.webContents.send('task:progress', progress)
}

/**
 * 暂停执行
 */
export function pauseExecution(taskId: string): void {
  const context = activeExecutions.get(taskId)
  if (context) {
    context.isPaused = true
    context.worker?.postMessage({ action: 'pause' })
  }
}

/**
 * 恢复执行
 */
export function resumeExecution(taskId: string): void {
  const context = activeExecutions.get(taskId)
  if (context) {
    context.isPaused = false
    context.worker?.postMessage({ action: 'resume' })
  }
}

/**
 * 取消执行
 */
export function cancelExecution(taskId: string): void {
  const context = activeExecutions.get(taskId)
  if (context) {
    context.isCancelled = true
    context.worker?.postMessage({ action: 'cancel' })
  }
}

/**
 * 检查任务是否正在执行
 */
export function isExecuting(taskId: string): boolean {
  return activeExecutions.has(taskId)
}
