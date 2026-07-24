package com.freereport.controller;

import com.freereport.dto.CreateSubmissionRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.SubmissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/submissions")
public class SubmissionController {

    private final SubmissionService submissionService;
    private final SecurityUtils securityUtils;

    public SubmissionController(SubmissionService submissionService, SecurityUtils securityUtils) {
        this.submissionService = submissionService;
        this.securityUtils = securityUtils;
    }

    @PostMapping
    public Map<String, Object> createOrUpdateSubmission(@Valid @RequestBody CreateSubmissionRequest req) {
        AuthUser user = securityUtils.getCurrentUser();
        boolean isSubmit = "submit".equals(req.getAction());
        return submissionService.createOrUpdateSubmission(
                user, req.getAssignmentId(), req.getSummary(), req.getDetails(), req.getComment(), isSubmit);
    }

    @PostMapping("/{id}/submit")
    public Map<String, Object> submitExisting(@PathVariable Long id,
                                              @RequestBody(required = false) Map<String, Object> body) {
        AuthUser user = securityUtils.getCurrentUser();
        String comment = body != null ? (String) body.get("comment") : null;
        return submissionService.submitExistingDraft(id, user, comment);
    }

    @GetMapping("/{id}")
    public Map<String, Object> getSubmissionDetail(@PathVariable Long id) {
        AuthUser user = securityUtils.getCurrentUser();
        return submissionService.getSubmissionDetail(id, user);
    }

    @GetMapping("/by-assignment/{assignmentId}")
    public Object getLatestByAssignment(@PathVariable Long assignmentId) {
        AuthUser user = securityUtils.getCurrentUser();
        return submissionService.getSubmissionByAssignment(assignmentId, user);
    }
}
