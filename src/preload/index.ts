import { contextBridge, ipcRenderer } from 'electron'
import type { ConnectionConfig, ConnectionTestParams, TaskConfig, TaskExecuteParams, ExecutionProgress, ExecutionReport } from '../renderer/src/types'

// 调试：preload 脚本开始执行
console.log('=== Preload 脚本开始执行 ===')
console.log('contextBridge:', typeof contextBridge)
console.log('ipcRenderer:', typeof ipcRenderer)

// 通过 contextBridge 暴露安全的 API 给渲染进程
const electronAPI = {
  // 平台信息
  platform: process.platform,
  
  // ==================== 连接管理 ====================
  connection: {
    // 获取所有连接
    getAll: (): Promise<ConnectionConfig[]> => ipcRenderer.invoke('connection:get-all'),
    
    // 保存连接
    save: (connection: ConnectionConfig): Promise<ConnectionConfig> => 
      ipcRenderer.invoke('connection:save', connection),
    
    // 删除连接
    delete: (id: string): Promise<void> => ipcRenderer.invoke('connection:delete', id),
    
    // 测试连接
    test: (connection: ConnectionTestParams): Promise<{ success: boolean; message: string }> => 
      ipcRenderer.invoke('connection:test', connection),
  },
  
  // ==================== 任务管理 ====================
  task: {
    // 获取所有任务
    getAll: (): Promise<TaskConfig[]> => ipcRenderer.invoke('task:get-all'),
    
    // 创建任务
    create: (task: Omit<TaskConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskConfig> => 
      ipcRenderer.invoke('task:create', task),
    
    // 更新任务
    update: (task: TaskConfig): Promise<TaskConfig> => ipcRenderer.invoke('task:update', task),
    
    // 删除任务
    delete: (id: string): Promise<void> => ipcRenderer.invoke('task:delete', id),
    
    // 执行任务
    execute: (task: TaskExecuteParams): Promise<ExecutionReport> => ipcRenderer.invoke('task:execute', task),
    
    // 暂停任务
    pause: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:pause', taskId),
    
    // 恢复任务
    resume: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:resume', taskId),
    
    // 取消任务
    cancel: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:cancel', taskId),
    
    // 检查任务是否正在执行
    isExecuting: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:is-executing', taskId),
    
    // 选择 SQL 文件
    selectFile: (): Promise<string | null> => ipcRenderer.invoke('task:select-file'),
    
    // 监听执行进度
    onProgress: (callback: (progress: ExecutionProgress) => void) => {
      const handler = (_event: any, progress: ExecutionProgress) => callback(progress)
      ipcRenderer.on('task:progress', handler)
      return () => ipcRenderer.removeListener('task:progress', handler)
    },
    
    // 移除进度监听
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners('task:progress')
    },
  },
  
  // ==================== 报告管理 ====================
  report: {
    // 获取所有报告
    getAll: (): Promise<ExecutionReport[]> => ipcRenderer.invoke('report:get-all'),
    
    // 获取单个报告（根据报告 ID 查询）
    get: (id: string): Promise<ExecutionReport | null> => 
      ipcRenderer.invoke('report:get', id),
    
    // 删除报告
    delete: (id: string): Promise<void> => ipcRenderer.invoke('report:delete', id),
    
    // 清空所有报告
    clear: (): Promise<void> => ipcRenderer.invoke('report:clear'),
    
    // 导出报告
    export: (taskId: string, format: 'json' | 'csv' | 'txt'): Promise<string | null> => 
      ipcRenderer.invoke('report:export', taskId, format),
  },
  
  // ==================== 驱动管理（内置驱动，无需下载） ====================
  driver: {
    // 获取驱动状态
    status: (): Promise<{ 
      postgresql: { installed: boolean; version?: string }; 
      mysql: { installed: boolean; version?: string } 
    }> => ipcRenderer.invoke('driver:status'),
  },
  
  // ==================== 应用更新 ====================
  updater: {
    // 获取当前版本
    getVersion: (): Promise<string> => ipcRenderer.invoke('updater:version'),
    
    // 检查更新
    checkForUpdate: (): Promise<{ available: boolean; version?: string; releaseDate?: string }> => 
      ipcRenderer.invoke('updater:check'),
    
    // 下载更新
    downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
    
    // 安装更新
    installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    
    // 监听更新可用
    onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => {
      const handler = (_event: any, info: any) => callback(info)
      ipcRenderer.on('updater:available', handler)
      return () => ipcRenderer.removeListener('updater:available', handler)
    },
    
    // 监听更新下载进度
    onUpdateProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => {
      const handler = (_event: any, progress: any) => callback(progress)
      ipcRenderer.on('updater:progress', handler)
      return () => ipcRenderer.removeListener('updater:progress', handler)
    },
    
    // 监听更新下载完成
    onUpdateDownloaded: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('updater:downloaded', handler)
      return () => ipcRenderer.removeListener('updater:downloaded', handler)
    },
  },
}

// 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 类型声明
export type ElectronAPI = typeof electronAPI
