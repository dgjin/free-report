package com.freereport;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 随手报（FreeReport）应用入口。
 * 启用 MyBatis Mapper 扫描和定时任务调度，支持报表自动下发等周期性任务。
 */
@EnableScheduling
@SpringBootApplication
@MapperScan("com.freereport.mapper")
public class FreeReportApplication {
    public static void main(String[] args) {
        SpringApplication.run(FreeReportApplication.class, args);
    }
}
