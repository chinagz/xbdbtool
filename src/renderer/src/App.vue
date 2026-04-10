<template>
  <div class="app-container">
    <!-- 顶部导航栏 -->
    <el-header class="app-header">
      <div class="logo">
        <el-icon :size="24"><DataAnalysis /></el-icon>
        <span>SQL执行工具</span>
      </div>
      <div class="header-actions">
        <el-button text @click="checkUpdate" :loading="checking">
          <el-icon><Refresh /></el-icon>
          检查更新
        </el-button>
      </div>
    </el-header>

    <!-- 主体内容 -->
    <el-container class="main-container">
      <!-- 侧边栏 -->
      <el-aside width="200px" class="app-aside">
        <el-menu
          :default-active="currentRoute"
          router
          class="side-menu"
        >
          <el-menu-item index="/connections">
            <el-icon><Connection /></el-icon>
            <span>连接管理</span>
          </el-menu-item>
          <el-menu-item index="/tasks">
            <el-icon><Document /></el-icon>
            <span>任务管理</span>
          </el-menu-item>
          <el-menu-item index="/execute">
            <el-icon><VideoPlay /></el-icon>
            <span>执行任务</span>
          </el-menu-item>
          <el-menu-item index="/reports">
            <el-icon><Document /></el-icon>
            <span>执行报告</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 内容区域 -->
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>

    <!-- 更新对话框 -->
    <el-dialog
      v-model="showUpdateDialog"
      title="软件更新"
      width="400px"
      :close-on-click-modal="false"
    >
      <div v-if="updateInfo.available" class="update-content">
        <el-icon :size="48" color="#67c23a"><CircleCheck /></el-icon>
        <p class="update-title">发现新版本</p>
        <p class="update-version">v{{ updateInfo.version }}</p>
        <p class="update-date">发布日期: {{ formatDate(updateInfo.releaseDate) }}</p>
        
        <!-- 下载进度 -->
        <div v-if="downloading" class="download-progress">
          <el-progress 
            :percentage="downloadProgress.percent" 
            :format="formatProgress"
          />
          <p class="progress-text">
            {{ formatBytes(downloadProgress.transferred) }} / {{ formatBytes(downloadProgress.total) }}
          </p>
        </div>
      </div>
      <div v-else class="update-content">
        <el-icon :size="48" color="#909399"><InfoFilled /></el-icon>
        <p class="update-title">已是最新版本</p>
        <p class="update-version">当前版本: v{{ currentVersion }}</p>
      </div>

      <template #footer>
        <el-button @click="showUpdateDialog = false">取消</el-button>
        <el-button 
          v-if="updateInfo.available && !downloading && !downloaded"
          type="primary" 
          @click="downloadUpdate"
        >
          下载更新
        </el-button>
        <el-button 
          v-if="downloaded"
          type="primary" 
          @click="installUpdate"
        >
          立即安装
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

// 当前路由
const route = useRoute()
const currentRoute = computed(() => route.path)

// 更新状态
const checking = ref(false)
const downloading = ref(false)
const downloaded = ref(false)
const showUpdateDialog = ref(false)
const currentVersion = ref('0.0.0')
const updateInfo = ref<{
  available: boolean
  version?: string
  releaseDate?: string
}>({
  available: false
})
const downloadProgress = ref<{
  percent: number
  transferred: number
  total: number
}>({
  percent: 0,
  transferred: 0,
  total: 0
})

// 清理函数
let cleanupAvailable: (() => void) | null = null
let cleanupProgress: (() => void) | null = null
let cleanupDownloaded: (() => void) | null = null

// 检查更新
const checkUpdate = async () => {
  checking.value = true
  try {
    // 获取当前版本
    currentVersion.value = await window.electronAPI.updater.getVersion()
    
    // 检查更新
    const result = await window.electronAPI.updater.checkForUpdate()
    updateInfo.value = result
    
    showUpdateDialog.value = true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '检查更新失败'
    ElMessage.error(message)
  } finally {
    checking.value = false
  }
}

// 下载更新
const downloadUpdate = async () => {
  downloading.value = true
  downloadProgress.value = { percent: 0, transferred: 0, total: 0 }
  
  try {
    await window.electronAPI.updater.downloadUpdate()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '下载更新失败'
    ElMessage.error(message)
    downloading.value = false
  }
}

// 安装更新
const installUpdate = () => {
  window.electronAPI.updater.installUpdate()
}

// 格式化日期
const formatDate = (date?: string) => {
  if (!date) return '未知'
  return new Date(date).toLocaleDateString('zh-CN')
}

// 格式化进度
const formatProgress = (percent: number) => {
  return `${percent.toFixed(1)}%`
}

// 格式化字节
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

// 组件挂载时设置更新监听
onMounted(async () => {
  // 获取当前版本
  currentVersion.value = await window.electronAPI.updater.getVersion()
  
  // 监听更新可用事件
  cleanupAvailable = window.electronAPI.updater.onUpdateAvailable((info) => {
    updateInfo.value = { 
      available: true, 
      version: info.version, 
      releaseDate: info.releaseDate 
    }
    showUpdateDialog.value = true
  })
  
  // 监听下载进度
  cleanupProgress = window.electronAPI.updater.onUpdateProgress((progress) => {
    downloadProgress.value = progress
  })
  
  // 监听下载完成
  cleanupDownloaded = window.electronAPI.updater.onUpdateDownloaded(() => {
    downloading.value = false
    downloaded.value = true
    ElMessage.success('更新下载完成')
  })
})

// 清理监听器
onUnmounted(() => {
  cleanupAvailable?.()
  cleanupProgress?.()
  cleanupDownloaded?.()
})
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #409eff;
  color: white;
  padding: 0 20px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: bold;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.header-actions .el-button {
  color: white;
}

.main-container {
  flex: 1;
  overflow: hidden;
}

.app-aside {
  background: #f5f7fa;
  border-right: 1px solid #e4e7ed;
}

.side-menu {
  border-right: none;
  height: 100%;
}

.app-main {
  background: #fff;
  padding: 20px;
  overflow: auto;
}

/* 更新对话框样式 */
.update-content {
  text-align: center;
  padding: 20px 0;
}

.update-title {
  font-size: 18px;
  font-weight: bold;
  margin: 16px 0 8px;
}

.update-version {
  font-size: 24px;
  color: #409eff;
  margin: 8px 0;
}

.update-date {
  color: #909399;
  font-size: 14px;
}

.download-progress {
  margin-top: 20px;
  padding: 0 20px;
}

.progress-text {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
