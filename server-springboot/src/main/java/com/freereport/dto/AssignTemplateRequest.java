package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class AssignTemplateRequest {
    @NotEmpty
    private List<Long> companyIds;
    @NotBlank
    private String title;
    @NotBlank
    private String periodLabel;
    private String deadline;
    private Boolean isOneTime;
}
