const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Scanner = require('./scanner');
const logger = require('./logger');
const sqlite3 = require('sqlite3').verbose();

/**
 * 优化的异步Java文件分析器
 * 使用数据库队列和异步处理机制
 */
class OptimizedAnalyzer {
  constructor() {
    this.javaParserPath = path.join(__dirname, 'JavaParserWrapper.jar');
    this.db = null;
  }

  /**
   * 批量分析多个Java文件（已废弃，使用异步队列替代）
   */
  async analyzeBatch(filePaths, moduleInfo) {
    return []; // 使用异步队列替代
  }

  /**
   * 处理一批文件（已废弃）
   */
  async processBatch(filePaths, moduleInfo) {
    return [];
  }

  /**
   * 使用JavaParser批量分析文件（已废弃）
   */
  async analyzeFilesWithJavaParser(filePaths, moduleInfo) {
    return [];
  }

  /**
   * 使用JavaParser分析单个文件（已废弃，使用异步版本）
   */
  async analyzeSingleFileWithJavaParser(filePath, moduleInfo) {
    return [];
  }

  /**
   * 使用正则表达式分析文件（已废弃）
   */
  async analyzeFilesWithRegex(filePaths, moduleInfo) {
    return [];
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
   * 初始化数据库连接
   */
  async initDatabase(projectPath) {
    const dbPath = path.join(projectPath, '.javacli', 'optimized-index.db');
    const dbDir = path.dirname(dbPath);
    
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.db.serialize(() => {
          this.db.run(`
            CREATE TABLE IF NOT EXISTS analysis_tasks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              file_path TEXT NOT NULL UNIQUE,
              module_name TEXT,
              status TEXT DEFAULT 'pending',
              result TEXT,
              error TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              started_at DATETIME,
              completed_at DATETIME
            )
          `);

          this.db.run(`
            CREATE TABLE IF NOT EXISTS optimized_endpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            class_name TEXT NOT NULL,
            method_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            parameters TEXT NOT NULL DEFAULT '[]',
            module_name TEXT,
            parsed BOOLEAN DEFAULT 0,
            errlog TEXT,
            task_id INTEGER,
            FOREIGN KEY (task_id) REFERENCES analysis_tasks(id)
          )
          `);

          this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON analysis_tasks(status)`);
          this.db.run(`CREATE INDEX IF NOT EXISTS idx_endpoints_file ON optimized_endpoints(file_path)`, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    });
  }

  /**
   * 清空旧数据
   */
  async clearOldData() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('DELETE FROM analysis_tasks');
        this.db.run('DELETE FROM optimized_endpoints', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  /**
   * 将Java文件添加到分析队列
   */
  async enqueueFiles(javaFiles, moduleInfo) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO analysis_tasks (file_path, module_name)
        VALUES (?, ?)
      `);

      let inserted = 0;
      for (const filePath of javaFiles) {
        const moduleName = this.getModuleForFile(filePath, moduleInfo);
        stmt.run(filePath, moduleName, (err) => {
          if (err) {
            logger.warn(`添加任务失败: ${filePath}`, err.message);
          } else {
            inserted++;
          }
        });
      }

      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve(inserted);
      });
    });
  }

  /**
   * 获取待处理的任务
   */
  async getPendingTasks(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT id, file_path, module_name 
        FROM analysis_tasks 
        WHERE status = 'pending' 
        ORDER BY id 
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId, status, result = null, error = null) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      this.db.run(`
        UPDATE analysis_tasks 
        SET status = ?, result = ?, error = ?, 
            ${status === 'processing' ? 'started_at' : 'completed_at'} = ?
        WHERE id = ?
      `, [status, result, error, now, taskId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * 保存分析结果
   */
  async saveAnalysisResult(taskId, endpoints, parsed = true, errlog = null) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO optimized_endpoints (method, path, class_name, method_name, file_path, line_number, parameters, module_name, parsed, errlog, task_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let saved = 0;
      for (const endpoint of endpoints) {
        stmt.run(
          endpoint.method,
          endpoint.path,
          endpoint.className,
          endpoint.methodName,
          endpoint.filePath,
          endpoint.lineNumber,
          JSON.stringify(endpoint.parameters),
          endpoint.moduleName,
          parsed ? 1 : 0,
          errlog,
          taskId,
          (err) => {
            if (err) logger.warn(`保存端点失败:`, err.message);
            else saved++;
          }
        );
      }

      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve(saved);
      });
    });
  }

  /**
   * 获取所有分析结果
   */
  async getAllResults() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT method, path, class_name, method_name, file_path, line_number, parameters, module_name, parsed, errlog
        FROM optimized_endpoints
        ORDER BY method, path
      `, (err, rows) => {
        if (err) reject(err);
        else {
          const endpoints = rows.map(row => ({
            method: row.method,
            path: row.path,
            className: row.class_name,
            methodName: row.method_name,
            filePath: row.file_path,
            lineNumber: row.line_number,
            parameters: JSON.parse(row.parameters),
            moduleName: row.module_name,
            parsed: row.parsed === 1,
            errlog: row.errlog
          }));
          resolve(endpoints);
        }
      });
    });
  }

  /**
   * 异步分析单个文件
   */
  async analyzeSingleFileAsync(filePath, moduleName) {
    try {
      // 优先使用JavaParser
      const endpoints = await this.analyzeJavaFileAsync(filePath, moduleName);
      return endpoints;
    } catch (error) {
      logger.warn(`JavaParser分析失败，使用正则表达式: ${filePath}`, error.message);
      return this.analyzeJavaFileFallbackAsync(filePath, moduleName);
    }
  }

  /**
   * 异步Java文件分析
   */
  async analyzeJavaFileAsync(filePath, moduleName) {
    return new Promise((resolve, reject) => {
      const args = ['-jar', this.javaParserPath, filePath, path.dirname(filePath)];
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
              if (line.trim() === '[' || line.trim() === ']' || line.trim() === '') {
                continue;
              }
              
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
                  moduleName: moduleName
                });
              }
            } catch (e) {
              // 静默处理无效JSON
            }
          }
          
          resolve(endpoints);
        } catch (error) {
          reject(error);
        }
      });

      javaProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 异步正则表达式解析
   */
  async analyzeJavaFileFallbackAsync(filePath, moduleName) {
    return new Promise((resolve, reject) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const endpoints = this.parseEndpointsWithRegex(content, filePath, moduleName);
        resolve(endpoints);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理任务队列
   */
  async processTaskQueue() {
    let processed = 0;
    
    while (true) {
      const tasks = await this.getPendingTasks(5);
      if (tasks.length === 0) break;
      
      const promises = tasks.map(async (task) => {
        await this.updateTaskStatus(task.id, 'processing');
        
        try {
          // 优先使用JavaParser
          const endpoints = await this.analyzeJavaFileAsync(task.file_path, task.module_name);
          await this.saveAnalysisResult(task.id, endpoints, true);
          await this.updateTaskStatus(task.id, 'completed', JSON.stringify(endpoints));
        } catch (error) {
          logger.warn(`JavaParser分析失败，使用正则表达式: ${task.file_path}`, error.message);
          try {
            // 使用正则表达式回退
            const endpoints = await this.analyzeJavaFileFallbackAsync(task.file_path, task.module_name);
            await this.saveAnalysisResult(task.id, endpoints, false, error.message);
            await this.updateTaskStatus(task.id, 'completed', JSON.stringify(endpoints));
          } catch (fallbackError) {
            await this.updateTaskStatus(task.id, 'failed', null, fallbackError.message);
          }
        }
      });
      
      await Promise.all(promises);
      processed += tasks.length;
      
      // 文件处理进度，静默处理
    }
    
    return processed;
  }

  /**
   * 主异步分析方法
   */
  async analyzeEndpoints(projectPath) {
    const startTime = Date.now();
    
    // 扫描Java文件
    const { javaFiles, moduleInfo } = await Scanner.scanJavaFiles(projectPath);
    
    if (javaFiles.length === 0) {
      logger.info('未找到Java文件');
      return { endpoints: [], controllerCount: 0 };
    }
    
    logger.debug(`找到 ${javaFiles.length} 个Java文件`);

    try {
      await this.initDatabase(projectPath);
      await this.clearOldData();
      
      // 添加任务到队列
      const inserted = await this.enqueueFiles(javaFiles, moduleInfo);
      logger.debug(`已添加 ${inserted} 个分析任务`);
      
      // 异步处理任务队列
      const processed = await this.processTaskQueue();
      
      // 获取最终结果
      const endpoints = await this.getAllResults();
      const controllerCount = new Set(endpoints.map(ep => ep.className)).size;
      const elapsedTime = Date.now() - startTime;
      
      logger.debug(`异步分析完成: ${elapsedTime}ms, 发现端点: ${endpoints.length}, 控制器: ${controllerCount}`);
      
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