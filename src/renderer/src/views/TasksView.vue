<template>
  <div class="tasks-view">
    <div class="page-header">
      <h2>任务管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        新建任务
      </el-button>
    </div>

    <!-- 任务列表 -->
    <el-table :data="tasks" style="width: 100%" v-loading="loading">
      <el-table-column prop="name" label="任务名称" width="200" />
      <el-table-column prop="description" label="描述" width="200" />
      <el-table-column label="数据库连接" width="180">
        <template #default="{ row }">
          {{ getConnectionName(row.connectionId) }}
        </template>
      </el-table-column>
      <el-table-column prop="sqlFilePath" label="SQL文件" show-overflow-tooltip />
      <el-table-column prop="batchSize" label="批次大小" width="100" />
      <el-table-column prop="stopOnError" label="错误时停止" width="100">
        <template #default="{ row }">
          <el-tag :type="row.stopOnError ? 'danger' : 'success'">
            {{ row.stopOnError ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" width="200">
        <template #default="{ row }">
          <el-button size="small" type="success" @click="executeTask(row)">执行</el-button>
          <el-button size="small" type="primary" @click="editTask(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteTask(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建/编辑任务对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑任务' : '新建任务'"
      width="600px"
    >
      <el-form :model="formData" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="任务名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入任务名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="formData.description" type="textarea" placeholder="请输入任务描述" />
        </el-form-item>
        <el-form-item label="数据库连接" prop="connectionId">
          <el-select v-model="formData.connectionId" placeholder="请选择数据库连接">
            <el-option
              v-for="conn in connections"
              :key="conn.id"
              :label="conn.name"
              :value="conn.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="SQL文件" prop="sqlFilePath">
          <div class="file-input">
            <el-input v-model="formData.sqlFilePath" placeholder="请选择SQL文件" readonly />
            <el-button @click="selectSqlFile">选择文件</el-button>
          </div>
        </el-form-item>
        <el-form-item label="批次大小" prop="batchSize">
          <el-input-number v-model="formData.batchSize" :min="1" :max="10000" />
          <span class="form-tip">每批次执行的SQL语句数量</span>
        </el-form-item>
        <el-form-item label="错误处理" prop="stopOnError">
          <el-switch v-model="formData.stopOnError" />
          <span class="form-tip">遇到错误时是否停止执行</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTask" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import type { TaskConfig, ConnectionConfig } from '@/types'

const router = useRouter()

// 数据
const loading = ref(false)
const saving = ref(false)
const tasks = ref<TaskConfig[]>([])
const connections = ref<ConnectionConfig[]>([])
const dialogVisible = ref(false)
const isEditing = ref(false)
const formRef = ref<FormInstance>()

// 表单数据
const formData = reactive<Partial<TaskConfig>>({
  name: '',
  description: '',
  connectionId: '',
  sqlFilePath: '',
  batchSize: 100,
  stopOnError: true
})

// 表单验证规则
const formRules: FormRules = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  connectionId: [{ required: true, message: '请选择数据库连接', trigger: 'change' }],
  sqlFilePath: [{ required: true, message: '请选择SQL文件', trigger: 'change' }]
}

// 获取连接名称
const getConnectionName = (connectionId: string) => {
  const conn = connections.value.find(c => c.id === connectionId)
  return conn?.name || '未知连接'
}

// 加载任务列表
const loadTasks = async () => {
  loading.value = true
  try {
    tasks.value = await window.electronAPI.task.getAll()
  } catch (error) {
    ElMessage.error('加载任务列表失败')
    console.error(error)
  } finally {
    loading.value = false
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

// 选择SQL文件
const selectSqlFile = async () => {
  try {
    const filePath = await window.electronAPI.task.selectFile()
    if (filePath) {
      formData.sqlFilePath = filePath
    }
  } catch (error) {
    ElMessage.error('选择文件失败')
    console.error(error)
  }
}

// 显示创建对话框
const showCreateDialog = () => {
  isEditing.value = false
  Object.assign(formData, {
    name: '',
    description: '',
    connectionId: '',
    sqlFilePath: '',
    batchSize: 100,
    stopOnError: true
  })
  dialogVisible.value = true
}

// 编辑任务
const editTask = (task: TaskConfig) => {
  isEditing.value = true
  Object.assign(formData, task)
  dialogVisible.value = true
}

// 执行任务
const executeTask = (task: TaskConfig) => {
  router.push({ path: '/execute', query: { taskId: task.id } })
}

// 保存任务
const saveTask = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    
    saving.value = true
    try {
      const task: TaskConfig = {
        id: (formData as any).id || `task_${Date.now()}`,
        name: formData.name!,
        description: formData.description,
        connectionId: formData.connectionId!,
        sqlFilePath: formData.sqlFilePath!,
        batchSize: formData.batchSize!,
        stopOnError: formData.stopOnError!,
        createdAt: (formData as any).createdAt || new Date(),
        updatedAt: new Date()
      }
      
      if (isEditing.value) {
        await window.electronAPI.task.update(task)
      } else {
        await window.electronAPI.task.create(task)
      }
      
      ElMessage.success('保存成功')
      dialogVisible.value = false
      await loadTasks()
    } catch (error) {
      ElMessage.error('保存失败')
      console.error(error)
    } finally {
      saving.value = false
    }
  })
}

// 删除任务
const deleteTask = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除此任务吗？', '提示', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    await window.electronAPI.task.delete(id)
    ElMessage.success('删除成功')
    await loadTasks()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
      console.error(error)
    }
  }
}

// 初始化
onMounted(() => {
  loadTasks()
  loadConnections()
})
</script>

<style scoped>
.tasks-view {
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

.file-input {
  display: flex;
  gap: 10px;
}

.form-tip {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}
</style>
