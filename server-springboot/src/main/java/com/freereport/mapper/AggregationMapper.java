package com.freereport.mapper;

import com.freereport.entity.AssignmentRecall;
import com.freereport.entity.ReportAggregation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 报表汇总 MyBatis Mapper。
 */
@Mapper
public interface AggregationMapper {

    /**
     * 聚合指定任务下所有数值字段。
     */
    List<Map<String, Object>> sumNumericFieldsByAssignment(@Param("assignmentId") Long assignmentId);

    /**
     * 统计指定任务下已审批通过的提交数。
     */
    int countApprovedSubmissions(@Param("assignmentId") Long assignmentId);

    /**
     * 插入汇总记录（带 ON DUPLICATE KEY UPDATE）。
     */
    long insertAggregation(@Param("templateId") Long templateId,
                           @Param("assignmentId") Long assignmentId,
                           @Param("aggregatedData") String aggregatedData,
                           @Param("branchCount") Integer branchCount,
                           @Param("submittedCount") Integer submittedCount);

    /**
     * 更新汇总记录。
     */
    int updateAggregation(@Param("templateId") Long templateId,
                          @Param("assignmentId") Long assignmentId,
                          @Param("aggregatedData") String aggregatedData,
                          @Param("submittedCount") Integer submittedCount);

    /**
     * 根据任务 ID 查询汇总记录。
     */
    ReportAggregation findByAssignmentId(@Param("assignmentId") Long assignmentId);

    /**
     * 插入任务收回审计记录。
     */
    int insertRecall(AssignmentRecall recall);
}
