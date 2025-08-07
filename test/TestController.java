package com.example.test;

import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/test")
public class TestController {

    @GetMapping("/view")
    public RestResponse view(HttpServletRequest request) {
        LoginEntity logined = (LoginEntity) request.getSession().getAttribute("LOGINED_KEY");
        return RestResponse.of("test data");
    }

    /**
     * 校验角色名唯一性
     */
    @PostMapping("/validateRoleName")
    public RestResponse validateRoleName(@RequestParam(value = "validateValue", defaultValue = "") String roleName,
                                         @RequestParam(value = "tenancyId", defaultValue = "") String tenancyId,
                                         @RequestParam(value = "id", defaultValue = "") String id) {
        return RestResponse.of("validation result");
    }
}

class RestResponse {
    public static RestResponse of(Object data) {
        return new RestResponse();
    }
}

class LoginEntity {}