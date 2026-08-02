package com.freereport.controller;

import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

/**
 * 健康检查控制器。
 * 提供应用健康状态查询接口，用于负载均衡探针和监控。
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    /**
     * 健康检查接口，返回应用状态和当前时间。
     *
     * @return 包含 status 和 time 的响应
     */
    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "ok",
                "time", Instant.now().toString()
        );
    }
}
