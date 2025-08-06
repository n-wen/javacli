const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const ModuleDetector = require('./module-detector');

/**
 * 检查是否是Spring项目（支持SpringBoot和传统Spring，支持多模块）
 * @param {string} projectPath 项目路径
 * @returns {Promise<boolean>} 是否是Spring项目
 */
async function isSpringBootProject(projectPath) {
  return await isSpringProject(projectPath);
}

/**
 * 检查是否是Spring项目（包括SpringBoot和传统Spring）
 * @param {string} projectPath 项目路径
 * @returns {Promise<boolean>} 是否是Spring项目
 */
async function isSpringProject(projectPath) {
  try {
    const moduleInfo = await ModuleDetector.detectModules(projectPath);
    
    // 如果是多模块项目，检查是否有任何模块包含Spring
    if (moduleInfo.isMultiModule) {
      const springModules = ModuleDetector.getSpringModules(moduleInfo.modules);
      return springModules.length > 0;
    }
    
    // 单模块项目，检查根目录
    return moduleInfo.modules.length > 0 && moduleInfo.modules[0].hasSpringBoot;
  } catch (error) {
    // 如果检测失败，回退到原有逻辑
    return isSpringProjectLegacy(projectPath);
  }
}

/**
 * 传统的Spring项目检测方法（向后兼容）
 * @param {string} projectPath 项目路径
 * @returns {boolean} 是否是Spring项目
 */
function isSpringProjectLegacy(projectPath) {
  // 不再强制检查pom.xml或build.gradle，只要有Java文件就允许分析
  const javaFiles = findJavaFilesSync(projectPath);
  return javaFiles.length > 0;
}

/**
 * 传统的SpringBoot项目检测方法（向后兼容）
 * @param {string} projectPath 项目路径
 * @returns {boolean} 是否是SpringBoot项目
 */
function isSpringBootProjectLegacy(projectPath) {
  return isSpringProjectLegacy(projectPath);
}

/**
 * 检查文件是否包含Spring相关依赖（包括SpringBoot和传统Spring）
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否包含Spring依赖
 */
function containsSpring(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lowerContent = content.toLowerCase();
    
    // 检查SpringBoot依赖
    if (lowerContent.includes('spring-boot')) {
      return true;
    }
    
    // 检查传统Spring依赖
    if (lowerContent.includes('spring-webmvc') || 
        lowerContent.includes('spring-web') ||
        lowerContent.includes('spring-context') ||
        lowerContent.includes('org.springframework')) {
      return true;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 检查文件是否包含SpringBoot相关依赖（向后兼容）
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否包含SpringBoot依赖
 */
function containsSpringBoot(filePath) {
  return containsSpring(filePath);
}

/**
 * 扫描所有Java源文件（支持多模块）
 * @param {string} projectPath 项目路径
 * @returns {Promise<{javaFiles: string[], moduleInfo: Object}>} Java文件路径数组和模块信息
 */
async function scanJavaFiles(projectPath) {
  try {
    const moduleInfo = await ModuleDetector.detectModules(projectPath);
    const allJavaFiles = [];
    
    if (moduleInfo.isMultiModule) {
      // 多模块项目：只扫描包含Spring的模块
      const springModules = ModuleDetector.getSpringModules(moduleInfo.modules);
      
      for (const module of springModules) {
        const moduleJavaFiles = await scanJavaFilesInPath(module.path);
        allJavaFiles.push(...moduleJavaFiles);
      }
    } else {
      // 单模块项目：扫描整个项目
      const javaFiles = await scanJavaFilesInPath(projectPath);
      allJavaFiles.push(...javaFiles);
    }
    
    return {
      javaFiles: allJavaFiles,
      moduleInfo: moduleInfo
    };
  } catch (error) {
    throw new Error(`扫描Java文件失败: ${error.message}`);
  }
}

/**
 * 在指定路径中扫描Java文件
 * @param {string} searchPath 搜索路径
 * @returns {Promise<string[]>} Java文件路径数组
 */
async function scanJavaFilesInPath(searchPath) {
  const pattern = path.join(searchPath, '**/*.java').replace(/\\/g, '/');
  
  return await glob(pattern, {
    ignore: [
      '**/target/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.*/**'
    ]
  });
}

/**
 * 同步查找Java文件（用于传统检测方法）
 * @param {string} searchPath 搜索路径
 * @returns {string[]} Java文件路径数组
 */
function findJavaFilesSync(searchPath) {
  try {
    const pattern = path.join(searchPath, '**/*.java').replace(/\\/g, '/');
    
    // 使用glob的同步版本
    const { globSync } = require('glob');
    return globSync(pattern, {
      ignore: [
        '**/target/**',
        '**/build/**',
        '**/node_modules/**',
        '**/.*/**'
      ]
    });
  } catch (error) {
    return [];
  }
}

module.exports = {
  isSpringBootProject,
  isSpringProject,
  isSpringProjectLegacy,
  isSpringBootProjectLegacy,
  containsSpring,
  containsSpringBoot,
  scanJavaFiles,
  scanJavaFilesInPath,
  findJavaFilesSync
};