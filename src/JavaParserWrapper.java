import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.Node;
import com.github.javaparser.symbolsolver.JavaSymbolSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.CombinedTypeSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.ReflectionTypeSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.JavaParserTypeSolver;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

public class JavaParserWrapper {
    
    public static class EndpointInfo {
        String httpMethod;
        String fullPath;
        String methodName;
        String className;
        
        public EndpointInfo(String httpMethod, String fullPath, String methodName, String className) {
            this.httpMethod = httpMethod;
            this.fullPath = fullPath;
            this.methodName = methodName;
            this.className = className;
        }
        
        @Override
    public String toString() {
        return String.format("%s %s -> %s.%s", httpMethod, fullPath, className, methodName);
    }
    
    public String toJson() {
        return String.format(
            "{\"httpMethod\":\"%s\",\"path\":\"%s\",\"className\":\"%s\",\"methodName\":\"%s\"}",
            httpMethod, fullPath, className, methodName
        );
    }
    }
    
    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("Usage: java JavaParserWrapper <java-file-path> [source-root]");
            System.exit(1);
        }
        
        String javaFilePath = args[0];
        String sourceRoot = args.length > 1 ? args[1] : ".";
        
        try {
            List<EndpointInfo> endpoints = parseJavaFile(javaFilePath, sourceRoot);
            System.out.println("[");
            for (int i = 0; i < endpoints.size(); i++) {
                System.out.print(endpoints.get(i).toJson());
                if (i < endpoints.size() - 1) {
                    System.out.println(",");
                } else {
                    System.out.println();
                }
            }
            System.out.println("]");
        } catch (Exception e) {
            System.err.println("Error parsing file: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
    
    public static List<EndpointInfo> parseJavaFile(String javaFilePath, String sourceRoot) throws Exception {
        List<EndpointInfo> endpoints = new ArrayList<>();
        
        // 设置符号解析器
        CombinedTypeSolver typeSolver = new CombinedTypeSolver();
        typeSolver.add(new ReflectionTypeSolver());
        typeSolver.add(new JavaParserTypeSolver(new File(sourceRoot)));
        
        JavaSymbolSolver symbolSolver = new JavaSymbolSolver(typeSolver);
        StaticJavaParser.getConfiguration().setSymbolResolver(symbolSolver);
        
        CompilationUnit cu = StaticJavaParser.parse(new File(javaFilePath));
        
        for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
            if (!classDecl.isPublic()) continue;
            
            String className = classDecl.getNameAsString();
            String classLevelPath = getClassLevelPath(classDecl);
            
            for (MethodDeclaration method : classDecl.getMethods()) {
                if (!method.isPublic()) continue;
                
                Map<String, String> methodMappings = getMethodLevelMappings(method);
                
                for (Map.Entry<String, String> entry : methodMappings.entrySet()) {
                    String httpMethod = entry.getKey();
                    String methodPath = entry.getValue();
                    
                    String fullPath = combinePaths(classLevelPath, methodPath);
                    
                    endpoints.add(new EndpointInfo(
                        httpMethod,
                        fullPath,
                        method.getNameAsString(),
                        className
                    ));
                }
            }
        }
        
        return endpoints;
    }
    
    private static String getClassLevelPath(ClassOrInterfaceDeclaration classDecl) {
        // 检查 @RequestMapping
        Optional<String> requestMapping = classDecl.getAnnotationByName("RequestMapping")
            .flatMap(ann -> getAnnotationValue(ann, "value"));
        
        if (requestMapping.isPresent()) {
            return resolveConstant(requestMapping.get(), classDecl);
        }
        
        // 检查 @RestController 的 path 属性
        Optional<String> restControllerPath = classDecl.getAnnotationByName("RestController")
            .flatMap(ann -> getAnnotationValue(ann, "path"));
        
        if (restControllerPath.isPresent()) {
            return resolveConstant(restControllerPath.get(), classDecl);
        }
        
        return "";
    }
    
    private static Map<String, String> getMethodLevelMappings(MethodDeclaration method) {
        Map<String, String> mappings = new HashMap<>();
        
        // 检查各种HTTP方法注解
        String[] httpMethods = {"GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping"};
        
        for (String httpMethod : httpMethods) {
            method.getAnnotationByName(httpMethod).ifPresent(ann -> {
                getAnnotationValue(ann, "value").ifPresent(value -> {
                    String resolvedValue = resolveConstant(value, method);
                    mappings.put(httpMethod.replace("Mapping", "").toUpperCase(), resolvedValue);
                });
            });
        }
        
        // 检查 @RequestMapping
        method.getAnnotationByName("RequestMapping").ifPresent(ann -> {
            getAnnotationValue(ann, "value").ifPresent(value -> {
                String resolvedValue = resolveConstant(value, method);
                
                // 检查 method 属性
                Optional<String> methodValue = getAnnotationValue(ann, "method");
                if (methodValue.isPresent()) {
                    String httpMethod = extractHttpMethod(methodValue.get());
                    if (httpMethod != null) {
                        mappings.put(httpMethod, resolvedValue);
                    }
                } else {
                    mappings.put("GET", resolvedValue); // 默认GET
                }
            });
        });
        
        return mappings;
    }
    
    private static Optional<String> getAnnotationValue(Node annotationExpr, String attributeName) {
        if (annotationExpr instanceof AnnotationExpr) {
            AnnotationExpr ann = (AnnotationExpr) annotationExpr;
            
            if (ann instanceof SingleMemberAnnotationExpr) {
                SingleMemberAnnotationExpr single = (SingleMemberAnnotationExpr) ann;
                return Optional.of(single.getMemberValue().toString());
            }
            
            if (ann instanceof NormalAnnotationExpr) {
                NormalAnnotationExpr normal = (NormalAnnotationExpr) ann;
                return normal.getPairs().stream()
                    .filter(pair -> pair.getNameAsString().equals(attributeName))
                    .findFirst()
                    .map(pair -> pair.getValue().toString());
            }
            
            if (ann instanceof MarkerAnnotationExpr) {
                return Optional.of("");
            }
        }
        
        return Optional.empty();
    }
    
    private static String resolveConstant(String value, Node context) {
        // 移除引号
        if (value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1);
        }
        
        // 检查是否是常量引用
        if (value.matches("[A-Z_][A-Z0-9_]*") || value.contains(".")) {
            try {
                // 尝试解析常量表达式
                Expression expr = StaticJavaParser.parseExpression(value);
                if (expr instanceof NameExpr || expr instanceof FieldAccessExpr) {
                    return expr.calculateResolvedType().describe();
                }
            } catch (Exception e) {
                // 无法解析，返回原始值
            }
        }
        
        return value;
    }
    
    private static String extractHttpMethod(String methodValue) {
        if (methodValue.contains("RequestMethod.GET")) return "GET";
        if (methodValue.contains("RequestMethod.POST")) return "POST";
        if (methodValue.contains("RequestMethod.PUT")) return "PUT";
        if (methodValue.contains("RequestMethod.DELETE")) return "DELETE";
        if (methodValue.contains("RequestMethod.PATCH")) return "PATCH";
        return null;
    }
    
    private static String combinePaths(String classPath, String methodPath) {
        if (classPath.isEmpty()) return methodPath;
        if (methodPath.isEmpty()) return classPath;
        
        String combined = classPath + "/" + methodPath;
        combined = combined.replaceAll("//+", "/");
        
        if (!combined.startsWith("/")) {
            combined = "/" + combined;
        }
        
        return combined;
    }
}