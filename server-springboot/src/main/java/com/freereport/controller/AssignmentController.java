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

    @GetMapping
    public List<Map<String, Object>> listAssignments() {
        AuthUser user = securityUtils.getCurrentUser();
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
