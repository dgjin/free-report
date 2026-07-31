package com.freereport.mapper;

import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import com.freereport.entity.TemplateApproval;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 报表模板 MyBatis Mapper。
 */
@Mapper
public interface TemplateMapper {

    /**
     * 查询所有模板。
     */
    List<ReportTemplate> findAll();

    /**
     * 根据 ID 列表批量查询模板。
     */
    List<ReportTemplate> findByIds(@Param("ids") List<Long> ids);

    /**
     * 根据 ID 查询模板。
     */
    ReportTemplate findById(@Param("id") Long id);

    /**
     * 根据 ID 查询模板（加行锁，用于事务内防并发）。
     */
    ReportTemplate findByIdForUpdate(@Param("id") Long id);

    /**
     * 根据归属部门查询模板。
     */
    List<ReportTemplate> findByOwnerDepartment(@Param("departmentId") Long departmentId);

    /**
     * 根据用户角色过滤查询模板。
     */
    List<ReportTemplate> findForUser(@Param("companyId") Long companyId,
                                     @Param("role") String role,
                                     @Param("companyLevel") String companyLevel);

    /**
     * 根据用户角色过滤分页查询模板（LIMIT/OFFSET）。
     */
    List<ReportTemplate> findForUserPaged(@Param("companyId") Long companyId,
                                          @Param("role") String role,
                                          @Param("companyLevel") String companyLevel,
                                          @Param("limit") int limit,
                                          @Param("offset") int offset);

    /**
     * 根据用户角色过滤统计模板总数（与 findForUser 相同过滤条件）。
     */
    long countForUser(@Param("companyId") Long companyId,
                      @Param("role") String role,
                      @Param("companyLevel") String companyLevel);

    /**
     * 插入模板，返回生成 ID。
     */
    long insertTemplate(ReportTemplate template);

    /**
     * 更新模板基本信息。
     */
    int updateTemplate(@Param("id") Long id,
                       @Param("name") String name,
                       @Param("description") String description,
                       @Param("periodType") String periodType);

    /**
     * 启用/停用模板。
     */
    int setTemplateStatus(@Param("id") Long id,
                          @Param("status") String status);

    /**
     * 根据模板 ID 查询字段。
     */
    List<ReportTemplateField> findFieldsByTemplateId(@Param("templateId") Long templateId);

    /**
     * 根据模板 ID 列表批量查询字段。
     */
    List<ReportTemplateField> findFieldsByTemplateIds(@Param("templateIds") List<Long> templateIds);

    /**
     * 根据模板 ID 和字段名查询字段。
     */
    ReportTemplateField findFieldByName(@Param("templateId") Long templateId,
                                        @Param("fieldName") String fieldName);

    /**
     * 插入字段，返回生成 ID。
     */
    long insertField(ReportTemplateField field);

    /**
     * 批量插入字段。
     */
    int insertFieldsBatch(@Param("list") List<ReportTemplateField> fields);

    /**
     * 停用字段。
     */
    int disableField(@Param("templateId") Long templateId,
                     @Param("fieldId") Long fieldId);

    /**
     * 更新字段（仅设计阶段未下发前允许）。
     */
    int updateField(@Param("templateId") Long templateId,
                    @Param("fieldId") Long fieldId,
                    @Param("fieldName") String fieldName,
                    @Param("fieldLabel") String fieldLabel,
                    @Param("fieldType") String fieldType,
                    @Param("fieldConfig") String fieldConfig);

    /**
     * 物理删除字段（仅设计阶段未下发前允许）。
     */
    int deleteField(@Param("templateId") Long templateId,
                    @Param("fieldId") Long fieldId);

    /**
     * 查询模板下最大 sort_order。
     */
    Integer findMaxSortOrder(@Param("templateId") Long templateId);

    // ---- 模板审批 ----

    /**
     * 插入模板审批记录。
     */
    long insertTemplateApproval(TemplateApproval approval);

    /**
     * 查询模板的最新审批记录。
     */
    TemplateApproval findLatestApprovalByTemplateId(@Param("templateId") Long templateId);

    /**
     * 查询所有待审批的模板审批记录（含模板名称、部门名称、提交人名称）。
     */
    List<TemplateApproval> findPendingApprovals();

    /**
     * 更新审批记录状态。
     */
    int updateApprovalStatus(@Param("id") Long id,
                              @Param("status") String status,
                              @Param("reviewedBy") Long reviewedBy,
                              @Param("comment") String comment);

    /**
     * 查询部门被数转办驳回的模板（最新审批记录为 rejected 且模板处于草稿，含审批人与意见）。
     */
    List<Map<String, Object>> findRejectedTemplatesForDepartment(@Param("companyId") Long companyId);
}
