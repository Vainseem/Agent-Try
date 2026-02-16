#!/usr/bin/env node

/**
 * 自动检测可用端口并启动开发服务器
 * 如果 3000 端口被占用，自动尝试 3001, 3002, ... 直到找到可用端口
 */

const net = require('net');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 默认起始端口
const DEFAULT_PORT = 3000;
// 最大尝试次数
const MAX_PORT_ATTEMPTS = 10;

/**
 * 检查端口是否可用
 * @param {number} port - 要检查的端口号
 * @returns {Promise<boolean>} - 端口是否可用
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // 端口被占用
      } else {
        resolve(false); // 其他错误，认为不可用
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true); // 端口可用
    });

    server.listen(port);
  });
}

/**
 * 查找可用端口
 * @param {number} startPort - 起始端口
 * @param {number} maxAttempts - 最大尝试次数
 * @returns {Promise<number|null>} - 可用的端口号，如果都不可用则返回 null
 */
async function findAvailablePort(startPort, maxAttempts) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const available = await isPortAvailable(port);

    if (available) {
      return port;
    } else {
      console.log(`端口 ${port} 已被占用，尝试下一个...`);
    }
  }

  return null;
}

/**
 * 创建或更新 .env 文件中的 PORT 配置
 * @param {number} port - 端口号
 */
function setPortInEnv(port) {
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';

  // 如果 .env 文件存在，读取现有内容
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  // 检查是否已有 PORT 配置
  if (envContent.includes('PORT=')) {
    // 替换现有的 PORT 配置
    envContent = envContent.replace(/PORT=\d+/, `PORT=${port}`);
  } else {
    // 添加新的 PORT 配置
    envContent += `\nPORT=${port}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`✅ 已将端口配置写入 .env 文件: PORT=${port}`);
}

/**
 * 启动开发服务器
 * @param {number} port - 端口号
 */
function startDevServer(port) {
  console.log(`\n🚀 正在启动开发服务器... 端口: ${port}\n`);

  // 设置环境变量
  const env = { ...process.env, PORT: port.toString() };

  // 启动 react-scripts start
  const child = spawn('npm', ['run', 'react-start'], {
    stdio: 'inherit',
    shell: true,
    env
  });

  child.on('error', (error) => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ 进程退出，退出码: ${code}`);
      process.exit(code);
    }
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 正在检查可用端口...\n');

  const availablePort = await findAvailablePort(DEFAULT_PORT, MAX_PORT_ATTEMPTS);

  if (availablePort === null) {
    console.error(`❌ 错误: 无法找到可用端口 (尝试了 ${DEFAULT_PORT} - ${DEFAULT_PORT + MAX_PORT_ATTEMPTS - 1})`);
    console.error('请手动释放端口或指定其他端口范围。');
    process.exit(1);
  }

  if (availablePort !== DEFAULT_PORT) {
    console.log(`⚠️  默认端口 ${DEFAULT_PORT} 不可用`);
    console.log(`✅ 找到可用端口: ${availablePort}\n`);

    // 更新 .env 文件
    setPortInEnv(availablePort);
  } else {
    console.log(`✅ 端口 ${DEFAULT_PORT} 可用\n`);
  }

  // 启动开发服务器
  startDevServer(availablePort);
}

// 运行主函数
main().catch((error) => {
  console.error('❌ 发生错误:', error);
  process.exit(1);
});
