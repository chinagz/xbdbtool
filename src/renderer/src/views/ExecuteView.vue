<template>
  <div class="execute-view">
    <div class="page-header">
      <h2>执行任务</h2>
    </div>

    <!-- 任务选择 -->
    <el-card v-if="!currentTask" shadow="never" class="task-select-card">
      <template #header>
        <span>选择要执行的任务</span>
      </template>
      <el-select v-model="selectedTaskId" placeholder="请选择任务" style="width: 300px" @change="loadTask">
        <el-option
          v-for="task in tasks"
          :key="task.id"
          :label="task.name"
          :value="task.id"
        />
      </el-select>
    </el-card>

    <!-- 任务详情 -->
    <template v-if="currentTask">
      <el-card shadow="never" class="task-info-card">
        <template #header>
          <div class="card-header">
            <span>任务信息</span>
            <el-button text @click="changeTask">更换任务</el-button>
          </div>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="任务名称">{{ currentTask.name }}</el-descriptions-item>
          <el-descriptions-item label="数据库连接">{{ getConnectionName(currentTask.connectionId) }}</el-descriptions-item>
          <el-descriptions-item label="SQL文件">{{ currentTask.sqlFilePath }}</el-descriptions-item>
          <el-descriptions-item label="批次大小">{{ currentTask.batchSize }}</el-descriptions-item>
          <el-descriptions-item label="错误处理">{{ currentTask.stopOnError ? '遇到错误停止' : '继续执行' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 执行控制 -->
      <el-card shadow="never" class="control-card">
        <template #header>
          <span>执行控制</span>
        </template>
        <div class="control-buttons">
          <el-button
            type="success"
            size="large"
            :disabled="progress.status === 'running'"
            :loading="starting"
            @click="startExecution"
          >
            <el-icon><VideoPlay /></el-icon>
            开始执行
          </el-button>
          <el-button
            type="warning"
            size="large"
            :disabled="progress.status !== 'running'"
            @click="pauseExecution"
          >
            <el-icon><VideoPause /></el-icon>
            暂停
          </el-button>
          <el-button
            type="primary"
            size="large"
            :disabled="progress.status !== 'paused'"
            @click="resumeExecution"
          >
            <el-icon><VideoPlay /></el-icon>
            继续
          </el-button>
          <el-button
            type="danger"
            size="large"
            :disabled="progress.status !== 'running' && progress.status !== 'paused'"
            @click="cancelExecution"
          >
            <el-icon><Close /></el-icon>
            取消
          </el-button>
        </div>
      </el-card>

      <!-- 执行进度 -->
      <el-card shadow="never" class="progress-card">
        <template #header>
          <span>执行进度</span>
        </template>
        <div class="progress-content">
          <!-- 进度条 -->
          <div class="progress-bar-container">
            <el-progress
              :percentage="progress.percent"
              :status="getProgressStatus()"
              :stroke-width="20"
              :text-inside="true"
            />
          </div>

          <!-- 统计信息 -->
          <el-row :gutter="20" class="stats-row">
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">总语句数</div>
                <div class="stat-value">{{ progress.totalStatements }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">已执行</div>
                <div class="stat-value success">{{ progress.executedStatements }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">成功</div>
                <div class="stat-value success">{{ progress.successfulStatements }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">失败</div>
                <div class="stat-value error">{{ progress.failedStatements }}</div>
              </div>
            </el-col>
          </el-row>

          <el-row :gutter="20" class="stats-row">
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">已用时间</div>
                <div class="stat-value">{{ formatTime(progress.elapsedTime) }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">预计剩余</div>
                <div class="stat-value">{{ formatTime(progress.estimatedTime) }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">执行速度</div>
                <div class="stat-value">{{ progress.averageSpeed.toFixed(1) }} 条/秒</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">内存使用</div>
                <div class="stat-value">{{ formatMemory(progress.memoryUsage) }}</div>
              </div>
            </el-col>
          </el-row>

          <!-- 当前执行的语句 -->
          <div class="current-statement">
            <div class="statement-label">当前执行:</div>
            <div class="statement-content">{{ progress.currentStatement || '-' }}</div>
          </div>

          <!-- 状态标签 -->
          <div class="status-tag">
            <el-tag :type="getStatusType()" size="large">
              {{ getStatusText() }}
            </el-tag>
          </div>
        </div>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TaskConfig, ConnectionConfig, ExecutionProgress } from '@/types'

const route = useRoute()

// 数据
const tasks = ref<TaskConfig[]>([])
const connections = ref<ConnectionConfig[]>([])
const selectedTaskId = ref<string>('')
const currentTask = ref<TaskConfig | null>(null)
const starting = ref(false)

// 执行进度
const progress = reactive<ExecutionProgress>({
  taskId: '',
  totalStatements: 0,
  executedStatements: 0,
  successfulStatements: 0,
  failedStatements: 0,
  currentStatement: '',
  percent: 0,
  elapsedTime: 0,
  estimatedTime: 0,
  averageSpeed: 0,
  memoryUsage: 0,
  status: 'completed'
})

// 获取连接名称
const getConnectionName = (connectionId: string) => {
  const conn = connections.value.find(c => c.id === connectionId)
  return conn?.name || '未知连接'
}

// 格式化时间
const formatTime = (ms: number) => {
  if (ms <= 0) return '-'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}小时${minutes % 60}分${seconds % 60}秒`
  } else if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`
  } else {
    return `${seconds}秒`
  }
}

// 格式化内存
const formatMemory = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// 获取进度条状态
const getProgressStatus = () => {
  switch (progress.status) {
    case 'completed': return 'success'
    case 'error': return 'exception'
    case 'cancelled': return 'warning'
    default: return undefined
  }
}

// 获取状态类型
const getStatusType = () => {
  switch (progress.status) {
    case 'running': return 'primary'
    case 'paused': return 'warning'
    case 'completed': return 'success'
    case 'error': return 'danger'
    case 'cancelled': return 'info'
    default: return 'info'
  }
}

// 获取状态文本
const getStatusText = () => {
  switch (progress.status) {
    case 'running': return '执行中'
    case 'paused': return '已暂停'
    case 'completed': return '已完成'
    case 'error': return '执行出错'
    case 'cancelled': return '已取消'
    default: return '未开始'
  }
}

// 加载任务列表
const loadTasks = async () => {
  try {
    tasks.value = await window.electronAPI.task.getAll()
  } catch (error) {
    console.error('加载任务列表失败:', error)
  }
}

// 加载连接列表
const loadConnections = async () => {
  try {
    connections.value = await window.electronAPI.connection.getAll()
  } catch (error) {
    console.error('加载连接列表失败:', error)
  }
}

// 加载任务
const loadTask = async () => {
  if (!selectedTaskId.value) return
  try {
    // 从任务列表中查找
    currentTask.value = tasks.value.find(t => t.id === selectedTaskId.value) || null
    if (!currentTask.value) {
      ElMessage.error('任务不存在')
      return
    }
    // 重置进度
    Object.assign(progress, {
      taskId: selectedTaskId.value,
      totalStatements: 0,
      executedStatements: 0,
      successfulStatements: 0,
      failedStatements: 0,
      currentStatement: '',
      percent: 0,
      elapsedTime: 0,
      estimatedTime: 0,
      averageSpeed: 0,
      memoryUsage: 0,
      status: 'completed'
    })
  } catch (error) {
    ElMessage.error('加载任务失败')
    console.error(error)
  }
}

// 更换任务
const changeTask = () => {
  currentTask.value = null
  selectedTaskId.value = ''
}

// 开始执行
const startExecution = async () => {
  if (!currentTask.value) return
  
  starting.value = true
  try {
    // 只传递执行需要的字段，避免 IPC 序列化 Date 对象出错
    await window.electronAPI.task.execute({
      id: currentTask.value.id,
      name: currentTask.value.name,
      connectionId: currentTask.value.connectionId,
      sqlFilePath: currentTask.value.sqlFilePath,
      batchSize: currentTask.value.batchSize,
      stopOnError: currentTask.value.stopOnError
    })
    ElMessage.success('任务开始执行')
  } catch (error) {
    ElMessage.error('启动任务失败')
    console.error(error)
  } finally {
    starting.value = false
  }
}

// 暂停执行
const pauseExecution = async () => {
  if (!currentTask.value) return
  try {
    await window.electronAPI.task.pause(currentTask.value.id)
    ElMessage.info('任务已暂停')
  } catch (error) {
    ElMessage.error('暂停任务失败')
    console.error(error)
  }
}

// 继续执行
const resumeExecution = async () => {
  if (!currentTask.value) return
  try {
    await window.electronAPI.task.resume(currentTask.value.id)
    ElMessage.success('任务继续执行')
  } catch (error) {
    ElMessage.error('继续任务失败')
    console.error(error)
  }
}

// 取消执行
const cancelExecution = async () => {
  if (!currentTask.value) return
  try {
    await ElMessageBox.confirm('确定要取消当前任务吗？', '提示', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    await window.electronAPI.task.cancel(currentTask.value.id)
    ElMessage.warning('任务已取消')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('取消任务失败')
      console.error(error)
    }
  }
}

// 监听进度更新
const handleProgress = (data: ExecutionProgress) => {
  Object.assign(progress, data)
}

// 初始化
onMounted(async () => {
  await Promise.all([loadTasks(), loadConnections()])
  
  // 检查 URL 参数
  const taskId = route.query.taskId as string
  if (taskId) {
    selectedTaskId.value = taskId
    await loadTask()
  }
  
  // 监听进度更新
  window.electronAPI.task.onProgress(handleProgress)
})

// 清理
onUnmounted(() => {
  window.electronAPI.task.removeProgressListener()
})
</script>

<style scoped>
.execute-view {
  height: 100%;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.task-select-card,
.task-info-card,
.control-card,
.progress-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-buttons {
  display: flex;
  gap: 15px;
  justify-content: center;
}

.progress-content {
  padding: 10px 0;
}

.progress-bar-container {
  margin-bottom: 30px;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-item {
  text-align: center;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.stat-value.success {
  color: #67c23a;
}

.stat-value.error {
  color: #f56c6c;
}

.current-statement {
  margin-top: 20px;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.statement-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.statement-content {
  font-family: monospace;
  font-size: 14px;
  color: #303133;
  word-break: break-all;
  max-height: 100px;
  overflow: auto;
}

.status-tag {
  text-align: center;
  margin-top: 20px;
}
</style>
