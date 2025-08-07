const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Scanner = require('./scanner');
const logger = require('./logger');

/**
 * 优化的Java文件分析器
 * 通过批量处理和缓存机制提高性能
 */
class OptimizedAnalyzer {
  constructor() {
    this.javaParserPath = path.join(__dirname, 'JavaParserWrapper.jar');
    this.cache = new Map(); // 文件内容缓存
    this.resultsCache = new Map(); // 分析结果缓存
  }

  /**
   * 批量分析多个Java文件
   */
  async analyzeBatch(filePaths, moduleInfo) {
    const results = [];
    const batchSize = 10; // 每批处理10个文件
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchResults = await this.processBatch(batch, moduleInfo);
      results.push(...batchResults);
      
      if (process.env.NODE_ENV !== 'test') {
        console.log(`已处理 ${Math.min(i + batchSize, filePaths.length)}/${filePaths.length} 个文件`);
      }
    }
    
    return results;
  }

  /**
   * 处理一批文件
   */
  async processBatch(filePaths, moduleInfo) {
    const validFiles = [];
    const fileContents = [];
    
    // 收集文件内容并检查缓存
    for (const filePath of filePaths) {
      try {
        const stats = fs.statSync(filePath);
        const cacheKey = `${filePath}_${stats.mtime.getTime()}`;
        
        if (this.resultsCache.has(cacheKey)) {
          // 使用缓存结果
          const cached = this.resultsCache.get(cacheKey);
          if (cached.length > 0) {
            return cached.map(ep => ({
              ...ep,
              moduleName: this.getModuleForFile(filePath, moduleInfo)
            }));
          }
          continue;
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        validFiles.push(filePath);
        fileContents.push(content);
        
      } catch (error) {
        console.warn(`读取文件失败: ${filePath}`, error.message);
      }
    }
    
    if (validFiles.length === 0) return [];
    
    // 批量分析
    return await this.analyzeFilesWithJavaParser(validFiles, moduleInfo);
  }

  /**
   * 使用JavaParser批量分析文件
   */
  async analyzeFilesWithJavaParser(filePaths, moduleInfo) {
    const allEndpoints = [];
    
    for (const filePath of filePaths) {
      try {
        const endpoints = await this.analyzeSingleFileWithJavaParser(filePath, moduleInfo);
        allEndpoints.push(...endpoints);
      } catch (error) {
        console.warn(`JavaParser分析失败，使用正则表达式回退: ${filePath}`, error.message);
        const endpoints = await this.analyzeSingleFileWithRegex(filePath, moduleInfo);
        allEndpoints.push(...endpoints);
      }
    }
    
    return allEndpoints;
  }

  async analyzeSingleFileWithJavaParser(filePath, moduleInfo) {
    return new Promise((resolve, reject) => {
      const projectRoot = path.dirname(filePath);
      const args = ['-jar', this.javaParserPath, filePath, projectRoot];
      
      const javaProcess = spawn('java', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      let stdout = '';
      let stderr = '';

      javaProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      javaProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      javaProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`JavaParser执行失败: ${stderr}`));
          return;
        }

        try {
          const lines = stdout.trim().split('\n').filter(line => line.trim());
          const endpoints = [];
          
          for (const line of lines) {
            try {
              // 跳过明显无效的JSON行
              if (line.trim() === '[' || line.trim() === ']' || line.trim() === '') {
                continue;
              }
              
              // 清理可能的格式问题
              const cleanLine = line.trim().replace(/,$/, '');
              if (cleanLine === '[' || cleanLine === ']') {
                continue;
              }
              
              const endpoint = JSON.parse(cleanLine);
              if (endpoint.httpMethod && endpoint.path) {
                endpoints.push({
                  method: endpoint.httpMethod,
                  path: endpoint.path,
                  className: endpoint.className,
                  methodName: endpoint.methodName,
                  filePath: filePath,
                  lineNumber: endpoint.lineNumber || 1,
                  parameters: endpoint.parameters || [],
                  moduleName: this.getModuleForFile(filePath, moduleInfo)
                });
              }
            } catch (e) {
              // 只在调试模式下显示警告，避免大量无效日志
              if (process.env.NODE_ENV === 'debug') {
                console.warn(`解析端点失败: ${line}`);
              }
            }
          }
          
          // 缓存结果
          try {
            const stats = fs.statSync(filePath);
            const cacheKey = `${filePath}_${stats.mtime.getTime()}`;
            this.resultsCache.set(cacheKey, endpoints);
          } catch (e) {
            // 忽略缓存错误
          }
          
          resolve(endpoints);
        } catch (error) {
          reject(error);
        }
      });

      javaProcess.on('error', (error) => {
          logger.warn(`JavaParser调用失败: ${filePath}`, error);
          reject(error);
        });
    });
  }

  /**
   * 使用正则表达式分析文件（回退方案）
   */
  async analyzeFilesWithRegex(filePaths, moduleInfo) {
    const allEndpoints = [];
    
    for (const filePath of filePaths) {
      try {
        const endpoints = await this.analyzeSingleFileWithRegex(filePath, moduleInfo);
        allEndpoints.push(...endpoints);
      } catch (error) {
        console.warn(`正则表达式分析失败: ${filePath}`, error.message);
      }
    }
    
    return allEndpoints;
  }

  async analyzeSingleFileWithRegex(filePath, moduleInfo) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const endpoints = this.parseEndpointsWithRegex(content, filePath);
      
      const enrichedEndpoints = endpoints.map(ep => ({
        ...ep,
        moduleName: this.getModuleForFile(filePath, moduleInfo)
      }));
      
      // 缓存结果
      try {
        const stats = fs.statSync(filePath);
        const cacheKey = `${filePath}_${stats.mtime.getTime()}`;
        this.resultsCache.set(cacheKey, enrichedEndpoints);
      } catch (e) {
        // 忽略缓存错误
      }
      
      return enrichedEndpoints;
    } catch (error) {
      logger.warn(`正则表达式分析失败: ${filePath}`, error);
      return [];
    }
  }

  /**
   * 使用正则表达式解析端点
   */
  parseEndpointsWithRegex(content, filePath) {
    const endpoints = [];
    const lines = content.split('\n');
    let className = '';
    let packageName = '';
    let classLevelPath = '';

    // 提取包名
    const packageMatch = content.match(/package\s+([\w.]+);/);
    if (packageMatch) {
      packageName = packageMatch[1];
    }

    // 提取类名和类级路径
    const classMatch = content.match(/@RestController[\s\S]*?class\s+(\w+)/);
    if (classMatch) {
      className = classMatch[1];
    }

    const requestMappingMatch = content.match(/@RequestMapping\("([^"]+)"\)/);
    if (requestMappingMatch) {
      classLevelPath = requestMappingMatch[1];
    }

    // 提取方法级端点
    const methodPattern = /@(Get|Post|Put|Delete|Patch)Mapping\("([^"]+)"\)[\s\S]*?(\w+)\s*\(/g;
    let match;
    
    while ((match = methodPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const methodPath = match[2];
      const methodName = match[3];
      
      // 计算行号
      const beforeMethod = content.substring(0, match.index);
      const lineNumber = beforeMethod.split('\n').length;
      
      // 合并路径
      const fullPath = this.combinePaths(classLevelPath, methodPath);
      
      endpoints.push({
        method,
        path: fullPath,
        className,
        methodName,
        filePath,
        lineNumber,
        parameters: []
      });
    }

    return endpoints;
  }

  /**
   * 合并类级和方法级路径
   */
  combinePaths(classPath, methodPath) {
    if (!classPath || classPath === '/') {
      return methodPath;
    }
    
    const classClean = classPath.replace(/\/$/, '');
    const methodClean = methodPath.startsWith('/') ? methodPath : '/' + methodPath;
    
    return classClean + methodClean;
  }

  /**
   * 获取文件所属模块
   */
  getModuleForFile(filePath, moduleInfo) {
    if (!moduleInfo) return '';
    
    for (const [moduleName, modulePath] of Object.entries(moduleInfo)) {
      if (filePath.startsWith(modulePath)) {
        return moduleName;
      }
    }
    
    return '';
  }

  /**
   * 获取待处理任务数量
   */
  async getTaskCount(db) {
    return new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM analysis_tasks WHERE status = "pending"', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  /**
   * 主分析方法
   */
  async analyzeEndpoints(projectPath) {
    const startTime = Date.now();
    
    // 扫描Java文件
    const { javaFiles, moduleInfo } = await Scanner.scanJavaFiles(projectPath);
    
    if (javaFiles.length === 0) {
      logger.info('未找到Java文件');
      return { endpoints: [], controllerCount: 0 };
    }
    
    logger.info(`找到 ${javaFiles.length} 个Java文件`);

    try {
      // 批量分析
      const endpoints = await this.analyzeBatch(javaFiles, moduleInfo);
      
      const controllerCount = new Set(endpoints.map(ep => ep.className)).size;
      const elapsedTime = Date.now() - startTime;
      
      logger.info(`优化分析完成: ${elapsedTime}ms, 发现端点: ${endpoints.length}, 控制器: ${controllerCount}`);
      
      if (process.env.NODE_ENV !== 'test') {
        console.log(`优化分析完成: ${elapsedTime}ms, 发现端点: ${endpoints.length}`);
      }
      
      return {
        endpoints,
        controllerCount
      };
    } catch (error) {
      logger.error(`端点分析失败: ${error.message}`, error);
      throw error;
    }
  }
}

module.exports = OptimizedAnalyzer;