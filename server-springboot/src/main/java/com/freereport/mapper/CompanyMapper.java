package com.freereport.mapper;

import com.freereport.entity.Company;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 机构表 MyBatis Mapper。
 */
@Mapper
public interface CompanyMapper {

    /**
     * 查询所有机构。
     */
    List<Company> findAll();

    /**
     * 根据编码查询机构（数据导入按 company_code 定位）。
     */
    Company findByCode(@Param("code") String code);

    /**
     * 根据 ID 查询机构。
     */
    Company findById(@Param("id") Long id);

    /**
     * 根据 ID 列表批量查询机构。
     */
    List<Company> findByIds(@Param("ids") List<Long> ids);

    /**
     * 查询所有 active 的 branch。
     */
    List<Company> findBranches();

    /**
     * 查询可下发目标机构。
     */
    List<Company> findAssignmentTargets(@Param("excludeId") Long excludeId);

    /**
     * 创建机构，返回受影响行数（生成的主键通过 useGeneratedKeys 回填到参数 map，但 @Param 场景下无法取回，需重新查询）。
     */
    int createCompany(@Param("name") String name,
                      @Param("code") String code,
                      @Param("parentId") Long parentId,
                      @Param("level") String level);

    /**
     * 查询该机构未完成任务数（用于停用前检查）。
     */
    int countActiveAssignments(@Param("companyId") Long companyId);

    /**
     * 停用机构（总部不可停用）。
     */
    int disableCompany(@Param("id") Long id);
}
