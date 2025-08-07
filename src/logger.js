const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = '.javacli';
    this.logFile = path.join(this.logDir, 'error.log');
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level, message, error = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      error: error ? {
        message: error.message,
        stack: error.stack,
        code: error.code
      } : null
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      fs.appendFileSync(this.logFile, logLine);
    } catch (writeError) {
      console.error('无法写入日志文件:', writeError.message);
    }
  }

  error(message, error = null) {
    this.log('ERROR', message, error);
    console.error(`[ERROR] ${message}`);
    if (error) {
      console.error(error.stack);
    }
  }

  warn(message, error = null) {
    this.log('WARN', message, error);
    console.warn(`[WARN] ${message}`);
  }

  info(message) {
    this.log('INFO', message);
    console.log(`[INFO] ${message}`);
  }

  debug(message, error = null) {
    if (process.env.NODE_ENV === 'development') {
      this.log('DEBUG', message, error);
      console.log(`[DEBUG] ${message}`);
    }
  }

  getLogPath() {
    return this.logFile;
  }

  clearLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        fs.unlinkSync(this.logFile);
      }
    } catch (error) {
      console.error('清除日志文件失败:', error.message);
    }
  }
}

module.exports = new Logger();