package com.freereport.mapper;

import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

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
     * 查询模板下最大 sort_order。
     */
    Integer findMaxSortOrder(@Param("templateId") Long templateId);
}
