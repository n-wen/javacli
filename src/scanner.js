const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

/**
 * 检查是否是SpringBoot项目
 * @param {string} projectPath 项目路径
 * @returns {boolean} 是否是SpringBoot项目
 */
function isSpringBootProject(projectPath) {
  // 检查pom.xml中是否包含spring-boot-starter
  const pomPath = path.join(projectPath, 'pom.xml');
  if (fs.existsSync(pomPath)) {
    if (containsSpringBoot(pomPath)) {
      return true;
    }
  }

  // 检查build.gradle中是否包含spring-boot
  const gradlePath = path.join(projectPath, 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    if (containsSpringBoot(gradlePath)) {
      return true;
    }
  }

  return false;
}

/**
 * 检查文件是否包含SpringBoot相关依赖
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否包含SpringBoot依赖
 */
function containsSpringBoot(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.toLowerCase().includes('spring-boot');
  } catch (error) {
    return false;
  }
}

/**
 * 扫描所有Java源文件
 * @param {string} projectPath 项目路径
 * @returns {Promise<string[]>} Java文件路径数组
 */
async function scanJavaFiles(projectPath) {
  try {
    // 使用glob扫描Java文件，排除常见的非源码目录
    const pattern = path.join(projectPath, '**/*.java').replace(/\\/g, '/');
    
    const javaFiles = await glob(pattern, {
      ignore: [
        '**/target/**',
        '**/build/**',
        '**/node_modules/**',
        '**/.*/**'
      ]
    });

    return javaFiles;
  } catch (error) {
    throw new Error(`扫描Java文件失败: ${error.message}`);
  }
}

module.exports = {
  isSpringBootProject,
  containsSpringBoot,
  scanJavaFiles
};