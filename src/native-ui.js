const chalk = require('chalk');
const Scanner = require('./scanner');
const Analyzer = require('./analyzer');
const IndexManager = require('./index-manager');

/**
 * Native UI - 使用原生控制台输出
 */
class NativeUI {
  constructor(options = {}) {
    const path = require('path');
    this.projectPath = path.resolve(options.projectPath || process.cwd());
    this.verbose = options.verbose || false;
  }

  /**
   * 运行分析
   */
  async run() {
    try {
      console.log(chalk.blue.bold('🔍 正在分析Spring项目...'));
      console.log(chalk.gray(`项目路径: ${this.projectPath}`));
      console.log();

      const endpoints = await this.scanProject();
      
      if (endpoints.length === 0) {
        console.log(chalk.yellow('⚠️  未找到任何HTTP端点'));
        return;
      }

      this.displayEndpoints(endpoints);
      
    } catch (error) {
      console.error(chalk.red('❌ 分析失败:'), error.message);
      if (this.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * 扫描项目
   */
  async scanProject() {
    // 检查是否是Spring项目
    const isSpringProject = await Scanner.isSpringProject(this.projectPath);
    if (!isSpringProject) {
      console.log(chalk.yellow('⚠️  未检测到Spring项目特征'));
      return [];
    }

    console.log(chalk.green('✅ 检测到Spring项目'));

    // 检查索引是否存在
    let endpoints = [];
    let useCache = false;

    if (IndexManager.indexExists(this.projectPath)) {
      try {
        const metadata = await IndexManager.loadIndexMetadata(this.projectPath);
        if (metadata) {
          const isValid = await IndexManager.isIndexValid(this.projectPath, metadata);
          if (isValid) {
            endpoints = await IndexManager.loadIndex(this.projectPath);
            useCache = true;
            console.log(chalk.blue(`📂 使用缓存索引 (${metadata.statistics.totalEndpoints}个端点)`));
          } else {
            console.log(chalk.yellow('🔄 项目已更改，重新扫描...'));
          }
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  索引加载失败: ${error.message}`));
      }
    }

    // 如果没有使用缓存，重新扫描
    if (!useCache) {
      console.log(chalk.blue('🔍 正在扫描Java文件...'));
      
      const startTime = Date.now();
      const { javaFiles, controllerFiles } = await Scanner.scanJavaFiles(this.projectPath);
      
      console.log(chalk.green(`📁 发现 ${javaFiles.length} 个Java文件 (${controllerFiles.length} 个控制器)`));

      if (controllerFiles.length === 0) {
        console.log(chalk.yellow('⚠️  未找到控制器类'));
        return [];
      }

      console.log(chalk.blue('🎯 正在分析端点...'));
      
      endpoints = [];
      for (const filePath of controllerFiles) {
        try {
          const fileEndpoints = await Analyzer.analyzeFile(filePath);
          endpoints.push(...fileEndpoints);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  分析文件失败: ${filePath} - ${error.message}`));
        }
      }

      const scanDurationMs = Date.now() - startTime;
      
      // 保存索引
      if (endpoints.length > 0) {
        const stats = {
          totalEndpoints: endpoints.length,
          methodCounts: this.countMethods(endpoints),
          totalJavaFiles: javaFiles.length,
          controllerFiles: controllerFiles.length,
          scanDurationMs
        };

        try {
          await IndexManager.saveIndex(this.projectPath, endpoints, stats);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  保存索引失败: ${error.message}`));
        }
      }
    }

    return endpoints;
  }

  /**
   * 显示端点
   */
  displayEndpoints(endpoints) {
    console.log();
    console.log('='.repeat(50));
    console.log(chalk.bold.green('📋 发现的HTTP端点'));
    console.log('='.repeat(50));
    console.log();

    if (endpoints.length === 0) {
      console.log(chalk.yellow('未找到任何端点'));
      return;
    }

    // 按方法分组
    const grouped = this.groupByMethod(endpoints);
    
    for (const [method, methodEndpoints] of Object.entries(grouped)) {
      const methodColor = this.getMethodColor(method);
      console.log(`${methodColor.bold(method)} (${methodEndpoints.length}):`);
      
      for (const ep of methodEndpoints) {
        const pathColor = this.getPathColor(method);
        const fileName = ep.filePath.split(/[/\\]/).pop();
        
        console.log(`  ${pathColor(ep.path)} - [${fileName}:${ep.lineNumber}] ${ep.className}.${ep.methodName}()`);
        
        if (ep.parameters && ep.parameters.length > 0) {
          const params = ep.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
          console.log(`    ${chalk.gray('参数:')} ${chalk.cyan(params)}`);
        }
      }
      console.log();
    }

    console.log(chalk.bold.green(`总计: ${endpoints.length} 个端点`));
  }

  /**
   * 按方法分组
   */
  groupByMethod(endpoints) {
    const grouped = {};
    for (const ep of endpoints) {
      if (!grouped[ep.method]) {
        grouped[ep.method] = [];
      }
      grouped[ep.method].push(ep);
    }
    return grouped;
  }

  /**
   * 统计方法数量
   */
  countMethods(endpoints) {
    const counts = {};
    for (const ep of endpoints) {
      counts[ep.method] = (counts[ep.method] || 0) + 1;
    }
    return counts;
  }

  /**
   * 获取方法颜色
   */
  getMethodColor(method) {
    const colors = {
      'GET': chalk.green,
      'POST': chalk.blue,
      'PUT': chalk.yellow,
      'DELETE': chalk.red,
      'PATCH': chalk.magenta,
      'HEAD': chalk.cyan,
      'OPTIONS': chalk.gray
    };
    return colors[method] || chalk.white;
  }

  /**
   * 获取路径颜色
   */
  getPathColor(method) {
    const colors = {
      'GET': chalk.green,
      'POST': chalk.blue,
      'PUT': chalk.yellow,
      'DELETE': chalk.red,
      'PATCH': chalk.magenta,
      'HEAD': chalk.cyan,
      'OPTIONS': chalk.gray
    };
    return colors[method] || chalk.white;
  }
}

module.exports = NativeUI;