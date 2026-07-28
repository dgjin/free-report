package com.freereport;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
@MapperScan("com.freereport.mapper")
public class FreeReportApplication {
    public static void main(String[] args) {
        SpringApplication.run(FreeReportApplication.class, args);
    }
}
