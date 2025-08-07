const Analyzer = require('./src/analyzer');
const path = require('path');

async function benchmark() {
  const projectPath = path.resolve('./test');
  
  console.log('=== 性能基准测试 ===');
  
  // 测试同步分析
  console.time('同步分析');
  try {
    const syncResult = await Analyzer.analyzeEndpoints(projectPath, { useAsync: false });
    console.timeEnd('同步分析');
    console.log(`同步分析结果: ${syncResult.endpoints.length} 个端点`);
  } catch (error) {
    console.error('同步分析失败:', error.message);
  }
  
  console.log('');
  
  // 测试异步分析
  console.time('异步分析');
  try {
    const asyncResult = await Analyzer.analyzeEndpoints(projectPath, { useAsync: true });
    console.timeEnd('异步分析');
    console.log(`异步分析结果: ${asyncResult.endpoints.length} 个端点`);
  } catch (error) {
    console.error('异步分析失败:', error.message);
  }
}

benchmark().catch(console.error);