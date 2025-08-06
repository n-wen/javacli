#!/usr/bin/env node

// 修复编码问题
const { setupEncoding } = require('./encoding-fix');
setupEncoding();

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const Scanner = require('./scanner');
const Analyzer = require('./analyzer');
const IndexManager = require('./index-manager');
const TUI = require('./tui');

const program = new Command();

// 全局选项
let projectPath = '';
let verbose = false;
let forceRescan = false;
let useNativeUI = false;
let useSimpleUI = false;

program
  .name('javacli')
  .description('Java SpringBoot项目分析CLI工具')
  .version('1.0.0')
  .option('-p, --path <path>', 'Java项目路径 (默认为当前目录)')
  .option('-v, --verbose', '显示详细信息')
  .option('-f, --force', '强制重新扫描，忽略缓存')
  .option('-n, --native', '使用轻量级原生UI (性能更好)')
  .option('-s, --simple', '使用超简单菜单界面 (最稳定)')
  .action(async (options) => {
    // 设置全局变量
    projectPath = options.path || process.cwd();
    verbose = options.verbose || false;
    forceRescan = options.force || false;
    useNativeUI = options.native || false;
    useSimpleUI = options.simple || false;

    try {
      // 确保路径存在
      if (!fs.existsSync(projectPath)) {
        console.error(chalk.red(`错误：指定的路径不存在: ${projectPath}`));
        process.exit(1);
      }

      // 如果强制重新扫描，先清除缓存
      if (forceRescan) {
        try {
          await IndexManager.clearIndex(projectPath);
          if (verbose) {
            console.log(chalk.yellow('已清除缓存，将重新扫描项目'));
          }
        } catch (err) {
          console.warn(chalk.yellow(`警告：清除缓存失败: ${err.message}`));
        }
      }

      // 启动交互式界面
      if (useSimpleUI) {
        // 使用超简单菜单界面
        const SimpleUI = require('./simple-ui');
        const simpleUI = new SimpleUI(projectPath);
        await simpleUI.run();
      } else if (useNativeUI) {
        // 使用原生轻量级TUI
        const NativeUI = require('./native-ui');
        const nativeUI = new NativeUI(projectPath);
        await nativeUI.run();
      } else {
        // 使用主TUI界面
        const tui = new TUI(projectPath, { verbose });
        await tui.start();
      }
    } catch (error) {
      console.error(chalk.red(`错误：${error.message}`));
      process.exit(1);
    }
  });

// 导出全局变量供其他模块使用
module.exports = {
  getVerbose: () => verbose,
  getProjectPath: () => projectPath
};

// 解析命令行参数
program.parse();