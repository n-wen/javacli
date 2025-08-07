const fs = require('fs');
const filePath = './test/HelloController.java';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('测试正则匹配:');
lines.forEach((line, i) => {
  const trimmed = line.trim();
  
  // 测试控制器注解
  if (/@(RestController|Controller)/.test(trimmed)) {
    console.log(`第${i+1}行匹配控制器: ${trimmed}`);
  }
  
  // 测试RequestMapping
  const reqMatch = trimmed.match(/@RequestMapping\s*\(\s*['"]([^'"]*)['"]\s*\)/);
  if (reqMatch) {
    console.log(`第${i+1}行匹配RequestMapping: ${reqMatch[1]}`);
  }
  
  // 测试GetMapping
  const mapMatch = trimmed.match(/@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*['"]([^'"]*)['"]\s*\)/);
  if (mapMatch) {
    console.log(`第${i+1}行匹配Mapping: ${mapMatch[1]} ${mapMatch[2]}`);
  }
});