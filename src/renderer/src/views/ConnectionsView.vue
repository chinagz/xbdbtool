<template>
  <div class="connections-view">
    <div class="page-header">
      <h2>数据库连接管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        新建连接
      </el-button>
    </div>

    <!-- 驱动状态 -->
    <el-card class="driver-status-card" shadow="never">
      <template #header>
        <span>驱动状态（已内置）</span>
      </template>
      <div class="driver-list">
        <div v-for="driver in driverStatus" :key="driver.type" class="driver-item">
          <span class="driver-name">{{ driver.type === 'postgresql' ? 'PostgreSQL' : 'MySQL' }}</span>
          <el-tag type="success">
            已内置 v{{ driver.version || '-' }}
          </el-tag>
        </div>
      </div>
    </el-card>

    <!-- 连接列表 -->
    <el-table :data="connections" style="width: 100%" v-loading="loading">
      <el-table-column prop="name" label="连接名称" width="180" />
      <el-table-column prop="type" label="数据库类型" width="120">
        <template #default="{ row }">
          <el-tag>{{ row.type === 'postgresql' ? 'PostgreSQL' : 'MySQL' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="host" label="主机地址" width="180" />
      <el-table-column prop="port" label="端口" width="100" />
      <el-table-column prop="database" label="数据库" width="150" />
      <el-table-column prop="username" label="用户名" width="150" />
      <el-table-column label="操作" fixed="right" width="200">
        <template #default="{ row }">
          <el-button size="small" @click="testConnection(row)">测试连接</el-button>
          <el-button size="small" type="primary" @click="editConnection(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteConnection(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建/编辑连接对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑连接' : '新建连接'"
      width="500px"
    >
      <el-form :model="formData" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="连接名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入连接名称" />
        </el-form-item>
        <el-form-item label="数据库类型" prop="type">
          <el-select v-model="formData.type" placeholder="请选择数据库类型">
            <el-option label="PostgreSQL" value="postgresql" />
            <el-option label="MySQL" value="mysql" />
          </el-select>
        </el-form-item>
        <el-form-item label="主机地址" prop="host">
          <el-input v-model="formData.host" placeholder="请输入主机地址" />
        </el-form-item>
        <el-form-item label="端口" prop="port">
          <el-input-number v-model="formData.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="数据库名" prop="database">
          <el-input v-model="formData.database" placeholder="请输入数据库名" />
        </el-form-item>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="formData.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="formData.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveConnection" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import type { ConnectionConfig, DriverStatus } from '@/types'

// 数据
const loading = ref(false)
const saving = ref(false)
const connections = ref<ConnectionConfig[]>([])
const driverStatus = ref<DriverStatus[]>([])
const dialogVisible = ref(false)
const isEditing = ref(false)
const formRef = ref<FormInstance>()

// 表单数据
const formData = reactive<Partial<ConnectionConfig>>({
  name: '',
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: '',
  username: '',
  password: ''
})

// 表单验证规则
const formRules: FormRules = {
  name: [{ required: true, message: '请输入连接名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择数据库类型', trigger: 'change' }],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口', trigger: 'blur' }],
  database: [{ required: true, message: '请输入数据库名', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }]
}

// 加载连接列表
const loadConnections = async () => {
  loading.value = true
  try {
    connections.value = await window.electronAPI.connection.getAll()
  } catch (error) {
    ElMessage.error('加载连接列表失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

// 加载驱动状态
const loadDriverStatus = async () => {
  try {
    const status = await window.electronAPI.driver.status()
    driverStatus.value = [
      { type: 'postgresql', ...status.postgresql },
      { type: 'mysql', ...status.mysql }
    ]
  } catch (error) {
    console.error('加载驱动状态失败:', error)
  }
}

// 显示创建对话框
const showCreateDialog = () => {
  isEditing.value = false
  Object.assign(formData, {
    name: '',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: ''
  })
  dialogVisible.value = true
}

// 编辑连接
const editConnection = (connection: ConnectionConfig) => {
  isEditing.value = true
  Object.assign(formData, connection)
  dialogVisible.value = true
}

// 测试连接
const testConnection = async (connection: ConnectionConfig) => {
  try {
    // 只传递连接测试需要的字段，避免 IPC 序列化 Date 对象出错
    const result = await window.electronAPI.connection.test({
      type: connection.type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database
    })
    if (result.success) {
      ElMessage.success('连接成功')
    } else {
      ElMessage.error(`连接失败: ${result.message}`)
    }
  } catch (error) {
    ElMessage.error('连接测试失败')
    console.error(error)
  }
}

// 保存连接
const saveConnection = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    
    saving.value = true
    try {
      const connection: ConnectionConfig = {
        id: (formData as any).id || `conn_${Date.now()}`,
        name: formData.name!,
        type: formData.type!,
        host: formData.host!,
        port: formData.port!,
        database: formData.database!,
        username: formData.username!,
        password: formData.password!,
        createdAt: (formData as any).createdAt || new Date(),
        updatedAt: new Date()
      }
      
      await window.electronAPI.connection.save(connection)
      ElMessage.success('保存成功')
      dialogVisible.value = false
      await loadConnections()
    } catch (error) {
      ElMessage.error('保存失败')
      console.error(error)
    } finally {
      saving.value = false
    }
  })
}

// 删除连接
const deleteConnection = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除此连接吗？', '提示', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    await window.electronAPI.connection.delete(id)
    ElMessage.success('删除成功')
    await loadConnections()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
      console.error(error)
    }
  }
}

// 初始化
onMounted(() => {
  loadConnections()
  loadDriverStatus()
})
</script>

<style scoped>
.connections-view {
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

.driver-status-card {
  margin-bottom: 20px;
}

.driver-list {
  display: flex;
  gap: 20px;
}

.driver-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.driver-name {
  font-weight: bold;
  min-width: 100px;
}
</style>
