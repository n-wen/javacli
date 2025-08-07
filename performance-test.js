const fs = require('fs');
const path = require('path');
const Analyzer = require('./src/analyzer');

/**
 * 性能测试 - 模拟大规模Java项目
 */
class PerformanceTest {
  constructor() {
    this.testDir = path.join(__dirname, 'perf-test');
  }

  /**
   * 创建模拟的Java项目
   */
  async createMockProject(fileCount = 100) {
    console.log(`创建模拟项目: ${fileCount}个Java文件...`);
    
    if (fs.existsSync(this.testDir)) {
      fs.rmSync(this.testDir, { recursive: true });
    }
    fs.mkdirSync(this.testDir, { recursive: true });

    // 创建控制器模板
    const controllerTemplate = `
package com.example.controller;

import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api")
public class TestController{index} {
    
    @GetMapping("/users/{index}")
    public List<String> getUsers{index}() {
        return List.of("user1", "user2");
    }
    
    @PostMapping("/users/{index}")
    public String createUser{index}(@RequestBody String user) {
        return "created";
    }
    
    @PutMapping("/users/{index}/{id}")
    public String updateUser{index}(@PathVariable Long id, @RequestBody String user) {
        return "updated";
    }
    
    @DeleteMapping("/users/{index}/{id}")
    public String deleteUser{index}(@PathVariable Long id) {
        return "deleted";
    }
}
`;

    // 创建服务类模板
    const serviceTemplate = `
package com.example.service;

import org.springframework.stereotype.Service;

@Service
public class TestService{index} {
    
    public String process{index}() {
        return "processed";
    }
}
`;

    // 生成文件
    for (let i = 0; i < fileCount; i++) {
      const controllerContent = controllerTemplate.replace(/\{index\}/g, i);
      const serviceContent = serviceTemplate.replace(/\{index\}/g, i);
      
      fs.writeFileSync(
        path.join(this.testDir, `TestController${i}.java`), 
        controllerContent
      );
      fs.writeFileSync(
        path.join(this.testDir, `TestService${i}.java`), 
        serviceContent
      );
    }

    console.log(`✅ 模拟项目创建完成: ${this.testDir}`);
  }

  /**
   * 运行性能测试
   */
  async runTest(fileCount = 50) {
    await this.createMockProject(fileCount);

    console.log('\n=== 性能测试开始 ===');
    console.log(`测试文件数量: ${fileCount * 2} (每个控制器对应4个端点)`);
    
    // 同步分析测试
    console.log('\n🔄 同步分析...');
    const syncStart = Date.now();
    const syncResult = await Analyzer.analyzeEndpoints(this.testDir, { useAsync: false });
    const syncTime = Date.now() - syncStart;
    
    console.log(`同步分析完成: ${syncTime}ms, 发现端点: ${syncResult.endpoints.length}`);

    // 异步分析测试
    console.log('\n🔄 异步分析...');
    const asyncStart = Date.now();
    const asyncResult = await Analyzer.analyzeEndpoints(this.testDir, { useAsync: true });
    const asyncTime = Date.now() - asyncStart;
    
    console.log(`异步分析完成: ${asyncTime}ms, 发现端点: ${asyncResult.endpoints.length}`);

    // 性能对比
    const improvement = syncTime > asyncTime ? 
      ((syncTime - asyncTime) / syncTime * 100).toFixed(1) : 0;

    console.log('\n=== 性能对比 ===');
    console.log(`同步分析时间: ${syncTime}ms`);
    console.log(`异步分析时间: ${asyncTime}ms`);
    console.log(`性能提升: ${improvement}%`);
    console.log(`预期端点数量: ${fileCount * 4}`);
    console.log(`实际发现端点: ${syncResult.endpoints.length} (同步) / ${asyncResult.endpoints.length} (异步)`);

    // 清理测试文件
    if (fs.existsSync(this.testDir)) {
      fs.rmSync(this.testDir, { recursive: true });
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new PerformanceTest();
  const fileCount = process.argv[2] ? parseInt(process.argv[2]) : 50;
  test.runTest(fileCount).catch(console.error);
}

module.exports = PerformanceTest;