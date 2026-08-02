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
     * 查询指定父机构下的子机构。
     */
    List<Company> findChildren(@Param("parentId") Long parentId);

    /**
     * 创建机构，返回受影响行数（生成的主键通过 useGeneratedKeys 回填到参数 map，但 @Param 场景下无法取回，需重新查询）。
     */
    int createCompany(@Param("name") String name,
                      @Param("code") String code,
                      @Param("parentId") Long parentId,
                      @Param("level") String level);

    /**
     * 编辑机构基本信息。
     */
    int updateCompany(@Param("id") Long id,
                      @Param("name") String name,
                      @Param("code") String code,
                      @Param("address") String address,
                      @Param("contact") String contact,
                      @Param("phone") String phone);

    /**
     * 根据 code 查询机构（排除指定 id，用于唯一性校验）。
     */
    Company findByCodeExcludeId(@Param("code") String code, @Param("excludeId") Long excludeId);

    /**
     * 启用机构。
     */
    int enableCompany(@Param("id") Long id);

    /**
     * 查询该机构未完成任务数（用于停用前检查）。
     */
    int countActiveAssignments(@Param("companyId") Long companyId);

    /**
     * 停用机构（总部不可停用）。
     */
    int disableCompany(@Param("id") Long id);

    /**
     * 查询指定机构下的用户数（用于停用前检查）。
     */
    int countUsersByCompanyId(@Param("companyId") Long companyId);
}
