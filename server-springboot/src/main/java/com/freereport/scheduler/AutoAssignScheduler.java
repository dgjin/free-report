package com.freereport.scheduler;

import com.freereport.service.AutoAssignService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 周期自动下发调度器：每日扫描到期的模板周期计划并生成下发任务。
 * cron 可通过 app.auto-assign-cron 配置，默认每日 06:30。
 */
@Component
public class AutoAssignScheduler {

    private static final Logger log = LoggerFactory.getLogger(AutoAssignScheduler.class);

    private final AutoAssignService autoAssignService;

    public AutoAssignScheduler(AutoAssignService autoAssignService) {
        this.autoAssignService = autoAssignService;
    }

    @Scheduled(cron = "${app.auto-assign-cron:0 30 6 * * ?}")
    public void run() {
        log.info("auto-assign scheduler triggered");
        autoAssignService.runDueSchedules();
    }
}
