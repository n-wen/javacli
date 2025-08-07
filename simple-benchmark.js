const fs = require('fs');
const path = require('path');
const Analyzer = require('./src/analyzer');

/**
 * 简单性能测试
 */
async function runSimpleBenchmark() {
  const testDir = path.join(__dirname, 'simple-benchmark-test');
  
  console.log('创建测试项目...');
  
  // 清理旧测试
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  // 创建测试文件
  const packages = ['controller', 'api', 'rest'];
  let totalFiles = 0;
  let expectedEndpoints = 0;

  for (let pkg = 0; pkg < packages.length; pkg++) {
    const packageDir = path.join(testDir, packages[pkg]);
    fs.mkdirSync(packageDir, { recursive: true });

    for (let i = 0; i < 3; i++) {
      const className = `${packages[pkg]}Controller${i}`;
      const code = createTestController(packages[pkg], className, i);
      
      fs.writeFileSync(path.join(packageDir, `${className}.java`), code);
      totalFiles++;
      expectedEndpoints += 5; // 每个控制器5个端点
    }
  }

  console.log(`测试项目: ${totalFiles}个文件, ${expectedEndpoints}个预期端点`);

  // 测试传统分析
  console.log('\n🔄 传统同步分析...');
  const syncStart = Date.now();
  const syncResult = await Analyzer.analyzeEndpoints(testDir, { useAsync: false });
  const syncTime = Date.now() - syncStart;
  console.log(`✅ 同步分析: ${syncTime}ms, 发现端点: ${syncResult.endpoints.length}`);

  // 测试优化分析
  console.log('\n🔄 优化分析...');
  const optStart = Date.now();
  const optResult = await Analyzer.analyzeEndpoints(testDir, { useOptimized: true });
  const optTime = Date.now() - optStart;
  console.log(`✅ 优化分析: ${optTime}ms, 发现端点: ${optResult.endpoints.length}`);

  // 清理
  fs.rmSync(testDir, { recursive: true });

  // 报告
  console.log('\n=== 性能对比 ===');
  console.log(`传统分析: ${syncTime}ms`);
  console.log(`优化分析: ${optTime}ms`);
  
  if (syncTime > optTime) {
    const improvement = ((syncTime - optTime) / syncTime * 100).toFixed(1);
    console.log(`性能提升: ${improvement}%`);
  }
}

function createTestController(packageName, className, index) {
  return `package ${packageName};

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/${packageName}")
public class ${className} {
    
    @GetMapping("/test${index}")
    public String get${index}() { return "GET"; }
    
    @PostMapping("/test${index}")
    public String post${index}() { return "POST"; }
    
    @PutMapping("/test${index}")
    public String put${index}() { return "PUT"; }
    
    @DeleteMapping("/test${index}")
    public String delete${index}() { return "DELETE"; }
    
    @PatchMapping("/test${index}")
    public String patch${index}() { return "PATCH"; }
}`;
}

if (require.main === module) {
  runSimpleBenchmark().catch(console.error);
}