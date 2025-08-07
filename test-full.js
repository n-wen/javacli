const Analyzer = require('./src/analyzer');
const IndexManager = require('./src/index-manager');
const path = require('path');

async function testFullFlow() {
  const projectPath = path.resolve('./test');
  
  console.log('测试完整流程...');
  console.log('项目路径:', projectPath);
  
  try {
    // 清除现有索引
    console.log('清除现有索引...');
    await IndexManager.clearIndex(projectPath);
    
    // 分析端点
    console.log('分析端点...');
    const result = await Analyzer.analyzeEndpoints(projectPath);
    console.log('分析结果:', JSON.stringify(result, null, 2));
    
    // 保存索引
    console.log('保存索引...');
    await IndexManager.saveIndex(projectPath, result.endpoints, {
      totalEndpoints: result.endpoints.length,
      controllerFiles: result.controllerCount,
      totalJavaFiles: 0, // 简化处理
      scanDurationMs: 0,
      methodCounts: {}
    });
    
    // 加载索引
    console.log('加载索引...');
    const loadedEndpoints = await IndexManager.loadIndex(projectPath);
    console.log('加载的端点:', loadedEndpoints.length);
    
    if (loadedEndpoints.length > 0) {
      console.log('第一个端点:', loadedEndpoints[0]);
    }
    
  } catch (error) {
    console.error('错误:', error);
  }
}

testFullFlow();