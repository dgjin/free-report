package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class CreateSubmissionRequest {
    @NotNull
    private Long assignmentId;
    private Map<String, Object> summary;
    private List<Map<String, Object>> details;
    private String comment;
    @NotNull
    private String action; // "draft" | "submit"
}
