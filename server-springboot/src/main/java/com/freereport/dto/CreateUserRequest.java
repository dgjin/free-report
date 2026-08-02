package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class CreateUserRequest {
    @NotBlank
    private String username;
    @NotBlank
    private String displayName;
    @NotNull
    private Long companyId;
    @NotBlank
    private String role;
}
