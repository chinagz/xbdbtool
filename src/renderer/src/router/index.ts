import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

// 路由配置
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/connections'
  },
  {
    path: '/connections',
    name: 'Connections',
    component: () => import('@/views/ConnectionsView.vue'),
    meta: { title: '连接管理' }
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('@/views/TasksView.vue'),
    meta: { title: '任务管理' }
  },
  {
    path: '/execute',
    name: 'Execute',
    component: () => import('@/views/ExecuteView.vue'),
    meta: { title: '执行任务' }
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/views/ReportsView.vue'),
    meta: { title: '执行报告' }
  }
]

// 创建路由实例
const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 路由守卫 - 设置页面标题
router.beforeEach((to, _from, next) => {
  document.title = (to.meta.title as string) || 'SQL执行工具'
  next()
})

export default router
