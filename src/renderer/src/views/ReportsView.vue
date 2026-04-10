<template>
  <div class="reports-view">
    <div class="page-header">
      <h2>执行报告</h2>
      <el-button @click="clearReports" :disabled="reports.length === 0">
        <el-icon><Delete /></el-icon>
        清空报告
      </el-button>
    </div>

    <!-- 报告列表 -->
    <el-table :data="reports" style="width: 100%" v-loading="loading" @row-click="showReportDetail">
      <el-table-column prop="taskName" label="任务名称" width="200" />
      <el-table-column label="执行状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'">
            {{ row.status === 'success' ? '成功' : row.status === 'failed' ? '失败' : row.status === 'partial' ? '部分成功' : '已取消' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="totalStatements" label="总语句数" width="100" />
      <el-table-column prop="successfulStatements" label="成功数" width="100">
        <template #default="{ row }">
          <span class="success-text">{{ row.successfulStatements }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="failedStatements" label="失败数" width="100">
        <template #default="{ row }">
          <span :class="row.failedStatements > 0 ? 'error-text' : ''">{{ row.failedStatements }}</span>
        </template>
      </el-table-column>
      <el-table-column label="执行时间" width="150">
        <template #default="{ row }">
          {{ formatDuration(row.startTime, row.endTime) }}
        </template>
      </el-table-column>
      <el-table-column prop="startTime" label="开始时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.startTime) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" width="150">
        <template #default="{ row }">
          <el-button size="small" @click.stop="showReportDetail(row)">查看详情</el-button>
          <el-button size="small" type="danger" @click.stop="deleteReport(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 报告详情对话框 -->
    <el-dialog
      v-model="detailVisible"
      :title="`执行报告 - ${currentReport?.taskName || ''}`"
      width="800px"
    >
      <template v-if="currentReport">
        <!-- 基本信息 -->
        <el-descriptions :column="2" border class="report-info">
          <el-descriptions-item label="任务名称">{{ currentReport.taskName }}</el-descriptions-item>
          <el-descriptions-item label="执行状态">
            <el-tag :type="currentReport.status === 'success' ? 'success' : currentReport.status === 'failed' ? 'danger' : 'warning'">
              {{ currentReport.status === 'success' ? '成功' : currentReport.status === 'failed' ? '失败' : currentReport.status === 'partial' ? '部分成功' : '已取消' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatDateTime(currentReport.startTime) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ formatDateTime(currentReport.endTime) }}</el-descriptions-item>
          <el-descriptions-item label="执行时长">{{ formatDuration(currentReport.startTime, currentReport.endTime) }}</el-descriptions-item>
          <el-descriptions-item label="平均速度">{{ currentReport.averageSpeed.toFixed(1) }} 条/秒</el-descriptions-item>
        </el-descriptions>

        <!-- 统计信息 -->
        <div class="stats-section">
          <h4>执行统计</h4>
          <el-row :gutter="20">
            <el-col :span="6">
              <div class="stat-card">
                <div class="stat-value">{{ currentReport.totalStatements }}</div>
                <div class="stat-label">总语句数</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-card success">
                <div class="stat-value">{{ currentReport.successfulStatements }}</div>
                <div class="stat-label">成功</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-card error">
                <div class="stat-value">{{ currentReport.failedStatements }}</div>
                <div class="stat-label">失败</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-card">
                <div class="stat-value">{{ currentReport.peakMemoryMB.toFixed(1) }} MB</div>
                <div class="stat-label">峰值内存</div>
              </div>
            </el-col>
          </el-row>
        </div>

        <!-- 错误列表 -->
        <div v-if="currentReport.errors && currentReport.errors.length > 0" class="errors-section">
          <h4>错误详情 ({{ currentReport.errors.length }}条)</h4>
          <el-table :data="currentReport.errors" max-height="300">
            <el-table-column prop="lineNumber" label="行号" width="80" />
            <el-table-column prop="statement" label="SQL语句" show-overflow-tooltip />
            <el-table-column prop="error" label="错误信息" show-overflow-tooltip />
          </el-table>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ExecutionReport } from '@/types'

// 数据
const loading = ref(false)
const reports = ref<ExecutionReport[]>([])
const detailVisible = ref(false)
const currentReport = ref<ExecutionReport | null>(null)

// 格式化日期时间
const formatDateTime = (date: Date | string) => {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 格式化持续时间
const formatDuration = (startTime: Date | string, endTime: Date | string) => {
  if (!startTime || !endTime) return '-'
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  const duration = end - start
  
  const seconds = Math.floor(duration / 1000)
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

// 加载报告列表
const loadReports = async () => {
  loading.value = true
  try {
    reports.value = await window.electronAPI.report.getAll()
    // 按时间倒序排列
    reports.value.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  } catch (error) {
    ElMessage.error('加载报告列表失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

// 显示报告详情
const showReportDetail = async (report: ExecutionReport) => {
  try {
    currentReport.value = await window.electronAPI.report.get(report.id)
    detailVisible.value = true
  } catch (error) {
    ElMessage.error('加载报告详情失败')
    console.error(error)
  }
}

// 删除报告
const deleteReport = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除此报告吗？', '提示', {
      type: 'warning'
    })
    await window.electronAPI.report.delete(id)
    ElMessage.success('删除成功')
    await loadReports()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
      console.error(error)
    }
  }
}

// 清空报告
const clearReports = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有报告吗？此操作不可恢复。', '警告', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    await window.electronAPI.report.clear()
    ElMessage.success('清空成功')
    await loadReports()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('清空失败')
      console.error(error)
    }
  }
}

// 初始化
onMounted(() => {
  loadReports()
})
</script>

<style scoped>
.reports-view {
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.success-text {
  color: #67c23a;
  font-weight: bold;
}

.error-text {
  color: #f56c6c;
  font-weight: bold;
}

.report-info {
  margin-bottom: 20px;
}

.stats-section {
  margin-bottom: 20px;
}

.stats-section h4 {
  margin-bottom: 15px;
  color: #303133;
}

.stat-card {
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 4px;
}

.stat-card.success {
  background: #f0f9eb;
}

.stat-card.error {
  background: #fef0f0;
}

.stat-card .stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.stat-card.success .stat-value {
  color: #67c23a;
}

.stat-card.error .stat-value {
  color: #f56c6c;
}

.stat-card .stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}

.errors-section h4 {
  margin-bottom: 15px;
  color: #303133;
}
</style>
