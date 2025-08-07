const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Scanner = require('./scanner');

const INDEX_VERSION = '1.0';
const INDEX_DIR_NAME = '.javacli';
const INDEX_FILE_NAME = 'index.db';

/**
 * 索引管理器
 */
class IndexManager {
  /**
   * 获取索引文件路径
   */
  static getIndexFilePath(projectPath) {
    const indexDir = path.join(projectPath, INDEX_DIR_NAME);
    return path.join(indexDir, INDEX_FILE_NAME);
  }

  /**
   * 确保索引目录存在
   */
  static ensureIndexDir(projectPath) {
    const indexDir = path.join(projectPath, INDEX_DIR_NAME);
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }
  }

  /**
   * 生成项目哈希值
   */
  static async generateProjectHash(projectPath) {
    try {
      const { javaFiles } = await Scanner.scanJavaFiles(projectPath);
      
      const hasher = crypto.createHash('md5');
      hasher.update(projectPath);
      
      for (const filePath of javaFiles) {
        try {
          const stat = fs.statSync(filePath);
          hasher.update(filePath);
          hasher.update(stat.mtime.toISOString());
          hasher.update(stat.size.toString());
        } catch (error) {
          continue;
        }
      }
      
      return hasher.digest('hex');
    } catch (error) {
      throw new Error(`生成项目哈希失败: ${error.message}`);
    }
  }

  /**
   * 创建数据库表
   */
  static createTables(db) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS metadata (
            id INTEGER PRIMARY KEY,
            version TEXT NOT NULL,
            project_path TEXT NOT NULL,
            generated_at DATETIME NOT NULL,
            project_hash TEXT NOT NULL,
            total_endpoints INTEGER NOT NULL,
            method_counts TEXT NOT NULL,
            total_java_files INTEGER NOT NULL,
            controller_files INTEGER NOT NULL,
            scan_duration_ms INTEGER NOT NULL
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS endpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            class_name TEXT NOT NULL,
            method_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            parameters TEXT NOT NULL
          )
        `);

        db.run(`CREATE INDEX IF NOT EXISTS idx_endpoints_method ON endpoints(method)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_endpoints_path ON endpoints(path)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_endpoints_class ON endpoints(class_name)`, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * 保存索引到SQLite数据库
   */
  static async saveIndex(projectPath, endpoints, stats) {
    try {
      this.ensureIndexDir(projectPath);
      
      const projectHash = await this.generateProjectHash(projectPath);
      const dbPath = this.getIndexFilePath(projectPath);
      
      return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, async (err) => {
          if (err) {
            reject(new Error(`初始化数据库失败: ${err.message}`));
            return;
          }

          try {
            await this.createTables(db);

            db.serialize(() => {
              db.run('DELETE FROM metadata');
              db.run('DELETE FROM endpoints');

              const insertMetadata = db.prepare(`
                INSERT INTO metadata (version, project_path, generated_at, project_hash, 
                  total_endpoints, method_counts, total_java_files, controller_files, scan_duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);

              insertMetadata.run(
                INDEX_VERSION,
                projectPath,
                new Date().toISOString(),
                projectHash,
                stats.totalEndpoints,
                JSON.stringify(stats.methodCounts),
                stats.totalJavaFiles,
                stats.controllerFiles,
                stats.scanDurationMs
              );
              insertMetadata.finalize();

              const insertEndpoint = db.prepare(`
                INSERT INTO endpoints (method, path, class_name, method_name, file_path, line_number, parameters)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `);

              for (const ep of endpoints) {
                insertEndpoint.run(
                  ep.method,
                  ep.path,
                  ep.className,
                  ep.methodName,
                  ep.filePath,
                  ep.lineNumber,
                  JSON.stringify(ep.parameters)
                );
              }
              insertEndpoint.finalize();

              db.close((err) => {
                if (err) {
                  reject(new Error(`关闭数据库失败: ${err.message}`));
                } else {
                  console.log(`索引已保存到: ${dbPath} (${endpoints.length}个endpoints)`);
                  resolve();
                }
              });
            });
          } catch (error) {
            db.close();
            reject(error);
          }
        });
      });
    } catch (error) {
      throw new Error(`保存索引失败: ${error.message}`);
    }
  }

  /**
   * 加载索引元数据
   */
  static async loadIndexMetadata(projectPath) {
    const dbPath = this.getIndexFilePath(projectPath);
    if (!fs.existsSync(dbPath)) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject(new Error(`打开数据库失败: ${err.message}`));
          return;
        }

        db.get(`
          SELECT version, project_path, generated_at, project_hash, 
            total_endpoints, method_counts, total_java_files, controller_files, scan_duration_ms
          FROM metadata LIMIT 1
        `, (err, row) => {
          db.close();
          
          if (err) {
            reject(new Error(`查询元数据失败: ${err.message}`));
          } else if (!row) {
            resolve(null);
          } else {
            try {
              if (row.version !== INDEX_VERSION) {
                reject(new Error(`索引文件版本不兼容 (当前: ${row.version}, 需要: ${INDEX_VERSION})`));
                return;
              }

              const metadata = {
                version: row.version,
                projectPath: row.project_path,
                generatedAt: new Date(row.generated_at),
                projectHash: row.project_hash,
                statistics: {
                  totalEndpoints: row.total_endpoints,
                  methodCounts: JSON.parse(row.method_counts),
                  totalJavaFiles: row.total_java_files,
                  controllerFiles: row.controller_files,
                  scanDurationMs: row.scan_duration_ms
                }
              };

              resolve(metadata);
            } catch (parseError) {
              reject(new Error(`解析元数据失败: ${parseError.message}`));
            }
          }
        });
      });
    });
  }

  /**
   * 检查索引是否有效
   */
  static async isIndexValid(projectPath, metadata) {
    if (metadata.projectPath !== projectPath) {
      return false;
    }

    try {
      const currentHash = await this.generateProjectHash(projectPath);
      return currentHash === metadata.projectHash;
    } catch (error) {
      console.warn(`生成项目哈希失败，将重新扫描: ${error.message}`);
      return false;
    }
  }

  /**
   * 清除索引文件
   */
  static async clearIndex(projectPath) {
    const dbPath = this.getIndexFilePath(projectPath);
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
        console.log(`索引文件已删除: ${dbPath}`);
      } catch (error) {
        throw new Error(`删除索引文件失败: ${error.message}`);
      }
    }
  }
}

module.exports = IndexManager;