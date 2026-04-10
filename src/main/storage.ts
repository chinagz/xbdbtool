/**
 * SQLite 本地存储模块
 * 用于持久化存储连接配置、任务配置和执行报告
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, existsSync } from 'fs'
import type { ConnectionConfig, TaskConfig, ExecutionReport } from '../renderer/src/types'

// 数据库实例
let db: Database.Database | null = null

/**
 * 初始化数据库
 */
export function initDatabase(): void {
  try {
    // 获取用户数据目录
    let userDataPath = app.getPath('userData')
    
    // 开发环境：如果无法写入 userData 目录，使用项目目录
    if (process.env.NODE_ENV === 'development' || !userDataPath) {
      const devDataPath = join(process.cwd(), 'dev-data')
      if (!existsSync(devDataPath)) {
        mkdirSync(devDataPath, { recursive: true })
      }
      userDataPath = devDataPath
    }
    
    const dbPath = join(userDataPath, 'xbdbtool.db')
    
    console.log('数据库路径:', dbPath)
    console.log('用户数据目录:', userDataPath)
    
    // 创建或打开数据库
    console.log('正在打开数据库...')
    db = new Database(dbPath)
    console.log('数据库打开成功')
    
    // 启用外键约束
    db.pragma('foreign_keys = ON')
    
    // 创建表
    createTables()
  } catch (error) {
    console.error('数据库初始化失败:', error)
    throw error
  }
}

/**
 * 创建数据表
 */
function createTables(): void {
  if (!db) return
  
  // 连接配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      database TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  
  // 任务配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      connection_id TEXT NOT NULL,
      sql_file_path TEXT NOT NULL,
      batch_size INTEGER NOT NULL DEFAULT 100,
      stop_on_error INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    )
  `)
  
  // 执行报告表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_name TEXT NOT NULL,
      connection_info TEXT NOT NULL,
      sql_file_path TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_duration INTEGER NOT NULL,
      status TEXT NOT NULL,
      total_statements INTEGER NOT NULL DEFAULT 0,
      successful_statements INTEGER NOT NULL DEFAULT 0,
      failed_statements INTEGER NOT NULL DEFAULT 0,
      average_speed REAL NOT NULL DEFAULT 0,
      peak_memory_mb REAL NOT NULL DEFAULT 0,
      errors TEXT,
      details TEXT
    )
  `)
  
  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_connection ON tasks(connection_id)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reports_task ON reports(task_id)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reports_start_time ON reports(start_time)
  `)
}

// ==================== 连接配置相关 ====================

/**
 * 获取所有连接配置
 */
export function getConnections(): ConnectionConfig[] {
  if (!db) return []
  
  const stmt = db.prepare('SELECT * FROM connections ORDER BY created_at DESC')
  const rows = stmt.all() as any[]
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    database: row.database,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }))
}

/**
 * 保存连接配置（新增或更新）
 */
export function saveConnection(connection: ConnectionConfig): void {
  if (!db) return
  
  const stmt = db.prepare(`
    INSERT INTO connections (id, name, type, host, port, username, password, database, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      host = excluded.host,
      port = excluded.port,
      username = excluded.username,
      password = excluded.password,
      database = excluded.database,
      updated_at = excluded.updated_at
  `)
  
  stmt.run(
    connection.id,
    connection.name,
    connection.type,
    connection.host,
    connection.port,
    connection.username,
    connection.password,
    connection.database,
    connection.createdAt.toISOString(),
    connection.updatedAt.toISOString()
  )
}

/**
 * 删除连接配置
 */
export function deleteConnection(id: string): void {
  if (!db) return
  
  const stmt = db.prepare('DELETE FROM connections WHERE id = ?')
  stmt.run(id)
}

/**
 * 根据 ID 获取连接配置
 */
export function getConnection(id: string): ConnectionConfig | null {
  if (!db) return null
  
  const stmt = db.prepare('SELECT * FROM connections WHERE id = ?')
  const row = stmt.get(id) as any
  
  if (!row) return null
  
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    database: row.database,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

// ==================== 任务配置相关 ====================

/**
 * 获取所有任务配置
 */
export function getTasks(): TaskConfig[] {
  if (!db) return []
  
  const stmt = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC')
  const rows = stmt.all() as any[]
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    connectionId: row.connection_id,
    sqlFilePath: row.sql_file_path,
    batchSize: row.batch_size,
    stopOnError: row.stop_on_error === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }))
}

/**
 * 根据 ID 获取任务配置
 */
export function getTask(id: string): TaskConfig | null {
  if (!db) return null
  
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?')
  const row = stmt.get(id) as any
  
  if (!row) return null
  
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    connectionId: row.connection_id,
    sqlFilePath: row.sql_file_path,
    batchSize: row.batch_size,
    stopOnError: row.stop_on_error === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

/**
 * 创建任务配置
 */
export function createTask(task: TaskConfig): void {
  if (!db) return
  
  const stmt = db.prepare(`
    INSERT INTO tasks (id, name, description, connection_id, sql_file_path, batch_size, stop_on_error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  stmt.run(
    task.id,
    task.name,
    task.description || null,
    task.connectionId,
    task.sqlFilePath,
    task.batchSize,
    task.stopOnError ? 1 : 0,
    task.createdAt.toISOString(),
    task.updatedAt.toISOString()
  )
}

/**
 * 更新任务配置
 */
export function updateTask(task: TaskConfig): void {
  if (!db) return
  
  const stmt = db.prepare(`
    UPDATE tasks SET
      name = ?,
      description = ?,
      connection_id = ?,
      sql_file_path = ?,
      batch_size = ?,
      stop_on_error = ?,
      updated_at = ?
    WHERE id = ?
  `)
  
  stmt.run(
    task.name,
    task.description || null,
    task.connectionId,
    task.sqlFilePath,
    task.batchSize,
    task.stopOnError ? 1 : 0,
    task.updatedAt.toISOString(),
    task.id
  )
}

/**
 * 删除任务配置
 */
export function deleteTask(id: string): void {
  if (!db) return
  
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?')
  stmt.run(id)
}

// ==================== 执行报告相关 ====================

/**
 * 获取所有执行报告
 */
export function getReports(): ExecutionReport[] {
  if (!db) return []
  
  const stmt = db.prepare('SELECT * FROM reports ORDER BY start_time DESC')
  const rows = stmt.all() as any[]
  
  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    connectionInfo: JSON.parse(row.connection_info),
    sqlFilePath: row.sql_file_path,
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    totalDuration: row.total_duration,
    status: row.status,
    totalStatements: row.total_statements,
    successfulStatements: row.successful_statements,
    failedStatements: row.failed_statements,
    averageSpeed: row.average_speed,
    peakMemoryMB: row.peak_memory_mb,
    errors: row.errors ? JSON.parse(row.errors) : [],
    details: row.details ? JSON.parse(row.details) : undefined
  }))
}

/**
 * 根据 ID 获取执行报告
 */
export function getReport(id: string): ExecutionReport | null {
  if (!db) return null
  
  const stmt = db.prepare('SELECT * FROM reports WHERE id = ?')
  const row = stmt.get(id) as any
  
  if (!row) return null
  
  return {
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    connectionInfo: JSON.parse(row.connection_info),
    sqlFilePath: row.sql_file_path,
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    totalDuration: row.total_duration,
    status: row.status,
    totalStatements: row.total_statements,
    successfulStatements: row.successful_statements,
    failedStatements: row.failed_statements,
    averageSpeed: row.average_speed,
    peakMemoryMB: row.peak_memory_mb,
    errors: row.errors ? JSON.parse(row.errors) : [],
    details: row.details ? JSON.parse(row.details) : undefined
  }
}

/**
 * 保存执行报告
 */
export function saveReport(report: ExecutionReport): void {
  if (!db) return
  
  const stmt = db.prepare(`
    INSERT INTO reports (
      id, task_id, task_name, connection_info, sql_file_path,
      start_time, end_time, total_duration, status,
      total_statements, successful_statements, failed_statements,
      average_speed, peak_memory_mb, errors, details
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  stmt.run(
    report.id,
    report.taskId,
    report.taskName,
    JSON.stringify(report.connectionInfo),
    report.sqlFilePath,
    report.startTime.toISOString(),
    report.endTime.toISOString(),
    report.totalDuration,
    report.status,
    report.totalStatements,
    report.successfulStatements,
    report.failedStatements,
    report.averageSpeed,
    report.peakMemoryMB,
    JSON.stringify(report.errors),
    report.details ? JSON.stringify(report.details) : null
  )
}

/**
 * 删除执行报告
 */
export function deleteReport(id: string): void {
  if (!db) return
  
  const stmt = db.prepare('DELETE FROM reports WHERE id = ?')
  stmt.run(id)
}

/**
 * 清空所有执行报告
 */
export function clearReports(): void {
  if (!db) return
  
  db.exec('DELETE FROM reports')
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
