package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 任务撤回记录实体，对应 assignment_recall 表。
 * 记录部门报表管理员对已下发任务的撤回操作。
 */
@Data
public class AssignmentRecall {
    private Long id;
    /** 关联的下发任务 ID */
    private Long assignmentId;
    /** 执行撤回操作的用户 ID */
    private Long recalledBy;
    /** 发起撤回的部门机构 ID */
    private Long issuerDepartmentId;
    /** 撤回原因 */
    private String reason;
    private LocalDateTime createdAt;
}
