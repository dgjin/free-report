package com.freereport.mapper;

import com.freereport.entity.Company;
import com.freereport.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 用户表 MyBatis Mapper。
 */
@Mapper
public interface UserMapper {

    /**
     * 根据 ID 查询用户。
     */
    User findById(@Param("id") Long id);

    /**
     * 根据用户名查询用户（大小写不敏感）。
     */
    User findByUsername(@Param("username") String username);

    /**
     * 查询所有用户。
     */
    List<User> findAll();

    /**
     * 根据 ID 列表批量查询用户。
     */
    List<User> findByIds(@Param("ids") List<Long> ids);

    /**
     * 查询用户所属公司（用于 auth filter 刷新公司信息）。
     */
    Company findCompanyById(@Param("id") Long id);

    /**
     * 根据机构 ID 查询该机构下所有用户 ID（用于缓存失效）。
     */
    List<Long> findIdsByCompanyId(@Param("companyId") Long companyId);

    /**
     * 更新用户机构和角色。
     */
    void updateUserOrganizationRole(@Param("id") Long id,
                                    @Param("companyId") Long companyId,
                                    @Param("role") String role);
}
