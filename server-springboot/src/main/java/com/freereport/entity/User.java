package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 用户实体，对应 user 表。
 * 表示系统中的用户账号，关联到具体机构和角色。
 */
@Data
public class User {
    private Long id;
    /** 登录用户名（全局唯一） */
    private String username;
    /** 密码哈希值 */
    private String passwordHash;
    /** 用户显示名称 */
    private String displayName;
    /** 所属机构 ID */
    private Long companyId;
    /** 角色：super_admin / department_report_admin / branch_admin / handler / reviewer / approver */
    private String role;
    /** 账号状态：active(启用) / inactive(停用) */
    private String status;
    private LocalDateTime createdAt;
}
