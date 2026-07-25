package com.freereport.service;

import com.freereport.entity.ApprovalRecord;
import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.entity.User;
import com.freereport.exception.DomainException;
import com.freereport.mapper.ApprovalMapper;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.SubmissionMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 审批服务：待审批列表与三级审批流程处理。
 */
@Service
public class ApprovalService {

    private final ApprovalMapper approvalMapper;
    private final SubmissionMapper submissionMapper;
    private final AssignmentMapper assignmentMapper;
    private final SecurityUtils securityUtils;

    public ApprovalService(ApprovalMapper approvalMapper, SubmissionMapper submissionMapper,
                           AssignmentMapper assignmentMapper, SecurityUtils securityUtils) {
        this.approvalMapper = approvalMapper;
        this.submissionMapper = submissionMapper;
        this.assignmentMapper = assignmentMapper;
        this.securityUtils = securityUtils;
    }

    /**
     * 返回当前用户的待审批列表。
     */
    public List<Map<String, Object>> getPendingApprovals(AuthUser user) {
        return approvalMapper.findPendingApprovalsForUser(user.getCompanyId(), user.getRole());
    }

    /**
     * 处理审批动作（approved / rejected）：
     * - reviewer approved -> 创建 approver 审批记录，状态改 pending_approval
     * - approver approved -> 状态改 pending_receipt，assignment 同步更新
     * - rejected -> 状态改 rejected
     */
    @Transactional
    public Map<String, Object> processApprovalAction(Long submissionId, AuthUser user, String action, String comment) {
        ReportSubmission s = submissionMapper.findByIdForUpdate(submissionId);
        if (s == null) {
            throw new DomainException("填报记录不存在", 404);
        }
        ReportAssignment a = assignmentMapper.findById(s.getAssignmentId());
        ApprovalRecord pending = approvalMapper.findPendingBySubmissionId(submissionId);
        if (pending == null) {
            throw new DomainException("该填报当前没有待处理的审批步骤", 409);
        }
        String expectedStatus = "reviewer".equals(pending.getApprovalLevel()) ? "pending_review" : "pending_approval";
        if (!expectedStatus.equals(s.getStatus())) {
            throw new DomainException("审批状态已变化，请刷新后重试", 409);
        }
        // 权限校验：复核/审批人须与提交人同机构（canReadSubmission），且为指定处理人、角色匹配
        if (!securityUtils.canReadSubmission(s)
                || !user.getId().equals(pending.getApproverId())
                || !pending.getApprovalLevel().equals(user.getRole())) {
            throw new DomainException("你不是该审批步骤的指定处理人", 403);
        }

        String effectiveComment = (comment == null || comment.isEmpty())
                ? ("approved".equals(action) ? "同意" : "驳回")
                : comment;
        approvalMapper.updateApprovalStatus(pending.getId(), action, effectiveComment);

        if ("rejected".equals(action)) {
            submissionMapper.updateSubmissionStatus(submissionId, s.getSubmittedBy(),
                    s.getSubmittedByCompanyId(), "rejected", s.getComment(), s.getSubmittedAt());
            if (a != null) {
                assignmentMapper.updateStatus(a.getId(), "rejected");
            }
        } else if ("reviewer".equals(pending.getApprovalLevel())) {
            User approver = approvalMapper.findApprover(user.getCompanyId());
            if (approver == null) {
                throw new DomainException("该公司未配置有效审批人", 409);
            }
            submissionMapper.updateSubmissionStatus(submissionId, s.getSubmittedBy(),
                    s.getSubmittedByCompanyId(), "pending_approval", s.getComment(), s.getSubmittedAt());
            ApprovalRecord rec = new ApprovalRecord();
            rec.setSubmissionId(submissionId);
            rec.setApprovalLevel("approver");
            rec.setApproverId(approver.getId());
            rec.setStatus("pending");
            rec.setComment("等候终审");
            approvalMapper.insertApproval(rec);
        } else {
            // approver approved -> 进入待签收
            submissionMapper.updateSubmissionStatus(submissionId, s.getSubmittedBy(),
                    s.getSubmittedByCompanyId(), "pending_receipt", s.getComment(), s.getSubmittedAt());
            if (a != null) {
                assignmentMapper.updateStatus(a.getId(), "pending_receipt");
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "rejected".equals(action) ? "已驳回" : "审批通过");
        result.put("submission", submissionToMap(submissionMapper.findById(submissionId)));
        result.put("approval", approvalToMap(approvalMapper.findBySubmissionId(submissionId).stream()
                .filter(x -> x.getId().equals(pending.getId())).findFirst().orElse(null)));
        return result;
    }

    private Map<String, Object> submissionToMap(ReportSubmission s) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (s == null) {
            return m;
        }
        m.put("id", s.getId());
        m.put("assignment_id", s.getAssignmentId());
        m.put("version", s.getVersion());
        m.put("submitted_by_company_id", s.getSubmittedByCompanyId());
        m.put("submitted_by", s.getSubmittedBy());
        m.put("status", s.getStatus());
        m.put("comment", s.getComment());
        m.put("submitted_at", s.getSubmittedAt());
        m.put("created_at", s.getCreatedAt());
        return m;
    }

    private Map<String, Object> approvalToMap(ApprovalRecord r) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (r == null) {
            return m;
        }
        m.put("id", r.getId());
        m.put("submission_id", r.getSubmissionId());
        m.put("approval_level", r.getApprovalLevel());
        m.put("approver_id", r.getApproverId());
        m.put("status", r.getStatus());
        m.put("comment", r.getComment());
        m.put("created_at", r.getCreatedAt());
        m.put("updated_at", r.getUpdatedAt());
        return m;
    }
}
