const fs = require('fs');
const path = require('path');

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
 * @param {string[]} javaFiles Java文件路径数组
 * @param {Object} moduleInfo 模块信息
 * @returns {Promise<{endpoints: Endpoint[], controllerCount: number}>} 分析结果
 */
async function analyzeEndpoints(javaFiles, moduleInfo = null) {
  const endpoints = [];
  let controllerCount = 0;

  for (const filePath of javaFiles) {
    try {
      // 确定文件所属的模块
      const moduleName = getModuleForFile(filePath, moduleInfo);
      const { endpoints: fileEndpoints, isController } = await analyzeJavaFile(filePath, moduleName);
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
async function analyzeJavaFile(filePath, moduleName = null) {
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
    const requestMappingPattern = /@RequestMapping\s*\([^)]*["']([^"']*)["'][^)]*\)|@RequestMapping\s*\(\s*["']([^"']*)["']\s*\)|@RequestMapping\s*\(\s*\)|@RequestMapping\s*\([^)]*\w+(?:\.\w+)*[^)]*\)/;
    const mappingPattern = /@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\([^)]*["']([^"']*)["'][^)]*\)|\(\s*["']([^"']*)["']\s*\)|\(\s*\)|\([^)]*\w+(?:\.\w+)*[^)]*\)|$)/;
    const methodPattern = /(public|private|protected)?\s*(?:\w+(?:<[^>]*>)?(?:\[\])*\s+)*(\w+)\s*\(([^)]*)\)/;

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
        const pathValue = requestMappingMatch[1] || requestMappingMatch[2] || '';
        if (pathValue) {
          classBasePath = pathValue;
        } else {
          // 处理变量引用的情况，保留原始表达式
          const variableMatch = /@RequestMapping\s*\(\s*([^)"']+)\s*\)/.exec(trimmedLine);
          if (variableMatch) {
            classBasePath = `{${variableMatch[1].trim()}}`;
          } else {
            classBasePath = '';
          }
        }
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
        let methodPath = mappingMatch[2] || mappingMatch[3] || '';
        
        // 如果没有匹配到字符串，检查是否是变量引用
        if (!methodPath) {
          const variableMatch = /@(?:Get|Post|Put|Delete|Patch)Mapping\s*\(\s*([^)"']+)\s*\)/.exec(trimmedLine);
          if (variableMatch) {
            methodPath = `{${variableMatch[1].trim()}}`;
          }
        }

        // 查找方法定义
        let methodName = '';
        let parameters = [];
        
        // 从mapping注解后的行开始查找方法定义
        for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
          const line = lines[j].trim();
          if (!line || line.startsWith('@') || line.startsWith('//') || line.startsWith('/*')) continue;
          
          // 直接匹配方法定义：public/private/protected 返回类型 方法名(参数)
          const methodMatch = /(?:public|private|protected)?\s+(?:\w+(?:<[^>]*>)?(?:\[\])?\s+)*(\w+)\s*\(/.exec(line);
          if (methodMatch) {
            methodName = methodMatch[1];
            
            // 提取参数部分
            const paramStart = line.indexOf('(');
            const paramEnd = line.lastIndexOf(')');
            if (paramStart !== -1 && paramEnd !== -1 && paramEnd > paramStart) {
              // 参数在同一行
              const paramStr = line.substring(paramStart + 1, paramEnd);
              parameters = parseParameters(paramStr);
            } else {
              // 处理多行参数情况
              let paramStr = '';
              let parenCount = 1;
              
              // 从当前行的左括号后开始收集参数
              paramStr += line.substring(paramStart + 1);
              
              for (let k = j + 1; k < lines.length && parenCount > 0; k++) {
                const nextLine = lines[k].trim();
                const openCount = (nextLine.match(/\(/g) || []).length;
                const closeCount = (nextLine.match(/\)/g) || []).length;
                parenCount += openCount - closeCount;
                
                if (parenCount > 0) {
                  paramStr += ' ' + nextLine;
                } else {
                  const closeIndex = nextLine.lastIndexOf(')');
                  if (closeIndex > 0) {
                    paramStr += ' ' + nextLine.substring(0, closeIndex);
                  }
                  break;
                }
              }
              parameters = parseParameters(paramStr);
            }
            break;
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
          parameters,
          moduleName // 包含模块信息
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