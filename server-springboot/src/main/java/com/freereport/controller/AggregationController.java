package com.freereport.controller;

import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AggregationService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 聚合统计控制器。
 * 提供报表数据的聚合查询接口，包括按模板查看汇总、执行聚合、历史聚合查询。
 * 仅限部门报表管理员及以上角色访问。
 */
@RestController
@RequestMapping("/api/aggregations")
public class AggregationController {

    private final AggregationService aggregationService;
    private final SecurityUtils securityUtils;

    public AggregationController(AggregationService aggregationService, SecurityUtils securityUtils) {
        this.aggregationService = aggregationService;
        this.securityUtils = securityUtils;
    }

    /**
     * 查看某个模板某期次的聚合视图。
     *
     * @param templateId  报表模板 ID
     * @param periodLabel 期次标签
     * @return 聚合数据，包含各分公司填报状态与汇总指标
     */
    @GetMapping("/by-template/{templateId}")
    public Map<String, Object> getAggregationView(@PathVariable Long templateId,
                                                   @RequestParam("period_label") String periodLabel) {
        AuthUser user = securityUtils.getCurrentUser();
        return aggregationService.getAggregationByTemplate(templateId, periodLabel, user);
    }

    /**
     * 对指定下发任务执行聚合操作。
     * 将已签收的填报数据汇总计算，生成聚合结果。
     *
     * @param assignmentId 下发任务 ID
     * @return 聚合结果数据
     */
    @PostMapping("/aggregate/{assignmentId}")
    public Map<String, Object> aggregateAssignment(@PathVariable Long assignmentId) {
        AuthUser user = securityUtils.getCurrentUser();
        return aggregationService.aggregateAssignment(assignmentId, user);
    }

    /**
     * 查看某个模板的历史聚合记录列表。
     *
     * @param templateId 报表模板 ID
     * @return 历史聚合记录，按期次倒序
     */
    @GetMapping("/history/{templateId}")
    public List<Map<String, Object>> getHistory(@PathVariable Long templateId) {
        AuthUser user = securityUtils.getCurrentUser();
        return aggregationService.getAggregationHistory(templateId, user);
    }
}
