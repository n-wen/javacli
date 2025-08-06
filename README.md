# JavaCLI - Java SpringBoot项目分析工具

一个基于Node.js的交互式Java SpringBoot项目分析工具，提供美观的终端用户界面(TUI)来浏览和分析项目中的HTTP endpoints。

## 功能特性

- 🖥️ **交互式TUI界面** - 美观的终端用户界面（基于blessed）
- 🔍 **实时搜索过滤** - 按方法、路径、控制器名称搜索
- ⌨️ **键盘导航** - 使用方向键轻松浏览endpoints
- 📊 **静态分析** - 智能分析Java源码
- 🌐 **自动检测** - 识别SpringBoot项目结构
- 📋 **详细视图** - 查看endpoint完整信息
- 🎨 **彩色输出** - 直观的颜色编码
- 📄 **智能分页** - 自动适应终端大小，支持大量endpoints
- 🔄 **快速滚动** - 支持翻页、首尾跳转等快捷导航
- 💾 **智能缓存** - SQLite本地索引，提升重复分析性能

## 支持的注解

- `@RestController` / `@Controller`
- `@RequestMapping`
- `@GetMapping`
- `@PostMapping`
- `@PutMapping`
- `@DeleteMapping`
- `@PatchMapping`

## 安装

### 前置要求

- Node.js 16.0.0 或更高版本
- npm 或 yarn 包管理器

### 安装步骤

1. 克隆或下载此项目
2. 在项目目录中运行：

```bash
npm install
```

3. 全局安装（可选）：

```bash
npm install -g .
```

## 使用方法

### 基本用法

```bash
# 分析当前目录的Java项目
node src/index.js

# 或者如果已全局安装
javacli

# 分析指定路径的Java项目
javacli -p /path/to/your/java/project
```

### 命令选项

- `-p, --path <path>`: 指定Java项目路径（默认为当前目录）
- `-v, --verbose`: 显示详细信息
- `-f, --force`: 强制重新扫描，忽略缓存
- `-n, --native`: 使用轻量级原生UI (性能更好)
- `-s, --simple`: 使用超简单菜单界面 (最稳定)
- `-h, --help`: 显示帮助信息

### 交互式操作

启动后，你可以使用以下键盘快捷键：

#### 导航
- **↑/↓ 或 k/j**: 在endpoint列表中逐行导航
- **PgUp/PgDn**: 快速翻页（适合大量endpoints）
- **Home**: 跳转到列表开头
- **End**: 跳转到列表末尾

#### 功能操作
- **Enter 或 Space**: 查看选中endpoint的详细信息
- **/**: 进入搜索模式
- **Esc**: 退出详细视图或取消搜索
- **r**: 重新扫描项目
- **q 或 Ctrl+C**: 退出程序

### 搜索功能

按 `/` 键进入搜索模式，然后输入关键词来过滤endpoints：
- 可以搜索HTTP方法 (GET, POST等)
- 可以搜索URL路径
- 可以搜索控制器类名
- 可以搜索Java方法名

### 界面预览

![TUI主界面]
```
┌─ JavaCLI - SpringBoot项目分析工具 ─┐

📁 项目路径: /path/to/spring-project
🌐 找到 25 个HTTP endpoints

┌─ 方法 ─┬─ 路径 ─┬─ 控制器 ─┬─ Java方法 ─┐
▶ 🟢GET  │ /api/users           │ UserController      │ getAllUsers
  🔵POST │ /api/users           │ UserController      │ createUser  
  🟢GET  │ /api/users/{id}      │ UserController      │ getUserById
  🟡PUT  │ /api/users/{id}      │ UserController      │ updateUser
  🔴DEL  │ /api/users/{id}      │ UserController      │ deleteUser
  🟢GET  │ /api/products        │ ProductController   │ getProducts
  🔵POST │ /api/products        │ ProductController   │ createProduct
  🟠PATCH│ /api/products/{id}   │ ProductController   │ updateProductPartial
  🟢GET  │ /api/orders          │ OrderController     │ getAllOrders
  🔵POST │ /api/orders          │ OrderController     │ createOrder

显示 1-10 / 25

↑/↓: 导航  PgUp/PgDn: 翻页  Home/End: 首尾  Enter: 详情  /: 搜索  Q: 退出
```

![详细视图]
```
┌─ Endpoint详情 (1/8) ─┐

🌐 HTTP方法: 🟢GET
📍 路径: /api/users
🏷️  控制器类: UserController
⚙️  Java方法: getAllUsers()
📄 文件: UserController.java
📋 行号: 12

↑/↓: 切换endpoint  Esc/Enter: 返回列表  Q: 退出
```

## 项目结构

```
javacli/
├── src/
│   ├── index.js         # 主程序和CLI命令定义
│   ├── tui.js          # 交互式TUI界面实现
│   ├── scanner.js      # Java项目扫描功能
│   ├── analyzer.js     # Java注解分析和endpoint提取
│   └── index-manager.js # SQLite索引管理
├── package.json        # Node.js项目配置
├── package-lock.json   # 依赖锁定文件
└── README.md          # 项目说明
```

## 技术栈

- **语言**: Node.js (JavaScript)
- **CLI框架**: Commander.js
- **TUI界面**: blessed
- **数据库**: SQLite3
- **文件扫描**: glob
- **样式**: chalk

## 开发

如果你想为这个项目贡献代码：

1. Fork此项目
2. 安装依赖: `npm install`
3. 创建功能分支
4. 进行开发和测试
5. 提交你的修改
6. 发起Pull Request

### 开发命令

```bash
# 开发模式（带文件监听）
npm run dev

# 安装为全局命令
npm run build

# 运行程序
npm start
```

## 索引缓存

工具会在项目目录下创建 `.javacli/` 目录来存储SQLite索引缓存：

- **位置**: `项目根目录/.javacli/index.db`
- **内容**: endpoints信息、项目哈希、统计数据
- **自动更新**: 检测到Java文件变化时自动重新扫描
- **手动清理**: 使用 `-f` 参数强制重新扫描

## 注意事项

- 目前只支持基于注解的SpringBoot控制器
- 不支持XML配置的endpoints
- 复杂的路径变量可能无法完全识别
- 需要Java源码文件（不分析编译后的.class文件）
- 需要Node.js 16.0.0或更高版本

### Windows中文乱码解决方案

如果在Windows系统上遇到中文乱码问题，可以尝试以下解决方案：

1. **使用批处理文件**：
   ```bash
   # 使用项目提供的批处理文件
   javacli.bat -p /path/to/java/project
   ```

2. **手动设置编码**：
   ```cmd
   chcp 65001
   set LANG=zh_CN.UTF-8
   set LC_ALL=zh_CN.UTF-8
   javacli
   ```

3. **PowerShell设置**：
   ```powershell
   $OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
   javacli
   ```

4. **Windows Terminal设置**：
   - 推荐使用Windows Terminal而不是传统的CMD
   - 确保Terminal配置为UTF-8编码

## 许可证

MIT License