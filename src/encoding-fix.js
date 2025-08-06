/**
 * 编码修复模块
 * 解决Windows系统中文乱码问题
 */

function setupEncoding() {
  // 在Windows系统上设置正确的编码
  if (process.platform === 'win32') {
    // 设置控制台编码为UTF-8
    if (process.stdout.isTTY) {
      process.stdout.setEncoding('utf8');
    }
    if (process.stderr.isTTY) {
      process.stderr.setEncoding('utf8');
    }
    
    // 设置环境变量
    process.env.LANG = 'zh_CN.UTF-8';
    process.env.LC_ALL = 'zh_CN.UTF-8';
    
    // 尝试设置Windows控制台代码页为UTF-8
    try {
      const { execSync } = require('child_process');
      execSync('chcp 65001', { stdio: 'ignore' });
    } catch (error) {
      // 忽略错误，继续执行
    }
  }
}

module.exports = { setupEncoding };