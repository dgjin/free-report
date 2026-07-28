package com.freereport.mapper;

import com.freereport.entity.ReportTemplateSchedule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 模板周期下发计划 MyBatis Mapper。
 */
@Mapper
public interface TemplateScheduleMapper {

    /**
     * 根据模板 ID 查询计划。
     */
    ReportTemplateSchedule findByTemplateId(@Param("templateId") Long templateId);

    /**
     * 查询所有已启用且模板已发布的计划（调度器扫描用）。
     */
    List<ReportTemplateSchedule> findEnabledWithPublishedTemplate();

    /**
     * 插入或更新计划（按 template_id 唯一键）。
     */
    int upsert(ReportTemplateSchedule schedule);

    /**
     * 更新最近已生成分期标签。
     */
    int updateLastPeriodLabel(@Param("id") Long id, @Param("lastPeriodLabel") String lastPeriodLabel);
}
