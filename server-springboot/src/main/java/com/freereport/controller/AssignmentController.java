package com.freereport.controller;

import com.freereport.dto.RecallRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AssignmentService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 填报任务下发控制器。
 * 提供任务列表查询、任务详情、任务撤回等接口。
 */
@RestController
@RequestMapping("/api/assignments")
public class AssignmentController {

    private final AssignmentService assignmentService;
    private final SecurityUtils securityUtils;

    public AssignmentController(AssignmentService assignmentService, SecurityUtils securityUtils) {
        this.assignmentService = assignmentService;
        this.securityUtils = securityUtils;
    }

    /**
     * 下发任务列表：传 page/size 时返回分页封装 { data, total, page, size }，否则返回完整数组（兼容旧调用）。
     */
    @GetMapping
    public Object listAssignments(@RequestParam(required = false) Integer page,
                                  @RequestParam(required = false) Integer size) {
        AuthUser user = securityUtils.getCurrentUser();
        if (page != null && size != null) {
            return assignmentService.getAssignmentsForUserPaged(user, page, size);
        }
        return assignmentService.getAssignmentsForUser(user);
    }

    /**
     * 查看下发任务详情，包含任务基本信息和关联的模板信息。
     *
     * @param id 下发任务 ID
     * @return 任务详情
     */
    @GetMapping("/{id}")
    public Map<String, Object> getAssignmentDetail(@PathVariable Long id) {
        AuthUser user = securityUtils.getCurrentUser();
        return assignmentService.getAssignmentDetail(id, user);
    }

    /**
     * 撤回已下发的填报任务（仅部门报表管理员）。
     * 仅允许撤回尚未完成审批流程的任务。
     *
     * @param id  下发任务 ID
     * @param req 撤回请求，包含撤回原因
     * @return 操作结果
     */
    @PostMapping("/{id}/recall")
    public Map<String, Object> recallAssignment(@PathVariable Long id,
                                                 @Valid @RequestBody RecallRequest req) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return assignmentService.recallAssignment(id, user, req.getReason());
    }
}
