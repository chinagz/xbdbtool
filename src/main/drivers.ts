/**
 * 数据库驱动管理模块
 * PostgreSQL 和 MySQL 驱动已内置打包，无需动态下载
 */
import type { DriverStatus, ConnectionTestParams } from '../renderer/src/types'

// 内置驱动
import * as pg from 'pg'
import * as mysql2 from 'mysql2'

// 驱动配置
const DRIVERS = {
  postgresql: {
    packageName: 'pg',
    displayName: 'PostgreSQL',
    module: pg
  },
  mysql: {
    packageName: 'mysql2',
    displayName: 'MySQL',
    module: mysql2
  }
}

/**
 * 检查驱动是否已安装（内置驱动始终已安装）
 */
export function checkDriver(type: 'postgresql' | 'mysql'): DriverStatus {
  const config = DRIVERS[type]
  const packageJson = require(`${config.packageName}/package.json`)
  
  return {
    type,
    installed: true,
    version: packageJson.version,
    path: `内置 (${config.packageName})`
  }
}

/**
 * 获取所有驱动状态
 */
export function getDriverStatus(): DriverStatus[] {
  return [
    checkDriver('postgresql'),
    checkDriver('mysql')
  ]
}

/**
 * 获取驱动模块
 */
export function getDriverModule(type: 'postgresql' | 'mysql'): any {
  return DRIVERS[type].module
}

/**
 * 测试数据库连接
 */
export async function testConnection(config: ConnectionTestParams): Promise<{ success: boolean; message: string }> {
  const driver = getDriverModule(config.type)
  
  return new Promise((resolve) => {
    try {
      if (config.type === 'postgresql') {
        // PostgreSQL 连接测试
        const client = new (driver as typeof pg).Client({
          host: config.host,
          port: config.port,
          user: config.username,
          password: config.password,
          database: config.database,
          connectionTimeoutMillis: 10000
        })
        
        client.connect((err: Error | null) => {
          if (err) {
            resolve({
              success: false,
              message: `连接失败: ${err.message}`
            })
          } else {
            client.end()
            resolve({
              success: true,
              message: '连接成功'
            })
          }
        })
      } else {
        // MySQL 连接测试
        const connection = (driver as typeof mysql2).createConnection({
          host: config.host,
          port: config.port,
          user: config.username,
          password: config.password,
          database: config.database,
          connectTimeout: 10000
        })
        
        connection.connect((err: Error | null) => {
          if (err) {
            resolve({
              success: false,
              message: `连接失败: ${err.message}`
            })
          } else {
            connection.end()
            resolve({
              success: true,
              message: '连接成功'
            })
          }
        })
      }
    } catch (e: any) {
      resolve({
        success: false,
        message: `连接测试失败: ${e.message}`
      })
    }
  })
}
