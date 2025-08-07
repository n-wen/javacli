const fs = require('fs');
const path = require('path');
const Analyzer = require('./src/analyzer');
const OptimizedAnalyzer = require('./src/optimized-analyzer');

/**
 * 最终性能基准测试
 * 对比三种分析策略：同步、异步、优化
 */
class FinalBenchmark {
  constructor() {
    this.testDir = path.join(__dirname, 'benchmark-test');
  }

  /**
   * 创建大规模测试项目
   */
  async createLargeTestProject() {
    console.log('创建大规模测试项目...');
    
    if (fs.existsSync(this.testDir)) {
      fs.rmSync(this.testDir, { recursive: true });
    }
    fs.mkdirSync(this.testDir, { recursive: true });

    // 创建多个包结构
    const packages = [
      'com.example.controller',
      'com.example.api',
      'com.example.rest',
      'com.example.web'
    ];

    let fileCount = 0;
    let totalEndpoints = 0;

    for (const packageName of packages) {
      const packageDir = path.join(this.testDir, ...packageName.split('.'));
      fs.mkdirSync(packageDir, { recursive: true });

      // 每个包创建多个控制器
      for (let i = 0; i < 5; i++) {
        const controllerName = `${packageName.split('.').pop()}Controller${i}`;
        const endpoints = this.generateController(packageName, controllerName, i);
        
        fs.writeFileSync(
          path.join(packageDir, `${controllerName}.java`),
          endpoints.code
        );
        
        fileCount++;
        totalEndpoints += endpoints.count;
      }
    }

    console.log(`✅ 测试项目创建完成: ${fileCount}个文件, ${totalEndpoints}个预期端点`);
    return { fileCount, totalEndpoints };
  }

  /**
   * 生成控制器代码
   */
  generateController(packageName, className, index) {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    let code = `package ${packageName};

import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/${className.toLowerCase()}")
public class ${className} {
`;

    let count = 0;
    
    for (const method of methods) {
      const methodName = `${method.toLowerCase()}${index}`;
      const path = method === 'GET' ? 
        `/${methodName}/{id}` : 
        `/${methodName}`;
      
      code += `
    @${method}Mapping("${path}")
    public String ${methodName}(@PathVariable(required = false) Long id, @RequestBody(required = false) Map<String, Object> body) {
        return "${method} ${methodName} executed";
    }
`;
      count++;
    }

    code += '}
';
    return { code, count };
  }

  /**
   * 运行性能测试
   */
  async runBenchmark() {
    const { fileCount, totalEndpoints } = await this.createLargeTestProject();
    
    console.log('\n=== 性能基准测试 ===');
    console.log(`测试规模: ${fileCount}个Java文件, ${totalEndpoints}个预期端点`);
    console.log('');

    const results = {};

    // 测试1: 传统同步分析
    console.log('🔄 传统同步分析...');
    const syncStart = Date.now();
    try {
      const syncResult = await Analyzer.analyzeEndpoints(this.testDir, { useAsync: false });
      results.sync = {
        time: Date.now() - syncStart,
        endpoints: syncResult.endpoints.length,
        controllers: syncResult.controllerCount
      };
      console.log(`✅ 同步分析完成: ${results.sync.time}ms, 发现端点: ${results.sync.endpoints}`);
    } catch (error) {
      console.error('❌ 同步分析失败:', error.message);
      results.sync = { time: -1, endpoints: 0, controllers: 0 };
    }

    // 测试2: 优化分析
    console.log('\n🔄 优化分析...');
    const optStart = Date.now();
    try {
      const optResult = await Analyzer.analyzeEndpoints(this.testDir, { useOptimized: true });
      results.optimized = {
        time: Date.now() - optStart,
        endpoints: optResult.endpoints.length,
        controllers: optResult.controllerCount
      };
      console.log(`✅ 优化分析完成: ${results.optimized.time}ms, 发现端点: ${results.optimized.endpoints}`);
    } catch (error) {
      console.error('❌ 优化分析失败:', error.message);
      results.optimized = { time: -1, endpoints: 0, controllers: 0 };
    }

    // 清理测试文件
    if (fs.existsSync(this.testDir)) {
      fs.rmSync(this.testDir, { recursive: true });
    }

    // 生成报告
    this.generateReport(results, fileCount, totalEndpoints);
    return results;
  }

  /**
   * 生成性能报告
   */
  generateReport(results, fileCount, expectedEndpoints) {
    console.log('\n=== 性能对比报告 ===');
    console.log(`测试规模: ${fileCount}个Java文件, ${expectedEndpoints}个预期端点`);
    console.log('');

    const strategies = [
      { name: '传统同步', key: 'sync', emoji: '📊' },
      { name: '优化分析', key: 'optimized', emoji: '🚀' }
    ];

    strategies.forEach(strategy => {
      const result = results[strategy.key];
      if (result.time > 0) {
        const speed = result.time > 0 ? (expectedEndpoints / (result.time / 1000)).toFixed(1) : 0;
        console.log(`${strategy.emoji} ${strategy.name}: ${result.time}ms (${result.endpoints}端点, ${speed}端点/秒)`);
      } else {
        console.log(`${strategy.emoji} ${strategy.name}: 失败`);
      }
    });

    // 找出最快的方法
    const validResults = Object.entries(results).filter(([_, result]) => result.time > 0);
    if (validResults.length > 0) {
      const fastest = validResults.reduce((a, b) => a[1].time < b[1].time ? a : b);
      console.log(`\n🏆 最快方法: ${fastest[0]} (${fastest[1].time}ms)`);
      
      // 计算相对性能
      const baseTime = results.sync.time;
      if (baseTime > 0 && fastest[0] !== 'sync') {
        const improvement = ((baseTime - fastest[1].time) / baseTime * 100).toFixed(1);
        console.log(`📈 相比传统方法提升: ${improvement}%`);
      }
    }

    console.log('\n=== 推荐策略 ===');
    console.log('• 小项目 (< 50文件): 传统同步分析');
    console.log('• 中等项目 (50-200文件): 优化分析');
    console.log('• 大项目 (> 200文件): 优化分析 + 缓存');
  }
}

// 运行测试
if (require.main === module) {
  const benchmark = new FinalBenchmark();
  benchmark.runBenchmark().catch(console.error);
}

module.exports = FinalBenchmark;