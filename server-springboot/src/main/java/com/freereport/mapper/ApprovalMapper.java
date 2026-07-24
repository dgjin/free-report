package com.freereport.mapper;

import com.freereport.entity.ApprovalRecord;
import com.freereport.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 审批记录 MyBatis Mapper。
 */
@Mapper
public interface ApprovalMapper {

    /**
     * 根据提交 ID 查询审批记录。
     */
    List<ApprovalRecord> findBySubmissionId(@Param("submissionId") Long submissionId);

    /**
     * 根据提交 ID 查询待审批记录。
     */
    ApprovalRecord findPendingBySubmissionId(@Param("submissionId") Long submissionId);

    /**
     * 插入审批记录，返回生成 ID。
     */
    long insertApproval(ApprovalRecord record);

    /**
     * 更新审批状态。
     */
    int updateApprovalStatus(@Param("id") Long id,
                             @Param("status") String status,
                             @Param("comment") String comment);

    /**
     * 批量拒绝 pending 审批。
     */
    int rejectPendingApprovals(@Param("submissionId") Long submissionId,
                               @Param("comment") String comment);

    /**
     * 查询用户待审批列表（复杂 JOIN 查询）。
     */
    List<Map<String, Object>> findPendingApprovalsForUser(@Param("companyId") Long companyId,
                                                          @Param("role") String role);

    /**
     * 查询公司复核人。
     */
    User findReviewer(@Param("companyId") Long companyId);

    /**
     * 查询公司审批人。
     */
    User findApprover(@Param("companyId") Long companyId);
}
