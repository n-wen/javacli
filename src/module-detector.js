const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

/**
 * 多模块项目检测器
 */
class ModuleDetector {
  /**
   * 检测项目是否为多模块项目
   * @param {string} projectPath 项目根路径
   * @returns {Promise<{isMultiModule: boolean, modules: Array}>} 检测结果
   */
  static async detectModules(projectPath) {
    const result = {
      isMultiModule: false,
      modules: [],
      rootModule: projectPath
    };

    // 检测Maven多模块（可选，不影响基本功能）
    const mavenModules = await this.detectMavenModules(projectPath);
    if (mavenModules.length > 0) {
      result.isMultiModule = true;
      result.modules = mavenModules;
      return result;
    }

    // 检测Gradle多模块（可选，不影响基本功能）
    const gradleModules = await this.detectGradleModules(projectPath);
    if (gradleModules.length > 0) {
      result.isMultiModule = true;
      result.modules = gradleModules;
      return result;
    }

    // 单模块项目，返回根目录作为唯一模块
    // 不再强制要求pom.xml或build.gradle存在，只要有Java文件即可
    result.modules = [{
      name: path.basename(projectPath),
      path: projectPath,
      type: 'single',
      hasSpringBoot: await this.checkSpringInModule(projectPath)
    }];

    return result;
  }

  /**
   * 检测Maven多模块项目
   * @param {string} projectPath 项目路径
   * @returns {Promise<Array>} 模块列表
   */
  static async detectMavenModules(projectPath) {
    const pomPath = path.join(projectPath, 'pom.xml');
    if (!fs.existsSync(pomPath)) {
      return [];
    }

    try {
      const pomContent = fs.readFileSync(pomPath, 'utf8');
      const parser = new xml2js.Parser();
      const pomData = await parser.parseStringPromise(pomContent);

      const modules = [];
      
      // 检查是否有modules元素（父pom特征）
      const projectModules = pomData?.project?.modules?.[0]?.module || [];
      
      if (projectModules.length > 0) {
        // 多模块项目
        for (const moduleName of projectModules) {
          const modulePath = path.join(projectPath, moduleName);
          if (fs.existsSync(modulePath)) {
            modules.push({
              name: moduleName,
              path: modulePath,
              type: 'maven',
              hasSpringBoot: await this.checkSpringBootInModule(modulePath)
            });
          }
        }
      }

      return modules;
    } catch (error) {
      console.warn(`解析Maven pom.xml失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 检测Gradle多模块项目
   * @param {string} projectPath 项目路径
   * @returns {Promise<Array>} 模块列表
   */
  static async detectGradleModules(projectPath) {
    const settingsPath = path.join(projectPath, 'settings.gradle');
    const settingsKtsPath = path.join(projectPath, 'settings.gradle.kts');
    
    let settingsFile = null;
    if (fs.existsSync(settingsPath)) {
      settingsFile = settingsPath;
    } else if (fs.existsSync(settingsKtsPath)) {
      settingsFile = settingsKtsPath;
    }

    if (!settingsFile) {
      return [];
    }

    try {
      const content = fs.readFileSync(settingsFile, 'utf8');
      const modules = [];
      
      // 解析include语句
      const includePattern = /include\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      const includePatternSimple = /include\s+['"]([^'"]+)['"]/g;
      
      let match;
      const moduleNames = new Set();
      
      // 匹配 include(':module-name') 格式
      while ((match = includePattern.exec(content)) !== null) {
        moduleNames.add(match[1]);
      }
      
      // 匹配 include ':module-name' 格式
      while ((match = includePatternSimple.exec(content)) !== null) {
        moduleNames.add(match[1]);
      }

      // 转换为模块路径
      for (const moduleName of moduleNames) {
        const modulePath = path.join(projectPath, moduleName.replace(':', '/'));
        if (fs.existsSync(modulePath)) {
          modules.push({
            name: moduleName,
            path: modulePath,
            type: 'gradle',
            hasSpringBoot: await this.checkSpringBootInModule(modulePath)
          });
        }
      }

      return modules;
    } catch (error) {
      console.warn(`解析Gradle settings文件失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 检查模块是否包含Spring或SpringBoot
   * @param {string} modulePath 模块路径
   * @returns {Promise<boolean>} 是否包含Spring/SpringBoot
   */
  static async checkSpringBootInModule(modulePath) {
    return await this.checkSpringInModule(modulePath);
  }

  /**
   * 检查模块是否包含Spring框架（包括SpringBoot和传统Spring）
   * @param {string} modulePath 模块路径
   * @returns {Promise<boolean>} 是否包含Spring框架
   */
  static async checkSpringInModule(modulePath) {
    // 检查是否存在Spring配置文件
    if (await this.hasSpringConfigFiles(modulePath)) {
      return true;
    }

    // 检查是否存在Java文件（即使没有pom.xml或build.gradle也允许分析）
    const javaFiles = await this.findJavaFiles(modulePath);
    if (javaFiles.length > 0) {
      // 只要有Java文件就允许分析，不再强制要求Spring框架
      return true;
    }

    return false;
  }

  /**
   * 查找指定路径下的Java文件
   * @param {string} modulePath 模块路径
   * @returns {Promise<string[]>} Java文件路径数组
   */
  static async findJavaFiles(modulePath) {
    try {
      const glob = require('glob');
      const pattern = path.join(modulePath, '**/*.java').replace(/\\/g, '/');
      
      return await glob(pattern, {
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

  /**
   * 检查是否存在Spring配置文件
   * @param {string} modulePath 模块路径
   * @returns {Promise<boolean>} 是否存在Spring配置文件
   */
  static async hasSpringConfigFiles(modulePath) {
    const configPaths = [
      // 传统Spring XML配置
      path.join(modulePath, 'src', 'main', 'resources', 'applicationContext.xml'),
      path.join(modulePath, 'src', 'main', 'resources', 'spring-context.xml'),
      path.join(modulePath, 'src', 'main', 'resources', 'spring.xml'),
      path.join(modulePath, 'src', 'main', 'webapp', 'WEB-INF', 'applicationContext.xml'),
      path.join(modulePath, 'src', 'main', 'webapp', 'WEB-INF', 'spring-servlet.xml'),
      path.join(modulePath, 'src', 'main', 'webapp', 'WEB-INF', 'dispatcher-servlet.xml'),
      // SpringBoot配置
      path.join(modulePath, 'src', 'main', 'resources', 'application.properties'),
      path.join(modulePath, 'src', 'main', 'resources', 'application.yml'),
      path.join(modulePath, 'src', 'main', 'resources', 'application.yaml'),
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取所有Spring模块（包括SpringBoot和传统Spring）
   * @param {Array} modules 模块列表
   * @returns {Array} Spring模块列表
   */
  static getSpringBootModules(modules) {
    return this.getSpringModules(modules);
  }

  /**
   * 获取所有Spring模块（包括SpringBoot和传统Spring）
   * @param {Array} modules 模块列表
   * @returns {Array} Spring模块列表
   */
  static getSpringModules(modules) {
    return modules.filter(module => module.hasSpringBoot);
  }

  /**
   * 获取模块的显示名称
   * @param {Object} module 模块对象
   * @returns {string} 显示名称
   */
  static getModuleDisplayName(module) {
    if (module.type === 'gradle') {
      return module.name.replace(':', '/');
    }
    return module.name;
  }
}

module.exports = ModuleDetector;