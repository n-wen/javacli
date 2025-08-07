const chalk = require('chalk');
const Scanner = require('./scanner');
const Analyzer = require('./analyzer');
const IndexManager = require('./index-manager');

/**
 * 简单菜单界面
 */
class SimpleUI {
  constructor(projectPath, options = {}) {
    const path = require('path');
    this.projectPath = path.resolve(projectPath);
    this.endpoints = [];
    this.useAsync = options.useAsync || false;
  }

  async run() {
    console.log(chalk.blue('🔍 正在分析Java Spring项目...'));
    console.log(chalk.gray(`项目路径: ${this.projectPath}`));
    
    try {
      // 检查是否是Spring项目
      const isSpring = await Scanner.isSpringProject(this.projectPath);
      if (!isSpring) {
        console.log(chalk.yellow('⚠️  未检测到Spring项目特征，继续分析Java文件...'));
      }

      // 加载或创建索引
      const indexExists = IndexManager.indexExists(this.projectPath);
      let endpoints = [];
      
      if (indexExists) {
        console.log(chalk.green('📁 发现现有索引，正在加载...'));
        endpoints = await IndexManager.loadIndex(this.projectPath);
      } else {
        console.log(chalk.blue('🔄 未找到索引，正在扫描项目...'));
        endpoints = await this.scanProject();
      }

      if (endpoints.length === 0) {
        console.log(chalk.yellow('📄 未找到任何HTTP端点'));
        return;
      }

      this.endpoints = endpoints;
      this.displayEndpoints();
      
    } catch (error) {
      console.error(chalk.red(`❌ 错误: ${error.message}`));
      process.exit(1);
    }
  }

  async scanProject() {
    console.log(chalk.blue('📂 扫描Java文件...'));
    const { javaFiles, moduleInfo } = await Scanner.scanJavaFiles(this.projectPath);
    
    if (javaFiles.length === 0) {
      throw new Error('未找到任何Java文件');
    }

    console.log(chalk.green(`✅ 找到 ${javaFiles.length} 个Java文件`));
    
    console.log(chalk.blue('🔍 分析端点...'));
    const { endpoints } = await Analyzer.analyzeEndpoints(this.projectPath, { 
      useAsync: this.useAsync 
    });
    
    // 统计控制器数量
    const controllerFiles = new Set(endpoints.map(ep => ep.className)).size;
    
    console.log(chalk.green(`✅ 找到 ${endpoints.length} 个端点，${controllerFiles} 个控制器`));

    // 保存索引
    await IndexManager.saveIndex(this.projectPath, endpoints, {
      totalEndpoints: endpoints.length,
      controllerFiles: controllerFiles,
      totalJavaFiles: javaFiles.length,
      scanDurationMs: 0, // 简化处理
      methodCounts: this.getMethodCounts(endpoints)
    });

    return endpoints;
  }

  getMethodCounts(endpoints) {
    const counts = {};
    endpoints.forEach(ep => {
      counts[ep.method] = (counts[ep.method] || 0) + 1;
    });
    return counts;
  }

  displayEndpoints() {
    console.log('\n' + chalk.bold.blue('='.repeat(50)));
    console.log(chalk.bold.blue('📋 发现的HTTP端点'));
    console.log(chalk.bold.blue('='.repeat(50)));
    
    // 按方法分组
    const grouped = {};
    this.endpoints.forEach(ep => {
      if (!grouped[ep.method]) grouped[ep.method] = [];
      grouped[ep.method].push(ep);
    });

    Object.keys(grouped).sort().forEach(method => {
      console.log(`\n${chalk.bold.green(method)} (${grouped[method].length}):`);
      grouped[method].forEach(ep => {
        const moduleInfo = ep.moduleName ? `[${ep.moduleName}] ` : '';
        console.log(`  ${chalk.cyan(ep.path)} - ${moduleInfo}${ep.className}.${ep.methodName}()`);
      });
    });

    console.log(`\n${chalk.bold.green('总计:')} ${this.endpoints.length} 个端点`);
  }
}

module.exports = SimpleUI;