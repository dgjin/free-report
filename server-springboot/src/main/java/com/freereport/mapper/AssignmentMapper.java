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
     * 根据用户过滤分页查询下发任务（LIMIT/OFFSET）。
     */
    List<ReportAssignment> findForUserPaged(@Param("companyId") Long companyId,
                                            @Param("role") String role,
                                            @Param("companyLevel") String companyLevel,
                                            @Param("limit") int limit,
                                            @Param("offset") int offset);

    /**
     * 根据用户过滤统计下发任务总数（与 findForUser 相同过滤条件）。
     */
    long countForUser(@Param("companyId") Long companyId,
                      @Param("role") String role,
                      @Param("companyLevel") String companyLevel);

    /**
     * 根据模板和多个周期批量查询下发任务（智能问数多周期取数用，避免逐周期 N+1）。
     * 单周期场景传入单元素列表即可，语义与原单周期查询一致。
     */
    List<ReportAssignment> findByTemplateAndPeriods(@Param("templateId") Long templateId,
                                                    @Param("periodLabels") List<String> periodLabels);

    /**
     * 根据模板 + 周期 + 机构精确查询下发任务（利用唯一键 uq_assignment_period，O(1) 查找）。
     */
    ReportAssignment findByTemplatePeriodAndCompany(@Param("templateId") Long templateId,
                                                    @Param("periodLabel") String periodLabel,
                                                    @Param("companyId") Long companyId);

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

    /**
     * 根据模板 ID 列表批量查询各模板的去重周期标签（智能问数上下文用，避免逐模板 N+1）。
     */
    List<Map<String, Object>> findPeriodLabelsByTemplateIds(@Param("templateIds") List<Long> templateIds);

    /**
     * 智能问数运营统计：按下发部门分组统计任务数与状态分布。
     * 数据范围与 findForUser 的权限口径一致（超管全量 / 部门管理员本部门 / 其余本机构）。
     */
    List<Map<String, Object>> statsByIssuerDepartment(@Param("companyId") Long companyId,
                                                      @Param("role") String role);

    /**
     * 智能问数运营统计：按填报机构分组统计任务数与状态分布（不含已撤回任务）。
     * 数据范围与 findForUser 的权限口径一致（超管全量 / 部门管理员本部门下发 / 其余本机构）。
     */
    List<Map<String, Object>> statsByAssignedCompany(@Param("companyId") Long companyId,
                                                     @Param("role") String role);
}
