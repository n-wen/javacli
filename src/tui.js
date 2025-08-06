const blessed = require('blessed');
const chalk = require('chalk');
const Scanner = require('./scanner');
const Analyzer = require('./analyzer');
const IndexManager = require('./index-manager');

/**
 * TUI界面类
 */
class TUI {
  constructor(projectPath, options = {}) {
    this.projectPath = projectPath;
    this.verbose = options.verbose || false;
    this.endpoints = [];
    this.filteredEndpoints = [];
    this.selectedIndex = 0;
    this.searchQuery = '';
    this.isSearchMode = false;
    this.isDetailMode = false;
    this.currentDetailIndex = 0;
    
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
      title: 'JavaCLI - SpringBoot项目分析工具',
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
      content: '{center}{bold}JavaCLI - SpringBoot项目分析工具{/bold}{/center}',
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
      content: '↑/↓: 导航  Enter: 详情  /: 搜索  r: 重新扫描  q: 退出',
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

    // 重新扫描
    this.screen.key('r', async () => {
      if (!this.isDetailMode) {
        await this.rescan();
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
      this.showError(`启动失败: ${error.message}`);
    }
  }

  /**
   * 加载endpoints
   */
  async loadEndpoints() {
    try {
      // 检查是否是SpringBoot项目
      if (!Scanner.isSpringBootProject(this.projectPath)) {
        throw new Error('当前目录不是SpringBoot项目');
      }

      // 尝试加载缓存
      const metadata = await IndexManager.loadIndexMetadata(this.projectPath);
      if (metadata) {
        const isValid = await IndexManager.isIndexValid(this.projectPath, metadata);
        if (isValid) {
          this.endpoints = await this.loadFromCache();
          this.updateInfo(`已加载缓存 (${this.endpoints.length}个endpoints)`);
          return;
        }
      }

      // 扫描和分析项目
      this.updateInfo('正在扫描Java文件...');
      const startTime = Date.now();
      
      const javaFiles = await Scanner.scanJavaFiles(this.projectPath);
      this.updateInfo(`扫描完成，正在分析 ${javaFiles.length} 个Java文件...`);
      
      const { endpoints, controllerCount } = await Analyzer.analyzeEndpoints(javaFiles);
      const duration = Date.now() - startTime;
      
      // 生成统计信息并保存索引
      const stats = {
        totalEndpoints: endpoints.length,
        methodCounts: this.calculateMethodCounts(endpoints),
        totalJavaFiles: javaFiles.length,
        controllerFiles: controllerCount,
        scanDurationMs: duration
      };
      
      await IndexManager.saveIndex(this.projectPath, endpoints, stats);
      
      this.endpoints = endpoints;
      this.updateInfo(`分析完成，找到 ${endpoints.length} 个endpoints`);
    } catch (error) {
      throw new Error(`加载endpoints失败: ${error.message}`);
    }
  }

  /**
   * 从缓存加载endpoints
   */
  async loadFromCache() {
    // 这里需要实现从IndexManager加载分页数据的逻辑
    // 暂时返回空数组，实际项目中需要完善
    return [];
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
      if (this.searchQuery) {
        content += ` (过滤: ${this.filteredEndpoints.length})`;
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
    this.filteredEndpoints = this.searchQuery 
      ? this.filterEndpoints(this.endpoints, this.searchQuery)
      : this.endpoints;

    const items = this.filteredEndpoints.map(ep => {
      const methodColor = this.getMethodColor(ep.method);
      return `${methodColor}${ep.method.padEnd(6)} ${ep.path.padEnd(40)} ${ep.className.padEnd(20)} ${ep.methodName}`;
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
      ep.methodName.toLowerCase().includes(lowerQuery)
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

    const content = `Endpoint详情 (${this.currentDetailIndex + 1}/${this.filteredEndpoints.length})

🌐 HTTP方法: ${endpoint.method}
📍 路径: ${endpoint.path}
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