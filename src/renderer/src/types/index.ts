// 数据库连接配置
export interface ConnectionConfig {
  id: string
  name: string
  type: 'postgresql' | 'mysql'
  host: string
  port: number
  username: string
  password: string
  database: string
  createdAt: Date
  updatedAt: Date
}

// 连接测试参数（只包含必要字段，避免 IPC 序列化 Date 对象）
export interface ConnectionTestParams {
  type: 'postgresql' | 'mysql'
  host: string
  port: number
  username: string
  password: string
  database: string
}

// 任务配置
export interface TaskConfig {
  id: string
  name: string
  description?: string
  connectionId: string
  sqlFilePath: string
  batchSize: number
  stopOnError: boolean
  createdAt: Date
  updatedAt: Date
}

// 任务执行参数（只包含必要字段，避免 IPC 序列化 Date 对象）
export interface TaskExecuteParams {
  id: string
  name: string
  connectionId: string
  sqlFilePath: string
  batchSize: number
  stopOnError: boolean
}

// 执行进度
export interface ExecutionProgress {
  taskId: string
  totalStatements: number
  executedStatements: number
  successfulStatements: number
  failedStatements: number
  currentStatement: string
  percent: number
  elapsedTime: number
  estimatedTime: number
  averageSpeed: number
  memoryUsage: number
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'error'
}

// 执行报告
export interface ExecutionReport {
  id: string
  taskId: string
  taskName: string
  connectionInfo: {
    name: string
    type: 'postgresql' | 'mysql'
    host: string
    database: string
  }
  sqlFilePath: string
  startTime: Date
  endTime: Date
  totalDuration: number
  status: 'success' | 'failed' | 'partial' | 'cancelled'
  totalStatements: number
  successfulStatements: number
  failedStatements: number
  averageSpeed: number
  peakMemoryMB: number
  errors: Array<{
    lineNumber: number
    statement: string
    error: string
    timestamp: Date
  }>
  details?: Array<any>
}

// 驱动状态
export interface DriverStatus {
  type: 'postgresql' | 'mysql'
  installed: boolean
  version?: string
  path?: string
}

// 更新进度
export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

// 更新信息
export interface UpdateInfo {
  version: string
  releaseDate: string
}

// Electron API 类型声明
declare global {
  interface Window {
    electronAPI: {
      platform: string
      
      // 连接管理
      connection: {
        getAll: () => Promise<ConnectionConfig[]>
        save: (connection: ConnectionConfig) => Promise<ConnectionConfig>
        delete: (id: string) => Promise<void>
        test: (connection: ConnectionTestParams) => Promise<{ success: boolean; message: string }>
      }
      
      // 任务管理
      task: {
        getAll: () => Promise<TaskConfig[]>
        create: (task: Omit<TaskConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TaskConfig>
        update: (task: TaskConfig) => Promise<TaskConfig>
        delete: (id: string) => Promise<void>
        execute: (task: TaskExecuteParams) => Promise<ExecutionReport>
        pause: (taskId: string) => Promise<boolean>
        resume: (taskId: string) => Promise<boolean>
        cancel: (taskId: string) => Promise<boolean>
        isExecuting: (taskId: string) => Promise<boolean>
        selectFile: () => Promise<string | null>
        onProgress: (callback: (progress: ExecutionProgress) => void) => () => void
        removeProgressListener: () => void
      }
      
      // 报告管理
      report: {
        getAll: () => Promise<ExecutionReport[]>
        get: (taskId: string) => Promise<ExecutionReport | null>
        delete: (id: string) => Promise<void>
        clear: () => Promise<void>
        export: (taskId: string, format: 'json' | 'csv' | 'txt') => Promise<string | null>
      }
      
      // 驱动管理（内置驱动）
      driver: {
        check: (type: 'postgresql' | 'mysql') => Promise<{ installed: boolean; version?: string }>
        status: () => Promise<{ postgresql: { installed: boolean; version?: string }; mysql: { installed: boolean; version?: string } }>
      }
      
      // 应用更新
      updater: {
        checkForUpdate: () => Promise<{ available: boolean; version?: string; releaseDate?: string }>
        downloadUpdate: () => Promise<void>
        installUpdate: () => Promise<void>
        getVersion: () => Promise<string>
        onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
        onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void
        onUpdateDownloaded: (callback: () => void) => () => void
      }
    }
  }
}

export {}
