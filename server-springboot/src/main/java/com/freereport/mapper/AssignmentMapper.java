package com.freereport.mapper;

import com.freereport.entity.ReportAssignment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 报表下发任务 MyBatis Mapper。
 */
@Mapper
public interface AssignmentMapper {

    /**
     * 查询所有下发任务。
     */
    List<ReportAssignment> findAll();

    /**
     * 根据 ID 列表批量查询下发任务。
     */
    List<ReportAssignment> findByIds(@Param("ids") List<Long> ids);

    /**
     * 根据 ID 查询下发任务。
     */
    ReportAssignment findById(@Param("id") Long id);

    /**
     * 根据 ID 查询下发任务（加行锁，用于事务内防并发）。
     */
    ReportAssignment findByIdForUpdate(@Param("id") Long id);

    /**
     * 根据用户过滤查询下发任务。
     */
    List<ReportAssignment> findForUser(@Param("companyId") Long companyId,
                                       @Param("role") String role,
                                       @Param("companyLevel") String companyLevel);

    /**
     * 根据模板和周期查询下发任务。
     */
    List<ReportAssignment> findByTemplateAndPeriod(@Param("templateId") Long templateId,
                                                   @Param("periodLabel") String periodLabel);

    /**
     * 根据模板 ID 查询下发任务。
     */
    List<ReportAssignment> findByTemplateId(@Param("templateId") Long templateId);

    /**
     * 插入下发任务，返回生成 ID。
     */
    long insertAssignment(ReportAssignment assignment);

    /**
     * 插入下发任务（INSERT IGNORE，避免唯一约束冲突）。
     */
    int insertAssignmentIgnore(ReportAssignment assignment);

    /**
     * 更新下发任务状态。
     */
    int updateStatus(@Param("id") Long id,
                     @Param("status") String status);

    /**
     * 查询任务下未结束的提交数（用于收回检查，当前未使用，保持简单）。
     */
    int countActiveAssignmentsForRecall(@Param("assignmentId") Long assignmentId);

    /**
     * 根据模板 ID 列表统计每个模板的下发任务数。
     */
    List<Map<String, Object>> countByTemplateIds(@Param("templateIds") List<Long> templateIds);
}
