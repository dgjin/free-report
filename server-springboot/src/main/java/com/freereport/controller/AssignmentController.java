package com.freereport.controller;

import com.freereport.dto.RecallRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AssignmentService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    @GetMapping("/{id}")
    public Map<String, Object> getAssignmentDetail(@PathVariable Long id) {
        AuthUser user = securityUtils.getCurrentUser();
        return assignmentService.getAssignmentDetail(id, user);
    }

    @PostMapping("/{id}/recall")
    public Map<String, Object> recallAssignment(@PathVariable Long id,
                                                 @Valid @RequestBody RecallRequest req) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return assignmentService.recallAssignment(id, user, req.getReason());
    }
}
