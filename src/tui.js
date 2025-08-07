const blessed = require('blessed');
const chalk = require('chalk');
const Scanner = require('./scanner');
const Analyzer = require('./analyzer');
const IndexManager = require('./index-manager');
const logger = require('./logger');

/**
 * TUI界面类
 */
class TUI {
  constructor(projectPath, options = {}) {
    // 确保使用绝对路径，与IndexManager保持一致
    const path = require('path');
    this.projectPath = path.resolve(projectPath);
    this.verbose = options.verbose || false;
    this.endpoints = [];
    this.filteredEndpoints = [];
    this.selectedIndex = 0;
    this.searchQuery = '';
    this.moduleFilter = null;
    this.isSearchMode = false;
    this.isDetailMode = false;
    this.isModuleFilterMode = false;
    this.currentDetailIndex = 0;
    this.moduleInfo = null; // 新增：模块信息
    
    this.setupScreen();
    this.setupComponents();
    this.bindEvents();
  }

  /**
   * 设置屏幕
   */
  setupScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'JavaCLI - Spring项目分析工具',
      fullUnicode: true,
      dockBorders: true,
      ignoreLocked: ['C-c'],
      autoPadding: true,
      warnings: false
    });
  }

  /**
   * 设置UI组件
   */
  setupComponents() {
    // 标题栏
    this.titleBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold}JavaCLI - Spring项目分析工具{/bold}{/center}',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'cyan'
        }
      }
    });

    // 信息栏
    this.infoBox = blessed.box({
      top: 3,
      left: 0,
      width: '100%',
      height: 3,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'cyan'
        }
      }
    });

    // endpoints列表
    this.listBox = blessed.list({
      top: 6,
      left: 0,
      width: '100%',
      height: '100%-9',
      keys: true,
      vi: true,
      mouse: true,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'cyan'
        },
        selected: {
          bg: 'blue'
        }
      },
      scrollbar: {
        ch: ' ',
        style: {
          bg: 'yellow'
        }
      },
      tags: true,
      parseTags: true
    });

    // 帮助栏
    this.helpBox = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '↑/↓: 导航  Enter: 详情  /: 搜索  m: 模块过滤  c: 清除  r: 重新扫描  h: 帮助  q: 退出',
      border: {
        type: 'line'
      },
      style: {
        fg: 'cyan',
        border: {
          fg: 'cyan'
        }
      },
      tags: true,
      parseTags: true
    });

    // 详情窗口
    this.detailBox = blessed.box({
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'yellow'
        }
      },
      hidden: true
    });

    // 添加组件到屏幕
    this.screen.append(this.titleBox);
    this.screen.append(this.infoBox);
    this.screen.append(this.listBox);
    this.screen.append(this.helpBox);
    this.screen.append(this.detailBox);

    // 设置焦点
    this.listBox.focus();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 退出事件
    this.screen.key(['escape', 'q', 'C-c'], () => {
      if (this.isDetailMode) {
        this.hideDetail();
      } else {
        process.exit(0);
      }
    });

    // 搜索事件
    this.screen.key('/', () => {
      if (!this.isDetailMode) {
        this.startSearch();
      }
    });

    // 模块过滤
    this.screen.key('m', () => {
      if (!this.isDetailMode) {
        this.startModuleFilter();
      }
    });

    // 清除模块过滤
    this.screen.key('c', () => {
      if (!this.isDetailMode) {
        this.clearModuleFilter();
      }
    });

    // 重新扫描
    this.screen.key('r', async () => {
      if (!this.isDetailMode) {
        await this.rescan();
      }
    });

    // 帮助信息
    this.screen.key('h', () => {
      if (!this.isDetailMode) {
        this.showHelp();
      }
    });

    // Enter键查看详情
    this.screen.key('enter', () => {
      if (!this.isDetailMode && this.filteredEndpoints.length > 0) {
        this.showDetail();
      } else if (this.isDetailMode) {
        this.hideDetail();
      }
    });

    // 空格键查看详情
    this.screen.key('space', () => {
      if (!this.isDetailMode && this.filteredEndpoints.length > 0) {
        this.showDetail();
      }
    });

    // 列表选择事件
    this.listBox.on('select', (item, index) => {
      this.selectedIndex = index;
    });
  }

  /**
   * 启动TUI
   */
  async start() {
    try {
      this.updateInfo('正在加载项目信息...');
      this.screen.render();

      await this.loadEndpoints();
      this.updateList();
      this.screen.render();
    } catch (error) {
      logger.error(`TUI启动失败: ${error.message}`, error);
      this.showError(`启动失败: ${error.message}`);
    }
  }

  /**
   * 加载endpoints
   */
  async loadEndpoints() {
    try {
      // 首先尝试从缓存加载端点
      const metadata = await IndexManager.loadIndexMetadata(this.projectPath);
      let endpoints = [];
      
      if (metadata) {
        const isValid = await IndexManager.isIndexValid(this.projectPath, metadata);
        if (isValid) {
          endpoints = await this.loadFromCache();
          this.endpoints = endpoints;
          this.updateInfo(`已加载缓存 (${endpoints.length}个endpoints)`);
          this.updateList();
          this.screen.render();
          
          // 缓存有效，直接返回，不再进行后台分析
          return;
        } else {
          this.updateInfo('缓存已过期，需要重新分析...');
        }
      } else {
        this.updateInfo('未找到索引文件，开始分析...');
      }

      // 只有在没有有效缓存时才创建进度条并进行分析
      this.createProgressBar();
      
      // 在后台异步进行Java文件解析
      this.performBackgroundAnalysis();
      
    } catch (error) {
      logger.error(`加载endpoints失败: ${error.message}`, error);
      this.updateInfo(`加载失败: ${error.message}`);
      this.updateList();
      this.screen.render();
    }
  }

  /**
   * 创建进度条
   */
  createProgressBar() {
    this.progressBar = blessed.progressbar({
      parent: this.screen,
      bottom: 0,
      right: 0,
      width: 30,
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        bar: { bg: 'blue' }
      },
      filled: 0,
      label: '解析进度',
      tags: true
    });
    
    this.progressText = blessed.text({
      parent: this.screen,
      bottom: 1,
      right: 31,
      width: 20,
      height: 1,
      content: '准备中...',
      style: { fg: 'cyan' }
    });
  }

  /**
   * 后台异步分析
   */
  async performBackgroundAnalysis() {
    try {
      // 检查是否包含Java文件
      const scanResult = await Scanner.scanJavaFiles(this.projectPath);
      const { javaFiles, moduleInfo } = scanResult;
      if (javaFiles.length === 0) {
        this.updateInfo('当前目录未找到Java文件');
        this.removeProgressBar();
        return;
      }

      // 更新进度条 - 减少日志输出
      this.updateProgress(10, '正在扫描...');
      
      const allJavaFiles = javaFiles;
      this.moduleInfo = moduleInfo;
      
      // 异步分析端点
      this.updateProgress(30, '分析中...');
      const startTime = Date.now();
      
      const { endpoints, controllerCount } = await Analyzer.analyzeEndpoints(this.projectPath, moduleInfo);
      const duration = Date.now() - startTime;
      
      this.updateProgress(80, '保存中...');
      
      // 生成统计信息并保存索引
      const stats = {
        totalEndpoints: endpoints.length,
        methodCounts: this.calculateMethodCounts(endpoints),
        totalJavaFiles: allJavaFiles.length,
        controllerFiles: controllerCount,
        scanDurationMs: duration
      };
      
      await IndexManager.saveIndex(this.projectPath, endpoints, stats);
      
      this.updateProgress(100, '完成');
      
      // 更新端点列表
      this.endpoints = endpoints;
      this.updateList();
      this.updateInfo(`已更新 ${endpoints.length} 个endpoints`);
      
      // 延迟移除进度条
      setTimeout(() => {
        this.removeProgressBar();
      }, 800);
      
    } catch (error) {
      logger.error(`后台分析失败: ${error.message}`, error);
      this.updateInfo(`分析失败: ${error.message}`);
      this.removeProgressBar();
    }
  }

  /**
   * 更新进度条
   */
  updateProgress(percent, message) {
    if (this.progressBar) {
      this.progressBar.setProgress(percent);
      this.progressText.setContent(message);
      this.screen.render();
    }
  }

  /**
   * 移除进度条
   */
  removeProgressBar() {
    if (this.progressBar) {
      this.screen.remove(this.progressBar);
      this.screen.remove(this.progressText);
      this.progressBar = null;
      this.progressText = null;
      this.screen.render();
    }
  }

  /**
   * 从缓存加载endpoints
   */
  async loadFromCache() {
    try {
      return await IndexManager.loadIndex(this.projectPath);
    } catch (error) {
      logger.warn(`从缓存加载失败: ${error.message}`, error);
      return [];
    }
  }

  /**
   * 计算方法统计
   */
  calculateMethodCounts(endpoints) {
    const counts = {};
    for (const ep of endpoints) {
      counts[ep.method] = (counts[ep.method] || 0) + 1;
    }
    return counts;
  }

  /**
   * 更新信息栏
   */
  updateInfo(message) {
    let content = `📁 项目路径: ${this.projectPath}\n`;
    
    if (this.endpoints.length > 0) {
      content += `🌐 找到 ${this.endpoints.length} 个HTTP endpoints`;
      
      // 如果是多模块项目，显示模块统计
      if (this.moduleInfo && this.moduleInfo.isMultiModule) {
        const springModules = this.moduleInfo.modules.filter(m => m.hasSpringBoot);
        content += ` (${springModules.length} 个模块)`;
      }
      
      const filters = [];
      if (this.searchQuery) {
        filters.push(`搜索: ${this.searchQuery}`);
      }
      if (this.moduleFilter) {
        filters.push(`模块: ${this.moduleFilter}`);
      }
      
      if (filters.length > 0) {
        content += ` (${filters.join(', ')})`;
      }
    } else {
      content += message;
    }
    
    this.infoBox.setContent(content);
  }

  /**
   * 更新列表
   */
  updateList() {
    this.filteredEndpoints = this.endpoints.filter(ep => {
      let matchSearch = true;
      let matchModule = true;
      
      if (this.searchQuery) {
        matchSearch = this.filterEndpoints([ep], this.searchQuery).length > 0;
      }
      
      if (this.moduleFilter) {
        matchModule = ep.moduleName === this.moduleFilter;
      }
      
      return matchSearch && matchModule;
    });

    const items = this.filteredEndpoints.map(ep => {
      const methodColor = this.getMethodColor(ep.method);
      let moduleDisplay = '';
      
      // 显示模块信息（包括单模块项目）
      if (ep.moduleName) {
        const moduleName = ep.moduleName.length > 12 ? ep.moduleName.substr(0, 12) + '...' : ep.moduleName;
        moduleDisplay = `[${moduleName}] `;
      }
      
      return `${methodColor}${ep.method.padEnd(6)} ${ep.path.padEnd(35)} ${moduleDisplay}${ep.className.padEnd(18)} ${ep.methodName}`;
    });

    this.listBox.setItems(items);
    this.updateInfo('');
  }

  /**
   * 获取HTTP方法颜色
   */
  getMethodColor(method) {
    const colors = {
      'GET': '{green-fg}',
      'POST': '{blue-fg}',
      'PUT': '{yellow-fg}',
      'DELETE': '{red-fg}',
      'PATCH': '{magenta-fg}'
    };
    return colors[method] || '{white-fg}';
  }

  /**
   * 过滤endpoints
   */
  filterEndpoints(endpoints, query) {
    const lowerQuery = query.toLowerCase();
    return endpoints.filter(ep => 
      ep.method.toLowerCase().includes(lowerQuery) ||
      ep.path.toLowerCase().includes(lowerQuery) ||
      ep.className.toLowerCase().includes(lowerQuery) ||
      ep.methodName.toLowerCase().includes(lowerQuery) ||
      (ep.moduleName && ep.moduleName.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 开始搜索
   */
  startSearch() {
    this.isSearchMode = true;
    
    const searchBox = blessed.textbox({
      top: 'center',
      left: 'center',
      width: 50,
      height: 3,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'yellow'
        }
      },
      inputOnFocus: true
    });

    searchBox.setContent('搜索: ');
    this.screen.append(searchBox);
    searchBox.focus();

    searchBox.on('submit', (value) => {
      this.searchQuery = value || '';
      this.updateList();
      this.screen.remove(searchBox);
      this.listBox.focus();
      this.isSearchMode = false;
      this.screen.render();
    });

    searchBox.on('cancel', () => {
      this.screen.remove(searchBox);
      this.listBox.focus();
      this.isSearchMode = false;
      this.screen.render();
    });

    this.screen.render();
  }

  /**
   * 显示详情
   */
  showDetail() {
    if (this.filteredEndpoints.length === 0) return;

    this.isDetailMode = true;
    this.currentDetailIndex = this.listBox.selected;
    const endpoint = this.filteredEndpoints[this.currentDetailIndex];

    let content = `Endpoint详情 (${this.currentDetailIndex + 1}/${this.filteredEndpoints.length})

🌐 HTTP方法: ${endpoint.method}
📍 路径: ${endpoint.path}`;

    // 显示模块信息
    if (endpoint.moduleName) {
      content += `\n📦 模块: ${endpoint.moduleName}`;
    }

    content += `
🏷️  控制器类: ${endpoint.className}
⚙️  Java方法: ${endpoint.methodName}()
📄 文件: ${endpoint.filePath}
📋 行号: ${endpoint.lineNumber}
🔧 参数: ${endpoint.parameters.join(', ') || '无'}

↑/↓: 切换endpoint  Esc/Enter: 返回列表  Q: 退出`;

    this.detailBox.setContent(content);
    this.detailBox.show();
    this.detailBox.focus();
    this.screen.render();
  }

  /**
   * 隐藏详情
   */
  hideDetail() {
    this.isDetailMode = false;
    this.detailBox.hide();
    this.listBox.focus();
    this.screen.render();
  }

  /**
   * 开始模块过滤
   */
  startModuleFilter() {
    // 获取所有唯一的模块名称
    const modules = [...new Set(this.endpoints.filter(ep => ep.moduleName).map(ep => ep.moduleName))].sort();
    
    if (modules.length === 0) {
      this.updateInfo('当前项目没有模块信息');
      return;
    }

    const moduleBox = blessed.list({
      top: 'center',
      left: 'center',
      width: '40%',
      height: Math.min(modules.length + 4, 15),
      label: '选择模块 (按Enter确认，Esc取消)',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'cyan'
        },
        selected: {
          bg: 'blue'
        }
      },
      items: ['全部模块', ...modules],
      keys: true,
      vi: true
    });

    this.screen.append(moduleBox);
    this.screen.render();

    moduleBox.focus();

    moduleBox.key(['escape'], () => {
      this.screen.remove(moduleBox);
      this.screen.render();
      this.listBox.focus();
    });

    moduleBox.key(['enter'], () => {
      const selectedIndex = moduleBox.selected;
      if (selectedIndex === 0) {
        this.clearModuleFilter();
      } else {
        this.moduleFilter = modules[selectedIndex - 1];
      }
      
      this.screen.remove(moduleBox);
      this.listBox.focus();
      this.updateList();
    });
  }

  /**
   * 清除模块过滤
   */
  clearModuleFilter() {
    this.moduleFilter = null;
    this.updateList();
  }

  /**
   * 重新扫描
   */
  async rescan() {
    try {
      this.updateInfo('正在重新扫描项目...');
      this.screen.render();

      await IndexManager.clearIndex(this.projectPath);
      await this.loadEndpoints();
      this.updateList();
      this.screen.render();
    } catch (error) {
      this.showError(`重新扫描失败: ${error.message}`);
    }
  }

  /**
   * 显示帮助信息
   */
  showHelp() {
    const helpBox = blessed.box({
      top: 'center',
      left: 'center',
      width: 60,
      height: 20,
      border: {
        type: 'line'
      },
      style: {
        border: { fg: 'cyan' },
        fg: 'white'
      },
      tags: true,
      content: '{center}{bold}JavaCLI 帮助信息{/bold}{/center}\n\n' +
               '{bold}导航操作：{/bold}\n' +
               '↑/↓ 或 j/k - 上下移动选择\n' +
               'PgUp/PgDn - 翻页\n' +
               'Home/End - 跳转到开头/结尾\n\n' +
               '{bold}搜索过滤：{/bold}\n' +
               '/ - 开始搜索\n' +
               'm - 按模块过滤\n' +
               'c - 清除所有过滤\n\n' +
               '{bold}查看信息：{/bold}\n' +
               'Enter 或 Space - 查看endpoint详情\n' +
               'Esc 或 q - 返回列表/退出\n\n' +
               '{bold}其他操作：{/bold}\n' +
               'r - 重新扫描项目\n' +
               'h - 显示此帮助信息\n\n' +
               '{bold}快捷键：{/bold}\n' +
               'Ctrl+C - 强制退出\n\n' +
               '按任意键关闭此帮助...'
    });

    this.screen.append(helpBox);
    helpBox.focus();
    this.screen.render();

    helpBox.once('keypress', () => {
      this.screen.remove(helpBox);
      this.listBox.focus();
      this.screen.render();
    });
  }

  /**
   * 显示错误
   */
  showError(message) {
    const errorBox = blessed.message({
      top: 'center',
      left: 'center',
      width: 60,
      height: 8,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'red'
        }
      }
    });

    errorBox.error(message, () => {
      this.screen.remove(errorBox);
      this.screen.render();
    });

    this.screen.append(errorBox);
    this.screen.render();
  }
}

module.exports = TUI;