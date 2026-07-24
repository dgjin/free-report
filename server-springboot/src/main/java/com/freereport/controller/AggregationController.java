package com.freereport.controller;

import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AggregationService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/aggregations")
public class AggregationController {

    private final AggregationService aggregationService;
    private final SecurityUtils securityUtils;

    public AggregationController(AggregationService aggregationService, SecurityUtils securityUtils) {
        this.aggregationService = aggregationService;
        this.securityUtils = securityUtils;
    }

    @GetMapping("/by-template/{templateId}")
    public Map<String, Object> getAggregationView(@PathVariable Long templateId,
                                                   @RequestParam("period_label") String periodLabel) {
        AuthUser user = securityUtils.getCurrentUser();
        return aggregationService.getAggregationByTemplate(templateId, periodLabel, user);
    }

    @PostMapping("/aggregate/{assignmentId}")
    public Map<String, Object> aggregateAssignment(@PathVariable Long assignmentId) {
        AuthUser user = securityUtils.getCurrentUser();
        return aggregationService.aggregateAssignment(assignmentId, user);
    }

    @GetMapping("/history/{templateId}")
    public List<Map<String, Object>> getHistory(@PathVariable Long templateId) {
        AuthUser user = securityUtils.getCurrentUser();
        return aggregationService.getAggregationHistory(templateId, user);
    }
}
