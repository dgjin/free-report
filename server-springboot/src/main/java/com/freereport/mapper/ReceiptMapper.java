package com.freereport.mapper;

import com.freereport.entity.SubmissionReceipt;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 回执 MyBatis Mapper。
 */
@Mapper
public interface ReceiptMapper {

    /**
     * 查询部门待回执的提交列表。
     */
    List<Map<String, Object>> findPendingReceipts(@Param("departmentId") Long departmentId);

    /**
     * 插入回执记录，返回生成 ID。
     */
    long insertReceipt(SubmissionReceipt receipt);

    /**
     * 更新提交的回执状态。
     */
    int updateSubmissionReceiptStatus(@Param("submissionId") Long submissionId,
                                      @Param("status") String status);

    /**
     * 更新下发任务的回执状态。
     */
    int updateAssignmentReceiptStatus(@Param("assignmentId") Long assignmentId,
                                      @Param("status") String status);
}
