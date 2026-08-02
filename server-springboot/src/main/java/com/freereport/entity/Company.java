package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 机构实体，对应 company 表。
 * 表示组织架构中的机构节点，支持总部-部门-分公司三级结构。
 */
@Data
public class Company {
    private Long id;
    /** 机构名称 */
    private String name;
    /** 机构编码（全局唯一） */
    private String code;
    /** 上级机构 ID，为空时为顶级机构 */
    private Long parentId;
    /** 机构层级：headquarter(总部) / department(部门) / branch(分公司) */
    private String level;
    /** 机构地址 */
    private String address;
    /** 联系人姓名 */
    private String contact;
    /** 联系电话 */
    private String phone;
    /** 机构状态：active(启用) / inactive(停用) */
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
