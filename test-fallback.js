const fs = require('fs');
const path = require('path');

// 直接复制analyzeJavaFileFallback函数
function analyzeJavaFileFallback(filePath, moduleName = '') {
  const endpoints = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let currentClass = '';
    let classBasePath = '';
    let isController = false;
    let lineNumber = 0;
    
    // 简化的正则表达式模式，专注于Spring注解
    const classPattern = /class\s+(\w+)/;
    const controllerPattern = /@(RestController|Controller)/;
    const requestMappingPattern = /@RequestMapping\s*\(\s*["']([^"]*)["']\s*\)/;
    const mappingPattern = /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*["']([^"]*)["']\s*\)/;
    
    console.log(`正在分析文件: ${filePath}`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 提取类名
      const classMatch = classPattern.exec(trimmedLine);
      if (classMatch) {
        currentClass = classMatch[1];
        console.log(`找到类: ${currentClass}`);
      }

      // 检查是否是控制器类
      if (controllerPattern.test(trimmedLine)) {
        isController = true;
        console.log(`找到控制器注解: ${trimmedLine}`);
      }

      // 提取类级别的RequestMapping路径
      const requestMappingMatch = requestMappingPattern.exec(trimmedLine);
      if (requestMappingMatch) {
        classBasePath = requestMappingMatch[1];
        console.log(`找到类级路径: ${classBasePath}`);
      }

      // 检查方法级别的mapping注解
      const mappingMatch = mappingPattern.exec(trimmedLine);
      if (mappingMatch && isController) {
        const httpMethod = mappingMatch[1].toUpperCase();
        const methodPath = mappingMatch[2] || '';
        console.log(`找到方法映射: ${httpMethod} ${methodPath}`);

        // 查找方法定义（可能在下一行）
        let methodName = '';
        for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
          const methodLine = lines[j].trim();
          const methodMatch = /(?:public|private|protected)?\s+(?:\w+\s+)*(\w+)\s*\(/.exec(methodLine);
          if (methodMatch) {
            methodName = methodMatch[1];
            break;
          }
        }

        if (methodName) {
          const fullPath = buildFullPath(classBasePath, methodPath);
          console.log(`创建端点: ${httpMethod} ${fullPath} 在类 ${currentClass}`);
          endpoints.push({
            method: httpMethod,
            path: fullPath,
            className: currentClass,
            methodName: methodName,
            filePath: filePath,
            lineNumber: i + 1
          });
        }
      }
    }

    console.log(`文件 ${filePath} 分析完成，找到 ${endpoints.length} 个端点`);
    return { endpoints, isController };
  } catch (error) {
    throw new Error(`读取文件失败: ${error.message}`);
  }
}

function buildFullPath(basePath, methodPath) {
  if (!basePath && !methodPath) {
    return '/';
  }
  
  if (!basePath) {
    return methodPath.startsWith('/') ? methodPath : '/' + methodPath;
  }
  
  if (!methodPath) {
    return basePath.startsWith('/') ? basePath : '/' + basePath;
  }

  // 组合路径
  let fullPath = basePath.startsWith('/') ? basePath : '/' + basePath;
  if (!fullPath.endsWith('/')) {
    fullPath += '/';
  }
  fullPath += methodPath.startsWith('/') ? methodPath.substring(1) : methodPath;

  return fullPath;
}

// 测试
const testPath = path.resolve('./test/HelloController.java');
console.log('测试文件:', testPath);
const result = analyzeJavaFileFallback(testPath);
console.log('结果:', result);