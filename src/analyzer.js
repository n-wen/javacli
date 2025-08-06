const fs = require('fs');
const path = require('path');

/**
 * 表示一个HTTP endpoint
 */
class Endpoint {
  constructor(method, path, className, methodName, filePath, lineNumber, parameters = []) {
    this.method = method;
    this.path = path;
    this.className = className;
    this.methodName = methodName;
    this.filePath = filePath;
    this.lineNumber = lineNumber;
    this.parameters = parameters;
  }
}

/**
 * 分析Java文件中的endpoints
 * @param {string[]} javaFiles Java文件路径数组
 * @returns {Promise<{endpoints: Endpoint[], controllerCount: number}>} 分析结果
 */
async function analyzeEndpoints(javaFiles) {
  const endpoints = [];
  let controllerCount = 0;

  for (const filePath of javaFiles) {
    try {
      const { endpoints: fileEndpoints, isController } = await analyzeJavaFile(filePath);
      endpoints.push(...fileEndpoints);
      if (isController) {
        controllerCount++;
      }
    } catch (error) {
      // 忽略单个文件的分析错误，继续处理其他文件
      console.warn(`警告：分析文件 ${filePath} 失败: ${error.message}`);
    }
  }

  return { endpoints, controllerCount };
}

/**
 * 分析单个Java文件
 * @param {string} filePath 文件路径
 * @returns {Promise<{endpoints: Endpoint[], isController: boolean}>} 分析结果
 */
async function analyzeJavaFile(filePath) {
  const endpoints = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let currentClass = '';
    let classBasePath = '';
    let isController = false;
    
    // 正则表达式模式
    const classPattern = /class\s+(\w+)/;
    const controllerPattern = /@(RestController|Controller)/;
    const requestMappingPattern = /@RequestMapping\s*\(\s*["']([^"']*)["']/;
    const mappingPattern = /@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\(\s*["']([^"']*)["']\s*\))?/;
    const methodPattern = /(public|private|protected)?\s*\w+\s+(\w+)\s*\(([^)]*)\)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 检查是否是控制器类
      if (controllerPattern.test(trimmedLine)) {
        isController = true;
        continue;
      }

      // 提取类名
      const classMatch = classPattern.exec(trimmedLine);
      if (classMatch) {
        currentClass = classMatch[1];
        continue;
      }

      // 提取类级别的RequestMapping路径
      const requestMappingMatch = requestMappingPattern.exec(trimmedLine);
      if (requestMappingMatch) {
        classBasePath = requestMappingMatch[1];
        continue;
      }

      // 只在控制器类中查找mapping注解
      if (!isController) {
        continue;
      }

      // 检查方法级别的mapping注解
      const mappingMatch = mappingPattern.exec(trimmedLine);
      if (mappingMatch) {
        const httpMethod = mappingMatch[1].toUpperCase();
        const methodPath = mappingMatch[2] || '';

        // 查找下一行的方法定义
        let methodName = '';
        let parameters = [];
        
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const methodMatch = methodPattern.exec(nextLine);
          if (methodMatch) {
            methodName = methodMatch[2];
            if (methodMatch[3]) {
              parameters = parseParameters(methodMatch[3]);
            }
          }
        }

        // 构建完整路径
        const fullPath = buildFullPath(classBasePath, methodPath);

        const endpoint = new Endpoint(
          httpMethod,
          fullPath,
          currentClass,
          methodName,
          filePath,
          i + 1, // mapping注解的行号（1-based）
          parameters
        );

        endpoints.push(endpoint);
      }
    }

    return { endpoints, isController };
  } catch (error) {
    throw new Error(`读取文件失败: ${error.message}`);
  }
}

/**
 * 解析方法参数
 * @param {string} paramStr 参数字符串
 * @returns {string[]} 参数名数组
 */
function parseParameters(paramStr) {
  const params = [];
  if (!paramStr.trim()) {
    return params;
  }

  // 简单的参数分割，处理基本情况
  const parts = paramStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed) {
      // 提取参数名（去掉类型和注解）
      const words = trimmed.split(/\s+/);
      if (words.length > 0) {
        const paramName = words[words.length - 1];
        params.push(paramName);
      }
    }
  }

  return params;
}

/**
 * 构建完整的URL路径
 * @param {string} basePath 基础路径
 * @param {string} methodPath 方法路径
 * @returns {string} 完整路径
 */
function buildFullPath(basePath, methodPath) {
  if (!basePath && !methodPath) {
    return '/';
  }
  
  if (!basePath) {
    return ensureLeadingSlash(methodPath);
  }
  
  if (!methodPath) {
    return ensureLeadingSlash(basePath);
  }

  // 组合路径
  let fullPath = ensureLeadingSlash(basePath);
  if (!fullPath.endsWith('/') && !methodPath.startsWith('/')) {
    fullPath += '/';
  }
  fullPath += methodPath.replace(/^\//, '');

  return fullPath;
}

/**
 * 确保路径以/开头
 * @param {string} path 路径
 * @returns {string} 处理后的路径
 */
function ensureLeadingSlash(path) {
  if (!path) {
    return '/';
  }
  if (!path.startsWith('/')) {
    return '/' + path;
  }
  return path;
}

module.exports = {
  Endpoint,
  analyzeEndpoints,
  analyzeJavaFile,
  parseParameters,
  buildFullPath,
  ensureLeadingSlash
};