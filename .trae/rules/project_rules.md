项目说明: 一个command line工具

# 功能说明
- 一个cli工具, 用于分析当前所在java springboot项目
- 打开后, 开始分析当前的java项目, 构建静态分析索引
- 索引内容是http endpoint, 所以控制台里面可以展示当前project的所有endpoints列表
- 索引存储到本地文件(.javacli/index.db), 每次打开项目的时候检查一下是否存在, 如果存在就直接打开索引文件, 不用每次都搜索

# 技术栈要求
开发语言: nodejs



# 开发要求
- 开发完成不用生成java项目进行测试
- 不用做额外的测试, 会有人进行功能验收