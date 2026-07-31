package com.freereport.service;

import com.freereport.entity.ReportTemplateField;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 字段值校验服务（与前端 src/utils/dataValidation.ts 同语义的兜底强校验）：
 * - 基础校验：必填、number 数字与 min/max 范围、date 格式（YYYY-MM-DD）、select 值须在选项内
 * - 跨字段校验（汇总 number 字段，配置于 field_config.validation）：
 *   sum_of（等于其他汇总字段之和）、detail_sum_of（等于某明细/交叉表数字列合计），容差 0.005
 * - 明细空行跳过；交叉表列仅对已填值做单值校验（固定行允许留空）
 * - 跨字段规则引用不到的字段 id 直接忽略（被引用字段可能已停用/删除）
 */
@Service
public class ValidationService {

    /** 跨字段求和比较容差 */
    public static final double SUM_TOLERANCE = 0.005;

    private static final Pattern DATE_PATTERN = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private final ObjectMapper objectMapper;

    public ValidationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 解析 field_config：容错模式，解析失败视为无规则 */
    public Map<String, Object> parseConfig(String json) {
        if (json == null || json.isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    /**
     * 单值校验（不含必填）：number 必须可解析为数字且落在 min/max；
     * date 匹配 YYYY-MM-DD 且是合法日期；select 值须在 options 内。
     * 空值视为合法（必填由调用方单独判断）。返回错误文案或 null。
     */
    public String validateValue(ReportTemplateField field, Map<String, Object> config, String value) {
        String text = value == null ? "" : value.trim();
        if (text.isEmpty()) {
            return null;
        }
        String type = field.getFieldType();
        String label = field.getFieldLabel();

        if ("number".equals(type)) {
            Double num = parseNumber(text);
            if (num == null) {
                return "「" + label + "」值「" + text + "」不是有效数字";
            }
            Double min = asDouble(config.get("min"));
            Double max = asDouble(config.get("max"));
            if (min != null && num < min) {
                return "「" + label + "」值 " + text + " 小于最小值 " + formatNumber(min);
            }
            if (max != null && num > max) {
                return "「" + label + "」值 " + text + " 大于最大值 " + formatNumber(max);
            }
            return null;
        }

        if ("date".equals(type)) {
            if (!DATE_PATTERN.matcher(text).matches() || !isValidDate(text)) {
                return "「" + label + "」值「" + text + "」不是有效日期（格式须为 YYYY-MM-DD）";
            }
            return null;
        }

        if ("select".equals(type)) {
            List<String> options = asStringList(config.get("options"));
            if (!options.isEmpty() && !options.contains(text)) {
                return "「" + label + "」值「" + text + "」不在可选项内";
            }
            return null;
        }

        return null;
    }

    /**
     * 整单提交校验（active 字段）：
     * - 汇总字段：required 空值报错 + 单值校验 + 跨字段规则（sum_of / detail_sum_of）
     * - 明细行：跳过空行；非空行逐字段单值校验 + required 检查，错误带行号
     * - 交叉表列：仅对已填值做单值校验，不做必填
     */
    public List<String> validateSubmissionData(List<ReportTemplateField> fields,
                                               Map<String, Object> summary,
                                               List<Map<String, Object>> details) {
        List<String> errors = new ArrayList<>(validateValuesOnly(fields, summary, details));

        List<ReportTemplateField> activeFields = filterActive(fields);
        Map<Long, Map<String, Object>> configById = new HashMap<>();
        for (ReportTemplateField f : activeFields) {
            configById.put(f.getId(), parseConfig(f.getFieldConfig()));
        }

        // ---- 必填：汇总字段 ----
        for (ReportTemplateField f : activeFields) {
            if (!"summary".equals(f.getDataType())) {
                continue;
            }
            Map<String, Object> config = configById.get(f.getId());
            if (isRequired(config) && valueOf(summary, f.getId()).isEmpty()) {
                errors.add("「" + f.getFieldLabel() + "」为必填项");
            }
        }

        // ---- 必填：非空明细行（交叉表固定行仅含 matrix 值时不按明细行检查） ----
        List<ReportTemplateField> detailFields = new ArrayList<>();
        for (ReportTemplateField f : activeFields) {
            if ("detail".equals(f.getDataType())) {
                detailFields.add(f);
            }
        }
        if (details != null) {
            for (int i = 0; i < details.size(); i++) {
                Map<String, Object> row = details.get(i);
                if (isEmptyRow(row)) {
                    continue;
                }
                boolean hasDetailValue = false;
                for (ReportTemplateField f : detailFields) {
                    if (!valueOf(row, f.getId()).isEmpty()) {
                        hasDetailValue = true;
                        break;
                    }
                }
                if (!hasDetailValue) {
                    continue;
                }
                for (ReportTemplateField f : detailFields) {
                    Map<String, Object> config = configById.get(f.getId());
                    if (isRequired(config) && valueOf(row, f.getId()).isEmpty()) {
                        errors.add("明细第 " + (i + 1) + " 行：「" + f.getFieldLabel() + "」为必填项");
                    }
                }
            }
        }

        // ---- 跨字段规则（汇总 number 字段；引用失效字段的规则忽略） ----
        Map<Long, ReportTemplateField> summaryById = new HashMap<>();
        Set<Long> numberColumnIds = new LinkedHashSet<>();
        Map<Long, ReportTemplateField> fieldById = new HashMap<>();
        for (ReportTemplateField f : activeFields) {
            fieldById.put(f.getId(), f);
            if ("summary".equals(f.getDataType())) {
                summaryById.put(f.getId(), f);
            }
            if (("detail".equals(f.getDataType()) || "matrix".equals(f.getDataType()))
                    && "number".equals(f.getFieldType())) {
                numberColumnIds.add(f.getId());
            }
        }
        for (ReportTemplateField f : activeFields) {
            if (!"summary".equals(f.getDataType()) || !"number".equals(f.getFieldType())) {
                continue;
            }
            Map<String, Object> config = configById.get(f.getId());
            Object ruleObj = config.get("validation");
            if (!(ruleObj instanceof Map)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> rule = (Map<String, Object>) ruleObj;
            Double actual = parseNumber(valueOf(summary, f.getId()));
            if (actual == null) {
                continue; // 空值/非法值已由基础校验覆盖
            }

            List<Long> sumOf = asLongList(rule.get("sum_of"));
            Long detailSumOf = asLong(rule.get("detail_sum_of"));
            if (!sumOf.isEmpty()) {
                List<Long> refs = new ArrayList<>();
                for (Long id : sumOf) {
                    if (summaryById.containsKey(id)) {
                        refs.add(id);
                    }
                }
                if (refs.isEmpty()) {
                    continue; // 引用字段全部失效则忽略规则
                }
                double expected = 0;
                StringBuilder labels = new StringBuilder();
                for (Long id : refs) {
                    Double v = parseNumber(valueOf(summary, id));
                    expected += v == null ? 0 : v;
                    if (labels.length() > 0) {
                        labels.append('+');
                    }
                    labels.append(summaryById.get(id).getFieldLabel());
                }
                if (Math.abs(actual - expected) > SUM_TOLERANCE) {
                    errors.add("「" + f.getFieldLabel() + "」(" + formatNumber(actual) + ") 应等于 "
                            + labels + " 之和 (" + formatNumber(expected) + ")");
                }
            } else if (detailSumOf != null) {
                if (!numberColumnIds.contains(detailSumOf)) {
                    continue; // 引用列失效则忽略
                }
                double expected = 0;
                if (details != null) {
                    for (Map<String, Object> row : details) {
                        Double v = parseNumber(valueOf(row, detailSumOf));
                        expected += v == null ? 0 : v;
                    }
                }
                if (Math.abs(actual - expected) > SUM_TOLERANCE) {
                    errors.add("「" + f.getFieldLabel() + "」(" + formatNumber(actual) + ") 应等于「"
                            + fieldById.get(detailSumOf).getFieldLabel() + "」列合计 (" + formatNumber(expected) + ")");
                }
            }
        }

        return errors;
    }

    /**
     * 仅类型/范围单值校验（prefill 预填导入：挡脏数据，不做必填与跨字段）。
     * 汇总值直接校验；明细/交叉表值按行校验，错误带行号。
     */
    public List<String> validateValuesOnly(List<ReportTemplateField> fields,
                                           Map<String, Object> summary,
                                           List<Map<String, Object>> details) {
        List<String> errors = new ArrayList<>();
        List<ReportTemplateField> activeFields = filterActive(fields);
        Map<Long, Map<String, Object>> configById = new HashMap<>();
        for (ReportTemplateField f : activeFields) {
            configById.put(f.getId(), parseConfig(f.getFieldConfig()));
        }

        for (ReportTemplateField f : activeFields) {
            if (!"summary".equals(f.getDataType())) {
                continue;
            }
            String err = validateValue(f, configById.get(f.getId()), valueOf(summary, f.getId()));
            if (err != null) {
                errors.add(err);
            }
        }

        if (details != null) {
            for (int i = 0; i < details.size(); i++) {
                Map<String, Object> row = details.get(i);
                if (isEmptyRow(row)) {
                    continue;
                }
                for (ReportTemplateField f : activeFields) {
                    if ("summary".equals(f.getDataType())) {
                        continue;
                    }
                    String value = valueOf(row, f.getId());
                    if (value.isEmpty()) {
                        continue;
                    }
                    String err = validateValue(f, configById.get(f.getId()), value);
                    if (err != null) {
                        errors.add("第 " + (i + 1) + " 行：" + err);
                    }
                }
            }
        }
        return errors;
    }

    // ---- helpers ----

    private List<ReportTemplateField> filterActive(List<ReportTemplateField> fields) {
        List<ReportTemplateField> out = new ArrayList<>();
        if (fields == null) {
            return out;
        }
        for (ReportTemplateField f : fields) {
            if ("active".equals(f.getStatus())) {
                out.add(f);
            }
        }
        return out;
    }

    private boolean isRequired(Map<String, Object> config) {
        return config != null && Boolean.TRUE.equals(config.get("required"));
    }

    private boolean isEmptyRow(Map<String, Object> row) {
        if (row == null || row.isEmpty()) {
            return true;
        }
        for (Object v : row.values()) {
            if (v != null && !String.valueOf(v).trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }

    private String valueOf(Map<String, Object> values, Long fieldId) {
        if (values == null) {
            return "";
        }
        Object v = values.get(String.valueOf(fieldId));
        return v == null ? "" : String.valueOf(v).trim();
    }

    private Double parseNumber(String text) {
        if (text == null || text.trim().isEmpty()) {
            return null;
        }
        try {
            double d = Double.parseDouble(text.trim());
            return Double.isFinite(d) ? d : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean isValidDate(String text) {
        try {
            LocalDate.parse(text);
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private Double asDouble(Object raw) {
        if (raw instanceof Number) {
            return ((Number) raw).doubleValue();
        }
        return null;
    }

    private Long asLong(Object raw) {
        if (raw instanceof Number) {
            return ((Number) raw).longValue();
        }
        return null;
    }

    private List<Long> asLongList(Object raw) {
        List<Long> out = new ArrayList<>();
        if (raw instanceof List) {
            for (Object o : (List<?>) raw) {
                if (o instanceof Number) {
                    out.add(((Number) o).longValue());
                }
            }
        }
        return out;
    }

    private List<String> asStringList(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List) {
            for (Object o : (List<?>) raw) {
                if (o != null) {
                    out.add(String.valueOf(o));
                }
            }
        }
        return out;
    }

    /** 数字文案：去掉无意义的小数尾零（与前端 JS 数字展示语义一致） */
    private String formatNumber(double d) {
        BigDecimal bd = BigDecimal.valueOf(d).stripTrailingZeros();
        return bd.scale() <= 0 ? bd.toBigInteger().toString() : bd.toPlainString();
    }
}
