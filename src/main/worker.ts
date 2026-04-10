/**
 * SQL 执行 Worker
 * 在独立线程中执行 SQL，避免阻塞主进程
 */
import { statSync } from 'fs'
import { parentPort, workerData } from 'worker_threads'
import type { ConnectionConfig } from '../renderer/src/types'

// 内置驱动 - 直接导入，避免依赖 Electron API
import * as pg from 'pg'
import * as mysql2 from 'mysql2'

// 驱动映射
const DRIVERS = {
  postgresql: pg,
  mysql: mysql2
}

interface WorkerData {
  connection: ConnectionConfig
  sqlFilePath: string
  batchSize: number
  stopOnError: boolean
}

/**
 * 创建数据库连接
 */
async function createConnection(driver: any, config: ConnectionConfig): Promise<any> {
  if (config.type === 'postgresql') {
    const client = new (driver as typeof pg).Client({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      connectionTimeoutMillis: 30000
    })
    await client.connect()
    return client
  } else {
    // MySQL
    const connection = (driver as typeof mysql2).createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      connectTimeout: 30000,
      multipleStatements: true
    })
    return new Promise((resolve, reject) => {
      connection.connect((err: Error | null) => {
        if (err) reject(err)
        else resolve(connection)
      })
    })
  }
}

/**
 * 执行 SQL 语句
 */
async function executeStatement(db: any, statement: string, connectionType: string): Promise<{ success: boolean; error?: string; rowCount?: number }> {
  try {
    if (connectionType === 'postgresql') {
      const result = await db.query(statement)
      return { success: true, rowCount: result.rowCount || result.rows?.length || 0 }
    } else {
      // MySQL
      return new Promise((resolve) => {
        db.query(statement, (err: Error | null, result: any) => {
          if (err) {
            resolve({ success: false, error: err.message })
          } else {
            const rowCount = Array.isArray(result) ? result.length : (result.affectedRows || 0)
            resolve({ success: true, rowCount })
          }
        })
      })
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 关闭数据库连接
 */
async function closeConnection(db: any, connectionType: string): Promise<void> {
  try {
    if (connectionType === 'postgresql') {
      await db.end()
    } else {
      // MySQL
      await new Promise<void>((resolve) => {
        db.end((err: Error | null) => {
          if (err) console.error('关闭连接失败:', err)
          resolve()
        })
      })
    }
  } catch (error) {
    console.error('关闭连接失败:', error)
  }
}

/**
 * 解析 SQL 文件内容，拆分为独立语句
 */
function parseSQL(content: string): string[] {
  const statements: string[] = []
  let currentStatement = ''
  let inString = false
  let stringChar = ''
  let inComment = false
  let commentType = ''
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    
    // 处理字符串
    if (!inComment && (char === "'" || char === '"')) {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        // 检查是否是转义引号
        if (content[i + 1] === stringChar) {
          currentStatement += char + content[i + 1]
          i++
          continue
        }
        inString = false
      }
      currentStatement += char
      continue
    }
    
    if (inString) {
      currentStatement += char
      continue
    }
    
    // 处理单行注释 --
    if (!inComment && char === '-' && content[i + 1] === '-') {
      inComment = true
      commentType = 'line'
      i++ // 跳过第二个 -
      continue
    }
    
    // 处理多行注释 /* */
    if (!inComment && char === '/' && content[i + 1] === '*') {
      inComment = true
      commentType = 'block'
      i++ // 跳过 *
      continue
    }
    
    if (inComment) {
      if (commentType === 'line' && (char === '\n' || char === '\r')) {
        inComment = false
      } else if (commentType === 'block' && char === '*' && content[i + 1] === '/') {
        inComment = false
        i++ // 跳过 /
      }
      continue
    }
    
    // 语句结束符
    if (char === ';') {
      currentStatement = currentStatement.trim()
      if (currentStatement) {
        statements.push(currentStatement)
      }
      currentStatement = ''
    } else {
      currentStatement += char
    }
  }
  
  // 处理最后一个没有分号的语句
  currentStatement = currentStatement.trim()
  if (currentStatement) {
    statements.push(currentStatement)
  }
  
  return statements
}

/**
 * Worker 主函数
 */
async function runWorker() {
  const { connection, sqlFilePath, batchSize, stopOnError } = workerData as WorkerData
  
  console.log('[Worker] 开始执行, SQL文件路径:', sqlFilePath)
  
  // 获取驱动
  const driver = DRIVERS[connection.type]
  if (!driver) {
    console.log('[Worker] 驱动未安装:', connection.type)
    parentPort?.postMessage({
      type: 'error',
      error: '驱动未安装'
    })
    return
  }
  
  let db: any = null
  let isPaused = false
  let isCancelled = false
  
  // 监听主线程消息
  parentPort?.on('message', (msg) => {
    if (msg.action === 'pause') {
      isPaused = true
    } else if (msg.action === 'resume') {
      isPaused = false
    } else if (msg.action === 'cancel') {
      isCancelled = true
    }
  })
  
  try {
    // 创建数据库连接
    console.log('[Worker] 创建数据库连接...')
    db = await createConnection(driver, connection)
    console.log('[Worker] 数据库连接成功')
    
    // 获取文件大小
    const stats = statSync(sqlFilePath)
    const fileSize = stats.size
    console.log('[Worker] SQL文件大小:', fileSize, 'bytes')
    
    // 读取整个文件内容
    const fs = await import('fs/promises')
    const content = await fs.readFile(sqlFilePath, 'utf8')
    console.log('[Worker] 文件内容长度:', content.length, '字符')
    
    // 解析 SQL 语句
    const statements: string[] = parseSQL(content)
    const totalStatements = statements.length
    console.log('[Worker] 解析出', totalStatements, '条SQL语句')
    
    let executedStatements = 0
    let successfulStatements = 0
    let failedStatements = 0
    const errors: Array<{ lineNumber: number; statement: string; error: string; timestamp: Date }> = []
    const startTime = Date.now()
    let peakMemoryMB = 0
    
    // 发送初始进度
    parentPort?.postMessage({
      type: 'progress',
      totalStatements,
      executedStatements: 0,
      successfulStatements: 0,
      failedStatements: 0,
      percent: 0,
      estimatedRemainingTime: 0,
      currentSpeed: 0,
      peakMemoryMB: 0,
      currentStatementPreview: '准备开始执行...'
    })
    
    // 按批次执行 SQL 语句
    const actualBatchSize = batchSize > 0 ? batchSize : 1
    console.log('[Worker] 批次大小:', actualBatchSize)
    
    for (let batchStart = 0; batchStart < statements.length; batchStart += actualBatchSize) {
      // 检查是否取消
      if (isCancelled) {
        break
      }
      
      // 暂停等待
      while (isPaused && !isCancelled) {
        await new Promise(r => setTimeout(r, 100))
      }
      
      if (isCancelled) {
        break
      }
      
      // 获取当前批次的语句
      const batchEnd = Math.min(batchStart + actualBatchSize, statements.length)
      const batchStatements = statements.slice(batchStart, batchEnd)
      
      // 执行当前批次
      for (let i = 0; i < batchStatements.length; i++) {
        const statementIndex = batchStart + i
        const statement = batchStatements[i].trim()
        if (!statement) {
          continue
        }
        
        // 执行语句
        const result = await executeStatement(db, statement, connection.type)
        executedStatements++
        
        if (result.success) {
          successfulStatements++
        } else {
          failedStatements++
          errors.push({
            lineNumber: statementIndex + 1,
            statement: statement.substring(0, 200),
            error: result.error || '未知错误',
            timestamp: new Date()
          })
          
          // 如果设置了出错停止，则中断执行
          if (stopOnError) {
            console.log('[Worker] 遇到错误，停止执行')
            break
          }
        }
      }
      
      // 批次结束后计算进度并发送
      const percent = Math.round((executedStatements / totalStatements) * 100)
      const elapsed = Date.now() - startTime
      const avgTime = executedStatements > 0 ? elapsed / executedStatements : 0
      const remaining = (totalStatements - executedStatements) * avgTime
      
      // 获取内存使用
      const memUsage = process.memoryUsage()
      const currentMemoryMB = Math.round(memUsage.heapUsed / 1024 / 1024)
      peakMemoryMB = Math.max(peakMemoryMB, currentMemoryMB)
      
      // 发送进度
      parentPort?.postMessage({
        type: 'progress',
        totalStatements,
        executedStatements,
        successfulStatements,
        failedStatements,
        percent,
        estimatedRemainingTime: remaining,
        currentSpeed: executedStatements > 0 ? executedStatements / (elapsed / 1000) : 0,
        peakMemoryMB,
        currentStatementPreview: `批次 ${Math.floor(batchStart / actualBatchSize) + 1}/${Math.ceil(totalStatements / actualBatchSize)} - 已执行 ${executedStatements}/${totalStatements} 条`
      })
      
      // 如果出错停止，跳出外层循环
      if (stopOnError && failedStatements > 0) {
        break
      }
    }
    
    // 关闭数据库连接
    await closeConnection(db, connection.type)
    
    // 发送完成消息
    const finalElapsed = Date.now() - startTime
    parentPort?.postMessage({
      type: 'complete',
      totalStatements,
      executedStatements,
      successfulStatements,
      failedStatements,
      errors,
      peakMemoryMB,
      totalDuration: finalElapsed
    })
    
    console.log('[Worker] 执行完成, 成功:', successfulStatements, '失败:', failedStatements)
    
  } catch (error: any) {
    console.error('[Worker] 执行出错:', error)
    if (db) {
      await closeConnection(db, connection.type)
    }
    parentPort?.postMessage({
      type: 'error',
      error: error.message
    })
  }
}

// 启动 Worker
runWorker()
