package com.freereport.service;

import com.freereport.mapper.ApprovalMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.security.AuthUser;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 退回提醒服务：汇总当前用户需要处理的退回事项。
 * - 分公司角色：填报被复核/审批驳回（submission_rejected）+ 被部门签收退回（receipt_returned）
 * - 部门报表管理员：模板被数智化转型办公室驳回（template_rejected）
 * 退回事项随重新提交自动消除，无需单独的已读状态。
 */
@Service
public class ReminderService {

    private final ApprovalMapper approvalMapper;
    private final TemplateMapper templateMapper;

    public ReminderService(ApprovalMapper approvalMapper, TemplateMapper templateMapper) {
        this.approvalMapper = approvalMapper;
        this.templateMapper = templateMapper;
    }

    public List<Map<String, Object>> getRejectedReminders(AuthUser user) {
        if ("branch".equals(user.getCompanyLevel())) {
            List<Map<String, Object>> reminders = new ArrayList<>();
            reminders.addAll(approvalMapper.findRejectedSubmissionsForCompany(user.getCompanyId()));
            reminders.addAll(approvalMapper.findReturnedSubmissionsForCompany(user.getCompanyId()));
            return reminders;
        }
        if ("department_report_admin".equals(user.getRole())) {
            return templateMapper.findRejectedTemplatesForDepartment(user.getCompanyId());
        }
        return Collections.emptyList();
    }
}
