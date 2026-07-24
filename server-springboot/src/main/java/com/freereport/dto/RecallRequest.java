package com.freereport.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class RecallRequest {
    @NotBlank
    private String reason;
}
