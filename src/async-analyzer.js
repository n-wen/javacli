const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const os = require('os');

/**
 * 表示一个HTTP endpoint
 */
class Endpoint {
  constructor(method, path, className, methodName, filePath, lineNumber, parameters = [], moduleName = null) {
    this.method = method;
    this.path = path;
    this.className = className;
    this.methodName = methodName;
    this.filePath = filePath;
    this.lineNumber = lineNumber;
    this.parameters = parameters;
    this.moduleName = moduleName;
  }
}

/**
 * 异步Java文件分析器
 * 使用数据库队列和工作池来优化大量文件的解析性能
 */
class AsyncAnalyzer {
  constructor() {
    this.maxWorkers = Math.min(8, Math.max(2, os.cpus().length)); // 最大工作线程数
    this.javaParserPath = path.join(__dirname, 'JavaParserWrapper.jar');
  }

  /**
   * 创建异步分析任务表
   */
  async createTaskTables(db) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`
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

        db.run(`
          CREATE TABLE IF NOT EXISTS async_endpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            class_name TEXT NOT NULL,
            method_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            parameters TEXT NOT NULL,
            module_name TEXT,
            task_id INTEGER,
            FOREIGN KEY (task_id) REFERENCES analysis_tasks(id)
          )
        `);

        db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON analysis_tasks(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_endpoints_file ON async_endpoints(file_path)`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  /**
   * 将Java文件添加到分析队列
   */
  async enqueueFiles(db, javaFiles, moduleInfo) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO analysis_tasks (file_path, module_name)
        VALUES (?, ?)
      `);

      let inserted = 0;
      for (const filePath of javaFiles) {
        const moduleName = this.getModuleForFile(filePath, moduleInfo);
        stmt.run(filePath, moduleName, (err) => {
          if (err) {
            console.warn(`添加任务失败: ${filePath}`, err.message);
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
  async getPendingTasks(db, limit = 10) {
    return new Promise((resolve, reject) => {
      db.all(`
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
  async updateTaskStatus(db, taskId, status, result = null, error = null) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      db.run(`
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
  async saveAnalysisResult(db, taskId, endpoints) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO async_endpoints (method, path, class_name, method_name, file_path, line_number, parameters, module_name, task_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          taskId,
          (err) => {
            if (err) console.warn(`保存端点失败:`, err.message);
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
  async getAllResults(db) {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT method, path, class_name, method_name, file_path, line_number, parameters, module_name
        FROM async_endpoints
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
            moduleName: row.module_name
          }));
          resolve(endpoints);
        }
      });
    });
  }

  /**
   * 清空旧数据
   */
  async clearOldData(db) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM analysis_tasks');
        db.run('DELETE FROM async_endpoints', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  /**
   * 分析单个文件（异步版本）
   */
  async analyzeSingleFile(filePath, moduleName) {
    try {
      // 优先使用JavaParser
      const result = await this.analyzeJavaFileAsync(filePath, moduleName);
      return result;
    } catch (error) {
      console.warn(`JavaParser分析失败，使用正则表达式: ${error.message}`);
      return this.analyzeJavaFileFallbackAsync(filePath, moduleName);
    }
  }

  /**
   * 异步Java文件分析
   */
  async analyzeJavaFileAsync(filePath, moduleName = '') {
    return new Promise((resolve, reject) => {
      const javaParserPath = path.join(__dirname, 'JavaParserWrapper.jar');
      const projectRoot = path.dirname(filePath);
      const command = `java -jar "${javaParserPath}" "${filePath}" "${projectRoot}"`;

      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 30000 });
        
        if (!output || output.trim() === '') {
          reject(new Error('JavaParser输出为空'));
          return;
        }

        const parsedEndpoints = JSON.parse(output.trim());
        const endpoints = parsedEndpoints.map(ep => new Endpoint(
          ep.httpMethod,
          ep.path,
          ep.className,
          ep.methodName,
          filePath,
          1,
          [],
          moduleName
        ));

        resolve({ endpoints, isController: parsedEndpoints.length > 0 });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 异步正则表达式解析
   */
  async analyzeJavaFileFallbackAsync(filePath, moduleName = '') {
    return new Promise((resolve, reject) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const result = this.parseWithRegex(content, filePath, moduleName);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 正则表达式解析实现
   */
  parseWithRegex(content, filePath, moduleName) {
    const endpoints = [];
    const lines = content.split('\n');
    
    let currentClass = '';
    let classBasePath = '';
    let isController = false;

    const classPattern = /class\s+(\w+)/;
    const controllerPattern = /@(RestController|Controller)/;
    const requestMappingPattern = /@RequestMapping\s*\(\s*["']([^"']*)["']\s*\)/;
    const mappingPattern = /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*["']([^"']*)["']\s*\)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      const classMatch = classPattern.exec(line);
      if (classMatch) {
        currentClass = classMatch[1];
      }

      if (controllerPattern.test(line)) {
        isController = true;
      }

      const requestMappingMatch = requestMappingPattern.exec(line);
      if (requestMappingMatch) {
        classBasePath = requestMappingMatch[1];
      }

      const mappingMatch = mappingPattern.exec(line);
      if (mappingMatch && isController) {
        const httpMethod = mappingMatch[1].toUpperCase();
        const methodPath = mappingMatch[2] || '';

        let methodName = '';
        for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
          const methodMatch = /(?:public|private|protected)?\s+(?:\w+\s+)*(\w+)\s*\(/.exec(lines[j].trim());
          if (methodMatch) {
            methodName = methodMatch[1];
            break;
          }
        }

        if (methodName) {
          const fullPath = this.buildFullPath(classBasePath, methodPath);
          endpoints.push(new Endpoint(
            httpMethod,
            fullPath,
            currentClass,
            methodName,
            filePath,
            i + 1,
            [],
            moduleName
          ));
        }
      }
    }

    return { endpoints, isController };
  }

  /**
   * 构建完整路径
   */
  buildFullPath(classPath, methodPath) {
    let fullPath = '';
    if (classPath && classPath !== '/') {
      fullPath += classPath;
    }
    if (methodPath && methodPath !== '/') {
      if (fullPath && !fullPath.endsWith('/')) {
        fullPath += '/';
      }
      fullPath += methodPath;
    }
    return fullPath || '/';
  }

  /**
   * 根据文件路径确定所属模块
   */
  getModuleForFile(filePath, moduleInfo) {
    if (!moduleInfo) return null;

    if (!moduleInfo.isMultiModule && moduleInfo.modules.length > 0) {
      return moduleInfo.modules[0].name;
    }

    const sortedModules = [...moduleInfo.modules].sort((a, b) => b.path.length - a.path.length);
    for (const module of sortedModules) {
      if (filePath.startsWith(module.path)) {
        return module.name;
      }
    }

    return null;
  }

  /**
   * 主异步分析函数
   */
  async analyzeEndpointsAsync(projectPath) {
    const indexPath = path.join(projectPath, '.javacli', 'async-index.db');
    const dbDir = path.dirname(indexPath);
    
    // 确保目录存在
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new sqlite3.Database(indexPath);
    
    try {
      // 创建任务表
      await this.createTaskTables(db);
      
      // 清空旧数据
      await this.clearOldData(db);
      
      // 扫描Java文件
      const Scanner = require('./scanner');
      const { javaFiles, moduleInfo } = await Scanner.scanJavaFiles(projectPath);

      if (javaFiles.length === 0) {
        db.close();
        return { endpoints: [], controllerCount: 0 };
      }

      // 添加文件到队列
      const enqueued = await this.enqueueFiles(db, javaFiles, moduleInfo);
      // 文件队列准备完成，静默处理
      
      // 处理任务
      const endpoints = await this.processTasksAsync(db);
      
      return {
        endpoints,
        controllerCount: new Set(endpoints.map(e => e.className)).size
      };
      
    } finally {
      db.close();
    }
  }

  /**
   * 异步处理所有任务（优化并发度）
   */
  async processTasksAsync(db) {
    const allEndpoints = [];
    let processed = 0;
    const concurrency = Math.min(8, Math.max(2, this.maxWorkers * 2));

    // 并发配置完成，静默处理

    while (true) {
      const tasks = await this.getPendingTasks(db, concurrency);
      if (tasks.length === 0) break;

      const results = await Promise.allSettled(
        tasks.map(async (task) => {
          try {
            await this.updateTaskStatus(db, task.id, 'processing');
            
            const result = await this.analyzeSingleFile(task.file_path, task.module_name);
            
            if (result.endpoints.length > 0) {
              await this.saveAnalysisResult(db, task.id, result.endpoints);
              return result.endpoints;
            }

            await this.updateTaskStatus(db, task.id, 'completed', JSON.stringify(result));
            return [];
          } catch (error) {
            await this.updateTaskStatus(db, task.id, 'failed', null, error.message);
            return [];
          }
        })
      );

      results.forEach(result => {
        if (result.status === 'fulfilled') {
          allEndpoints.push(...result.value);
        }
      });
      
      processed += tasks.length;
      
      // 处理进度更新，静默处理
    }

    return allEndpoints;
  }
}

module.exports = { AsyncAnalyzer, Endpoint };