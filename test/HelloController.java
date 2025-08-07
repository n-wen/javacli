package com.example.test;

import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@RestController
@RequestMapping("/api")
public class HelloController {
    
    @GetMapping("/hello")
    public String hello() {
        return "Hello, World!";
    }
    
    @GetMapping("/test")
    public String test() {
        return "Test endpoint";
    }
}