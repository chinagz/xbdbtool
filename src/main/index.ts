import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, getConnections, saveConnection, deleteConnection, getTasks, createTask, updateTask, deleteTask, getReports, saveReport, deleteReport, clearReports, getConnection } from './storage'
import { checkDriver, getDriverStatus, testConnection } from './drivers'
import { startExecution, pauseExecution, resumeExecution, cancelExecution, isExecuting } from './executor'
import { initAutoUpdater, checkForUpdate, downloadUpdate, installUpdate, getCurrentVersion, getUpdateStatus } from './updater'
import type { ConnectionConfig, ConnectionTestParams, TaskConfig, TaskExecuteParams, ExecutionReport } from '../renderer/src/types'

// 主窗口引用
let mainWindow: BrowserWindow | null = null

// 创建主窗口
function createWindow(): void {
  // 调试：打印 preload 路径
  const preloadPath = join(__dirname, '../preload/index.js')
  console.log('__dirname:', __dirname)
  console.log('preload 路径:', preloadPath)
  console.log('preload 文件是否存在:', require('fs').existsSync(preloadPath))
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 窗口准备好后显示
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // 开发模式下打开开发者工具
    if (is.dev) {
      mainWindow?.webContents.openDevTools()
    }
  })

  // 加载页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  
  // 初始化热更新（生产环境）
  if (!is.dev) {
    initAutoUpdater(mainWindow)
  }
}

// 注册 IPC 处理程序
function registerIpcHandlers(): void {
  // ==================== 连接管理 ====================
  
  // 获取所有连接
  ipcMain.handle('connection:get-all', () => {
    return getConnections()
  })
  
  // 保存连接
  ipcMain.handle('connection:save', (_, connection: ConnectionConfig) => {
    saveConnection(connection)
    return connection
  })
  
  // 删除连接
  ipcMain.handle('connection:delete', (_, id: string) => {
    deleteConnection(id)
  })
  
  // 测试连接
  ipcMain.handle('connection:test', async (_, connection: ConnectionTestParams) => {
    return await testConnection(connection)
  })
  
  // ==================== 任务管理 ====================
  
  // 获取所有任务
  ipcMain.handle('task:get-all', () => {
    return getTasks()
  })
  
  // 创建任务
  ipcMain.handle('task:create', (_, taskData: Omit<TaskConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date()
    const task: TaskConfig = {
      ...taskData,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    }
    createTask(task)
    return task
  })
  
  // 更新任务
  ipcMain.handle('task:update', (_, task: TaskConfig) => {
    task.updatedAt = new Date()
    updateTask(task)
    return task
  })
  
  // 删除任务
  ipcMain.handle('task:delete', (_, id: string) => {
    deleteTask(id)
  })
  
  // 执行任务
  ipcMain.handle('task:execute', async (_, task: TaskExecuteParams) => {
    if (!mainWindow) {
      throw new Error('主窗口未初始化')
    }
    
    if (isExecuting(task.id)) {
      throw new Error('任务正在执行中')
    }
    
    // 获取连接配置
    const connection = getConnection(task.connectionId)
    if (!connection) {
      throw new Error('数据库连接不存在')
    }
    
    try {
      const report = await startExecution(
        task.id,
        task.name,
        connection,
        task.sqlFilePath,
        task.batchSize,
        task.stopOnError,
        mainWindow
      )
      
      // 保存执行报告
      saveReport(report)
      
      return report
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      throw new Error(errorMessage)
    }
  })
  
  // 暂停任务
  ipcMain.handle('task:pause', (_, taskId: string) => {
    pauseExecution(taskId)
    return true
  })
  
  // 恢复任务
  ipcMain.handle('task:resume', (_, taskId: string) => {
    resumeExecution(taskId)
    return true
  })
  
  // 取消任务
  ipcMain.handle('task:cancel', (_, taskId: string) => {
    cancelExecution(taskId)
    return true
  })
  
  // 检查任务是否正在执行
  ipcMain.handle('task:is-executing', (_, taskId: string) => {
    return isExecuting(taskId)
  })
  
  // 选择 SQL 文件
  ipcMain.handle('task:select-file', async () => {
    if (!mainWindow) {
      throw new Error('主窗口未初始化')
    }
    
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 SQL 文件',
      filters: [
        { name: 'SQL 文件', extensions: ['sql'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    
    return result.filePaths[0]
  })
  
  // ==================== 报告管理 ====================
  
  // 获取所有报告
  ipcMain.handle('report:get-all', () => {
    return getReports()
  })
  
  // 获取单个报告
  ipcMain.handle('report:get', (_, taskId: string) => {
    const reports = getReports()
    return reports.find(r => r.taskId === taskId) || null
  })
  
  // 删除报告
  ipcMain.handle('report:delete', (_, id: string) => {
    deleteReport(id)
  })
  
  // 清空所有报告
  ipcMain.handle('report:clear', () => {
    clearReports()
  })
  
  // 导出报告
  ipcMain.handle('report:export', async (_, taskId: string, format: 'json' | 'csv' | 'txt') => {
    if (!mainWindow) {
      throw new Error('主窗口未初始化')
    }
    
    const reports = getReports()
    const report = reports.find(r => r.taskId === taskId)
    
    if (!report) {
      throw new Error('报告不存在')
    }
    
    // 选择保存路径
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出报告',
      defaultPath: `report-${taskId}.${format}`,
      filters: [
        { name: format.toUpperCase(), extensions: [format] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    
    if (result.canceled || !result.filePath) {
      return null
    }
    
    // 根据格式导出
    const fs = await import('fs')
    let content: string
    
    if (format === 'json') {
      content = JSON.stringify(report, null, 2)
    } else if (format === 'csv') {
      // CSV 格式
      const lines = [
        '字段,值',
        `任务名称,${report.taskName}`,
        `连接信息,${report.connectionInfo.name} (${report.connectionInfo.type})`,
        `SQL 文件,${report.sqlFilePath}`,
        `开始时间,${report.startTime}`,
        `结束时间,${report.endTime}`,
        `总耗时,${report.totalDuration}ms`,
        `状态,${report.status}`,
        `总语句数,${report.totalStatements}`,
        `成功数,${report.successfulStatements}`,
        `失败数,${report.failedStatements}`,
        `平均速度,${report.averageSpeed} 条/秒`,
        `峰值内存,${report.peakMemoryMB}MB`
      ]
      
      if (report.errors.length > 0) {
        lines.push('', '错误详情:')
        report.errors.forEach((err, i) => {
          lines.push(`错误 ${i + 1},行号 ${err.lineNumber},${err.error}`)
        })
      }
      
      content = lines.join('\n')
    } else {
      // 默认文本格式
      content = `
SQL 执行报告
============

任务名称: ${report.taskName}
连接信息: ${report.connectionInfo.name} (${report.connectionInfo.type})
SQL 文件: ${report.sqlFilePath}

执行时间
--------
开始时间: ${report.startTime}
结束时间: ${report.endTime}
总耗时: ${report.totalDuration}ms

执行结果
--------
状态: ${report.status}
总语句数: ${report.totalStatements}
成功数: ${report.successfulStatements}
失败数: ${report.failedStatements}
平均速度: ${report.averageSpeed} 条/秒
峰值内存: ${report.peakMemoryMB}MB

${report.errors.length > 0 ? `错误详情
--------
${report.errors.map((err, i) => `
错误 ${i + 1}:
  行号: ${err.lineNumber}
  语句: ${err.statement.substring(0, 100)}...
  错误: ${err.error}
`).join('\n')}` : '无错误'}
`.trim()
    }
    
    fs.writeFileSync(result.filePath, content, 'utf8')
    return result.filePath
  })
  
  // ==================== 驱动管理 ====================
  
  // 检查驱动
  ipcMain.handle('driver:check', (_, type: 'postgresql' | 'mysql') => {
    return checkDriver(type)
  })
  
  // 获取驱动状态
  ipcMain.handle('driver:status', () => {
    const status = getDriverStatus()
    return {
      postgresql: { 
        installed: status[0].installed, 
        version: status[0].version 
      },
      mysql: { 
        installed: status[1].installed, 
        version: status[1].version 
      }
    }
  })
  
  // ==================== 热更新管理 ====================
  
  // 检查更新
  ipcMain.handle('updater:check', async () => {
    return await checkForUpdate()
  })
  
  // 下载更新
  ipcMain.handle('updater:download', async () => {
    await downloadUpdate()
  })
  
  // 安装更新
  ipcMain.handle('updater:install', () => {
    installUpdate()
  })
  
  // 获取当前版本
  ipcMain.handle('updater:version', () => {
    return getCurrentVersion()
  })
  
  // 获取更新状态
  ipcMain.handle('updater:status', () => {
    return getUpdateStatus()
  })
}

// 应用程序就绪
app.whenReady().then(() => {
  // 初始化数据库
  initDatabase()
  
  // 为 Windows 设置应用用户模型 ID
  electronApp.setAppUserModelId('com.xbdbtool')

  // 在开发环境中默认通过 F12 打开或关闭开发工具
  // 并在生产环境中忽略 CommandOrControl + R
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 注册 IPC 处理程序
  registerIpcHandlers()

  createWindow()

  // macOS 特有：点击 dock 图标时重新创建窗口
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 所有窗口关闭时退出应用（Windows & Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
