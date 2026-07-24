package com.freereport.service;

import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.entity.SubmissionReceipt;
import com.freereport.entity.User;
import com.freereport.exception.DomainException;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.ReceiptMapper;
import com.freereport.mapper.SubmissionMapper;
import com.freereport.mapper.UserMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 回执服务：待签收列表与签收/退回处理。
 */
@Service
public class ReceiptService {

    private final ReceiptMapper receiptMapper;
    private final SubmissionMapper submissionMapper;
    private final AssignmentMapper assignmentMapper;
    private final UserMapper userMapper;
    private final SecurityUtils securityUtils;

    public ReceiptService(ReceiptMapper receiptMapper, SubmissionMapper submissionMapper,
                          AssignmentMapper assignmentMapper, UserMapper userMapper, SecurityUtils securityUtils) {
        this.receiptMapper = receiptMapper;
        this.submissionMapper = submissionMapper;
        this.assignmentMapper = assignmentMapper;
        this.userMapper = userMapper;
        this.securityUtils = securityUtils;
    }

    /**
     * 返回当前部门待签收的提交列表。
     */
    public List<Map<String, Object>> getPendingReceipts(AuthUser user) {
        return receiptMapper.findPendingReceipts(user.getCompanyId());
    }

    /**
     * 处理签收/退回：
     * - 仅发起部门报表管理员可签收
     * - 退回必须填写原因
     * - 写入回执记录，更新提交与任务状态
     */
    @Transactional
    public Map<String, Object> processReceipt(Long submissionId, AuthUser user, String action, String comment) {
        securityUtils.requireDepartmentReportAdmin();
        ReportSubmission s = submissionMapper.findByIdForUpdate(submissionId);
        if (s == null) {
            throw new DomainException("填报记录不存在", 404);
        }
        ReportAssignment a = assignmentMapper.findById(s.getAssignmentId());
        if (a == null || !user.getCompanyId().equals(a.getIssuerDepartmentId())) {
            throw new DomainException("无权签收该填报", 404);
        }
        User u = userMapper.findById(user.getId());
        if (u == null || !"department_report_admin".equals(u.getRole())
                || !u.getCompanyId().equals(user.getCompanyId())) {
            throw new DomainException("仅发起部门报表管理员可以签收", 403);
        }
        if (!"pending_receipt".equals(s.getStatus())) {
            throw new DomainException("填报状态已变化，请刷新后重试", 409);
        }
        if ("returned".equals(action) && (comment == null || comment.trim().isEmpty())) {
            throw new DomainException("退回时必须填写原因", 400);
        }

        SubmissionReceipt receipt = new SubmissionReceipt();
        receipt.setSubmissionId(submissionId);
        receipt.setIssuerDepartmentId(user.getCompanyId());
        receipt.setReceivedBy(user.getId());
        receipt.setAction(action);
        receipt.setComment(comment);
        receiptMapper.insertReceipt(receipt);

        receiptMapper.updateSubmissionReceiptStatus(submissionId, action);
        receiptMapper.updateAssignmentReceiptStatus(a.getId(), action);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("submission", submissionToMap(submissionMapper.findById(submissionId)));
        result.put("receipt", receiptToMap(receipt));
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

    private Map<String, Object> receiptToMap(SubmissionReceipt r) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (r == null) {
            return m;
        }
        m.put("id", r.getId());
        m.put("submission_id", r.getSubmissionId());
        m.put("issuer_department_id", r.getIssuerDepartmentId());
        m.put("received_by", r.getReceivedBy());
        m.put("action", r.getAction());
        m.put("comment", r.getComment());
        m.put("created_at", r.getCreatedAt());
        return m;
    }
}
