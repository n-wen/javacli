const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Scanner = require('./scanner');
const logger = require('./logger');

/**
 * 表示一个HTTP endpoint
 */
class Endpoint {
  constructor(method, path, className, methodName, filePath, lineNumber, parameters = [], moduleName = null) {
    this.method = method;
    this.path = path;
    this.className = className;
    this.methodName = methodName;
    this.filePath = filePath;
    this.lineNumber = lineNumber;
    this.parameters = parameters;
    this.moduleName = moduleName; // 新增：所属模块名称
  }
}

/**
 * 分析Java文件中的endpoints（支持模块信息）
 * @param {string} projectPath 项目路径
 * @param {Object} options 分析选项
 * @param {boolean} options.useAsync 是否使用异步分析器
 * @param {boolean} options.useOptimized 是否使用优化分析器
 * @returns {Promise<{endpoints: Endpoint[], controllerCount: number}>} 分析结果
 */
async function analyzeEndpoints(projectPath, moduleInfo = null, options = {}) {
  const { useAsync = false, useOptimized = false } = options;

  try {
    // 确保路径是绝对路径
    const absolutePath = path.resolve(projectPath);
    logger.debug(`分析路径: ${absolutePath}`);

    if (useAsync) {
      // 使用异步分析器
      const { AsyncAnalyzer } = require('./async-analyzer');
      const asyncAnalyzer = new AsyncAnalyzer();
      return await asyncAnalyzer.analyzeEndpointsAsync(absolutePath);
    }

    // 默认使用优化分析器
    const OptimizedAnalyzer = require('./optimized-analyzer');
    try {
      const analyzer = new OptimizedAnalyzer();
      const result = await analyzer.analyzeEndpoints(absolutePath);
      
      logger.debug(`总共找到 ${result.endpoints.length} 个端点`);
      return result;
    } catch (error) {
      logger.error(`端点分析失败: ${error.message}`, error);
      throw error;
    }
  } catch (error) {
    throw new Error(`分析端点失败: ${error.message}`);
  }
}

/**
 * 根据文件路径确定所属模块
 * @param {string} filePath 文件路径
 * @param {Object} moduleInfo 模块信息
 * @returns {string|null} 模块名称
 */
function getModuleForFile(filePath, moduleInfo) {
  if (!moduleInfo) {
    return null;
  }

  // 单模块项目也返回模块名称
  if (!moduleInfo.isMultiModule && moduleInfo.modules.length > 0) {
    return moduleInfo.modules[0].name;
  }

  // 多模块项目 - 按路径长度降序排序，确保优先匹配最具体的子模块
  const sortedModules = [...moduleInfo.modules].sort((a, b) => b.path.length - a.path.length);
  for (const module of sortedModules) {
    if (filePath.startsWith(module.path)) {
      return module.name;
    }
  }

  return null;
}

/**
 * 分析单个Java文件
 * @param {string} filePath 文件路径
 * @param {string|null} moduleName 模块名称
 * @returns {Promise<{endpoints: Endpoint[], isController: boolean}>} 分析结果
 */
async function analyzeJavaFile(filePath, moduleName = '') {
  const endpoints = [];
  
  try {
    // 使用JavaParserWrapper通过子进程获取endpoint信息
    const javaParserPath = path.join(__dirname, 'JavaParserWrapper.jar');
    const projectRoot = path.dirname(filePath);
    const command = `java -jar "${javaParserPath}" "${filePath}" "${projectRoot}"`;
    
    let output;
    try {
      output = execSync(command, { encoding: 'utf8' });
      
      // 检查输出是否为空
      if (!output || output.trim() === '') {
        logger.debug(`JavaParser输出为空，使用正则表达式解析`);
        return analyzeJavaFileFallback(filePath, moduleName);
      }
    } catch (error) {
      // 如果JavaParser不可用，回退到正则表达式解析
      logger.debug(`JavaParser不可用，使用正则表达式解析: ${error.message}`);
      return analyzeJavaFileFallback(filePath, moduleName);
    }
    
    logger.debug(`JavaParser输出: ${output.substring(0, 200)}...`);

    let parsedEndpoints;
    try {
      // 清理可能的格式问题
      const cleanOutput = output.trim();
      parsedEndpoints = JSON.parse(cleanOutput);
    } catch (error) {
      logger.debug(`解析JavaParser输出失败: ${error.message}，回退到正则表达式`);
      return analyzeJavaFileFallback(filePath, moduleName);
    }

    // 转换JavaParser输出为Endpoint对象
    for (const ep of parsedEndpoints) {
      const endpoint = new Endpoint(
        ep.httpMethod,
        ep.path,
        ep.className,
        ep.methodName,
        filePath,
        1, // JavaParser没有提供行号，暂时使用1
        [], // JavaParser没有提供参数信息，暂时为空
        moduleName
      );
      endpoints.push(endpoint);
    }

    return { endpoints, isController: parsedEndpoints.length > 0 };
  } catch (error) {
      logger.debug(`使用JavaParser解析失败: ${error.message}，回退到正则表达式`);
    return analyzeJavaFileFallback(filePath, moduleName);
  }
}

// 回退到正则表达式解析
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
    
    logger.debug(`正在分析文件: ${filePath}`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 提取类名
      const classMatch = classPattern.exec(trimmedLine);
      if (classMatch) {
        currentClass = classMatch[1];
        logger.debug(`找到类: ${currentClass}`);
      }

      // 检查是否是控制器类
      if (controllerPattern.test(trimmedLine)) {
        isController = true;
        logger.debug(`找到控制器注解: ${trimmedLine}`);
      }

      // 提取类级别的RequestMapping路径
      const requestMappingMatch = requestMappingPattern.exec(trimmedLine);
      if (requestMappingMatch) {
        classBasePath = requestMappingMatch[1];
        logger.debug(`找到类级路径: ${classBasePath}`);
      }

      // 检查方法级别的mapping注解
      const mappingMatch = mappingPattern.exec(trimmedLine);
      if (mappingMatch && isController) {
        const httpMethod = mappingMatch[1].toUpperCase();
        const methodPath = mappingMatch[2] || '';
        logger.debug(`找到方法映射: ${httpMethod} ${methodPath}`);

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
          logger.debug(`创建端点: ${httpMethod} ${fullPath} 在类 ${currentClass}`);
          endpoints.push(new Endpoint(
            httpMethod,
            fullPath,
            currentClass,
            methodName,
            filePath,
            i + 1,
            [],
            moduleName
          ));
        }
      }
    }

    logger.debug(`文件 ${filePath} 分析完成，找到 ${endpoints.length} 个端点`);
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

  // 处理复杂的参数定义，包括注解和泛型
  const parts = [];
  let current = '';
  let angleDepth = 0;
  let parenDepth = 0;
  
  // 逐个字符处理，正确处理泛型和嵌套括号
  for (let i = 0; i < paramStr.length; i++) {
    const char = paramStr[i];
    
    if (char === '<') angleDepth++;
    else if (char === '>') angleDepth--;
    else if (char === '(') parenDepth++;
    else if (char === ')') parenDepth--;
    
    if (char === ',' && angleDepth === 0 && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    parts.push(current.trim());
  }

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed) {
      // 提取参数名，处理各种复杂情况
      let paramName = trimmed;
      
      // 移除注解
      paramName = paramName.replace(/@\w+(?:\([^)]*\))?/g, '');
      
      // 移除泛型部分
      paramName = paramName.replace(/<[^>]*>/g, '');
      
      // 移除数组标记
      paramName = paramName.replace(/\[\s*\]/g, '');
      
      // 提取最后一个单词作为参数名
      const words = paramName.trim().split(/\s+/);
      if (words.length > 0) {
        const lastWord = words[words.length - 1];
        // 确保是有效的Java标识符
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lastWord)) {
          params.push(lastWord);
        }
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
  // 确保路径之间有/分隔
  if (!fullPath.endsWith('/')) {
    fullPath += '/';
  }
  // 移除methodPath开头的/避免重复
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
  getModuleForFile,
  parseParameters,
  buildFullPath,
  ensureLeadingSlash
};