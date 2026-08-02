package com.freereport.controller;

import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.DataImportService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 数据导入控制器。
 * 提供报表数据初始化导入接口，支持存档导入和预填充两种模式。
 * 仅限部门报表管理员访问。
 */
@RestController
@RequestMapping("/api/templates")
public class DataImportController {

    private final DataImportService dataImportService;
    private final SecurityUtils securityUtils;

    public DataImportController(DataImportService dataImportService, SecurityUtils securityUtils) {
        this.dataImportService = dataImportService;
        this.securityUtils = securityUtils;
    }

    /**
     * 数据初始化导入：按模板批量导入填报数据。
     * body: { mode: "archive|prefill", period_label: "2026年07月",
     *         rows: [{ company_code, summary: {fieldId: value}, details: [{fieldId: value}] }] }
     */
    @PostMapping("/{id}/data-import")
    public Map<String, Object> importData(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        String mode = body.get("mode") == null ? "" : String.valueOf(body.get("mode"));
        String periodLabel = body.get("period_label") == null ? "" : String.valueOf(body.get("period_label"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) body.get("rows");
        return dataImportService.importData(user, id, mode, periodLabel, rows);
    }
}
