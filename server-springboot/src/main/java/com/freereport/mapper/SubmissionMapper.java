package com.freereport.mapper;

import com.freereport.entity.ReportSubmission;
import com.freereport.entity.ReportSubmissionData;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 报表提交 MyBatis Mapper。
 */
@Mapper
public interface SubmissionMapper {

    /**
     * 根据 ID 查询提交。
     */
    ReportSubmission findById(@Param("id") Long id);

    /**
     * 根据 ID 查询提交（加行锁，用于事务内防并发）。
     */
    ReportSubmission findByIdForUpdate(@Param("id") Long id);

    /**
     * 根据下发任务 ID 查询最新版本提交。
     */
    ReportSubmission findLatestByAssignmentId(@Param("assignmentId") Long assignmentId);

    /**
     * 根据下发任务 ID 查询最新版本提交（加行锁）。
     */
    ReportSubmission findLatestByAssignmentIdForUpdate(@Param("assignmentId") Long assignmentId);

    /**
     * 根据下发任务 ID 查询最新已审批通过的提交。
     */
    ReportSubmission findLatestApprovedByAssignmentId(@Param("assignmentId") Long assignmentId);

    /**
     * 根据下发任务 ID 列表查询所有提交。
     */
    List<ReportSubmission> findByAssignmentIds(@Param("assignmentIds") List<Long> assignmentIds);

    /**
     * 根据下发任务 ID 列表查询每个任务的最新版本提交（JOIN 子查询）。
     */
    List<ReportSubmission> findLatestByAssignmentIds(@Param("assignmentIds") List<Long> assignmentIds);

    /**
     * 根据下发任务 ID 列表查询每个任务的最新已审批通过提交（JOIN 子查询）。
     */
    List<ReportSubmission> findLatestApprovedByAssignmentIds(@Param("assignmentIds") List<Long> assignmentIds);

    /**
     * 插入提交，返回生成 ID。
     */
    long insertSubmission(ReportSubmission submission);

    /**
     * 更新提交状态（同时更新提交人、公司、状态、备注、提交时间）。
     */
    int updateSubmissionStatus(@Param("id") Long id,
                               @Param("submittedBy") Long submittedBy,
                               @Param("submittedByCompanyId") Long submittedByCompanyId,
                               @Param("status") String status,
                               @Param("comment") String comment,
                               @Param("submittedAt") LocalDateTime submittedAt);

    /**
     * 删除提交的明细数据。
     */
    int deleteSubmissionData(@Param("submissionId") Long submissionId);

    /**
     * 批量插入提交明细数据。
     */
    int insertSubmissionDataBatch(@Param("list") List<ReportSubmissionData> dataList);

    /**
     * 根据提交 ID 查询明细数据。
     */
    List<ReportSubmissionData> findDataBySubmissionId(@Param("submissionId") Long submissionId);

    /**
     * 根据提交 ID 列表批量查询明细数据。
     */
    List<ReportSubmissionData> findDataBySubmissionIds(@Param("submissionIds") List<Long> submissionIds);
}
