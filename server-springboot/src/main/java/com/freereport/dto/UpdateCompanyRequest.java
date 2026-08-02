package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class UpdateCompanyRequest {
    @NotBlank
    private String name;
    @NotBlank
    private String code;
    private String address;
    private String contact;
    private String phone;
}
