package com.example.test;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(Const.REST_API_URL_IVR_SCRIPT)
public class EnterpriseIvrScriptController {

    @GetMapping("/list")
    public String list() {
        return "list";
    }

    @PostMapping(API_ENDPOINTS.SAVE)
    public String save() {
        return "save";
    }

    @PutMapping("/update/{id}")
    public String update(@PathVariable Long id) {
        return "update" + id;
    }
}

class Const {
    public static final String REST_API_URL_IVR_SCRIPT = "/api/ivr/script";
}

class API_ENDPOINTS {
    public static final String SAVE = "/save";
}