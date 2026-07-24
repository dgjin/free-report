package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class CreateTemplateRequest {
    @NotBlank
    private String name;
    private String description;
    @NotBlank
    private String periodType;
    private List<Map<String, Object>> fields;
}
