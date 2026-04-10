import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'

// 更新状态
interface UpdateStatus {
  checking: boolean
  available: boolean
  downloading: boolean
  downloaded: boolean
  error: string | null
  progress: {
    percent: number
    transferred: number
    total: number
  } | null
  version: string | null
  releaseDate: string | null
}

// 当前状态
let status: UpdateStatus = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  error: null,
  progress: null,
  version: null,
  releaseDate: null
}

// 主窗口引用
let mainWindow: BrowserWindow | null = null

// 初始化自动更新
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window
  
  // 配置自动更新
  autoUpdater.autoDownload = false  // 不自动下载，由用户手动触发
  autoUpdater.autoInstallOnAppQuit = true  // 退出时自动安装
  
  // 检查更新失败
  autoUpdater.on('error', (error) => {
    status.checking = false
    status.downloading = false
    status.error = error.message
    sendStatusToWindow()
  })
  
  // 检查更新中
  autoUpdater.on('checking-for-update', () => {
    status.checking = true
    status.error = null
    sendStatusToWindow()
  })
  
  // 发现新版本
  autoUpdater.on('update-available', (info) => {
    status.checking = false
    status.available = true
    status.version = info.version
    status.releaseDate = info.releaseDate || null
    
    // 发送更新可用通知
    mainWindow?.webContents.send('updater:available', {
      version: info.version,
      releaseDate: info.releaseDate
    })
    
    sendStatusToWindow()
  })
  
  // 没有新版本
  autoUpdater.on('update-not-available', () => {
    status.checking = false
    status.available = false
    sendStatusToWindow()
  })
  
  // 下载进度
  autoUpdater.on('download-progress', (progress) => {
    status.downloading = true
    status.progress = {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    }
    
    // 发送下载进度
    mainWindow?.webContents.send('updater:progress', status.progress)
    
    sendStatusToWindow()
  })
  
  // 下载完成
  autoUpdater.on('update-downloaded', (info) => {
    status.downloading = false
    status.downloaded = true
    status.version = info.version
    status.progress = null
    
    // 发送下载完成通知
    mainWindow?.webContents.send('updater:downloaded')
    
    sendStatusToWindow()
  })
}

// 发送状态到窗口
function sendStatusToWindow(): void {
  mainWindow?.webContents.send('updater:status', status)
}

// 检查更新
export async function checkForUpdate(): Promise<{ available: boolean; version?: string; releaseDate?: string }> {
  try {
    // 开发环境模拟
    if (process.env.NODE_ENV === 'development') {
      return {
        available: true,
        version: '1.0.1',
        releaseDate: new Date().toISOString()
      }
    }
    
    await autoUpdater.checkForUpdates()
    
    return {
      available: status.available,
      version: status.version || undefined,
      releaseDate: status.releaseDate || undefined
    }
  } catch (error: any) {
    status.error = error.message
    return {
      available: false
    }
  }
}

// 下载更新
export async function downloadUpdate(): Promise<void> {
  if (!status.available) {
    throw new Error('没有可用的更新')
  }
  
  if (status.downloading) {
    throw new Error('正在下载中')
  }
  
  // 开发环境模拟
  if (process.env.NODE_ENV === 'development') {
    throw new Error('开发环境无法下载更新，请在打包后的应用中测试更新功能')
  }
  
  try {
    status.downloading = true
    await autoUpdater.downloadUpdate()
  } catch (error: any) {
    status.downloading = false
    status.error = error.message
    throw error
  }
}

// 安装更新
export function installUpdate(): void {
  if (!status.downloaded) {
    throw new Error('更新尚未下载完成')
  }
  
  // 退出并安装
  autoUpdater.quitAndInstall()
}

// 获取当前版本
export function getCurrentVersion(): string {
  try {
    // 从 package.json 读取版本
    const packagePath = join(__dirname, '../../package.json')
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
    return packageJson.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// 获取更新状态
export function getUpdateStatus(): UpdateStatus {
  return { ...status }
}
