package com.freereport.service;

import com.freereport.entity.ReportSubmission;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * 填报状态机：集中管理填报保存/提交时 report_submissions 与 report_assignments 的状态流转规则。
 * 纯决策、无副作用；持久化由 SubmissionService 完成。
 *
 * 状态全景（submission 状态 / assignment 状态）：
 * - 保存草稿            → draft / filling
 * - 提交 + 有复核人     → pending_review / submitted（进入三级审批）
 * - 提交 + 无复核人     → pending_receipt / pending_receipt（直达待签收）
 * - 可写状态：draft、returned、rejected（其余状态均已进入流转，禁止重复保存/提交）
 * - 版本演化：draft 原地更新；returned/rejected 关闭遗留 pending 审批后版本 +1 新建
 */
@Component
public class SubmissionWorkflow {

    /** 允许继续保存/提交的 submission 状态 */
    private static final Set<String> WRITABLE_STATUSES = Set.of("draft", "returned", "rejected");

    /** 保存/提交后的目标状态对（submission 状态 + assignment 状态） */
    public record SaveTransition(String submissionStatus, String assignmentStatus) {}

    /** 最新提交是否允许继续保存/提交（existing 为 null 表示从未提交过，允许） */
    public boolean canWrite(ReportSubmission existing) {
        return existing == null || WRITABLE_STATUSES.contains(existing.getStatus());
    }

    /** 保存/提交的目标状态：提交时有复核人进入复核，否则直达待签收；草稿保持可编辑 */
    public SaveTransition onSave(boolean isSubmit, boolean hasReviewer) {
        if (!isSubmit) {
            return new SaveTransition("draft", "filling");
        }
        return hasReviewer
                ? new SaveTransition("pending_review", "submitted")
                : new SaveTransition("pending_receipt", "pending_receipt");
    }

    /** 是否原地更新现有记录（仅草稿：数据随写随改，不产生新版本） */
    public boolean shouldUpdateInPlace(ReportSubmission existing) {
        return existing != null && "draft".equals(existing.getStatus());
    }

    /** 是否需要关闭上一版本遗留的 pending 审批（rejected/returned 版本重新提交前的防御性清理） */
    public boolean shouldClosePendingApprovals(ReportSubmission existing) {
        return existing != null
                && ("rejected".equals(existing.getStatus()) || "returned".equals(existing.getStatus()));
    }

    /** 新版本的版本号：在上一版本基础上 +1；从未提交过或历史数据版本缺失时为 1 */
    public int nextVersion(ReportSubmission existing) {
        if (existing == null || existing.getVersion() == null) {
            return 1;
        }
        return existing.getVersion() + 1;
    }
}
