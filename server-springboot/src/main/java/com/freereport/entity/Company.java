package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Company {
    private Long id;
    private String name;
    private String code;
    private Long parentId;
    private String level; // headquarter, department, branch
    private String address;
    private String contact;
    private String phone;
    private String status; // active, inactive
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
