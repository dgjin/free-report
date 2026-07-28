package com.freereport.controller;

import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.ReminderService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reminders")
public class ReminderController {

    private final ReminderService reminderService;
    private final SecurityUtils securityUtils;

    public ReminderController(ReminderService reminderService, SecurityUtils securityUtils) {
        this.reminderService = reminderService;
        this.securityUtils = securityUtils;
    }

    /**
     * 当前用户的退回提醒列表：分公司返回填报驳回/签收退回，部门报表管理员返回模板驳回。
     */
    @GetMapping("/rejected")
    public List<Map<String, Object>> getRejectedReminders() {
        AuthUser user = securityUtils.getCurrentUser();
        return reminderService.getRejectedReminders(user);
    }
}
