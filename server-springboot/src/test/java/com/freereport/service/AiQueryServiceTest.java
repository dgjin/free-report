package com.freereport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import com.freereport.exception.DomainException;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * AiQueryService 纯单元测试：mock 掉 LLM 与取数依赖，验证计划校验、指标分类、
 * 聚合方式、机构筛选、并发限制与数字格式化等纯逻辑。
 */
class AiQueryServiceTest {

    private AiClient aiClient;
    private AggregationService aggregationService;
    private TemplateMapper templateMapper;
    private AssignmentMapper assignmentMapper;
    private AiQueryService service;

    private final AuthUser admin = new AuthUser(1L, "admin", "管理员", 1L,
            "总部", "HQ", "headquarter", "super_admin");

    @BeforeEach
    void setUp() {
        aiClient = mock(AiClient.class);
        aggregationService = mock(AggregationService.class);
        templateMapper = mock(TemplateMapper.class);
        assignmentMapper = mock(AssignmentMapper.class);
        service = new AiQueryService(aiClient, aggregationService, templateMapper,
                assignmentMapper, new ObjectMapper());
        stubVehicleTemplate();
    }

    /** 公务车管理台账：纯明细模板，含标识字段 engine_no 与两个可求和明细字段 */
    private void stubVehicleTemplate() {
        ReportTemplate t = new ReportTemplate();
        t.setId(10L);
        t.setName("公务车管理台账");
        t.setPeriodType("quarterly");
        t.setStatus("published");
        when(templateMapper.findForUser(any(), any(), any())).thenReturn(List.of(t));

        when(templateMapper.findFieldsByTemplateIds(anyList())).thenReturn(List.of(
                field(10L, "engine_no", "发动机号", "number", "detail"),
                field(10L, "bare_price", "裸车价", "number", "detail"),
                field(10L, "mileage", "行驶里程", "number", "detail"),
                field(10L, "brand", "品牌", "text", "detail")
        ));
        when(assignmentMapper.findPeriodLabelsByTemplateIds(anyList())).thenReturn(List.of(
                Map.of("template_id", 10L, "period_label", "2026年Q3"),
                Map.of("template_id", 10L, "period_label", "2026年Q2")
        ));
        when(aggregationService.getAggregationByTemplate(eq(10L), eq("2026年Q3"), any()))
                .thenReturn(aggregation("2026年Q3"));
        when(aggregationService.getAggregationByTemplate(eq(10L), eq("2026年Q2"), any()))
                .thenReturn(aggregation("2026年Q2"));
    }

    private ReportTemplateField field(Long templateId, String name, String label, String fieldType, String dataType) {
        ReportTemplateField f = new ReportTemplateField();
        f.setTemplateId(templateId);
        f.setFieldName(name);
        f.setFieldLabel(label);
        f.setFieldType(fieldType);
        f.setDataType(dataType);
        f.setStatus("active");
        return f;
    }

    /** 模拟汇总引擎返回：北京 2 行明细、上海 1 行明细、广州未提交 */
    private Map<String, Object> aggregation(String period) {
        Map<String, Object> agg = new LinkedHashMap<>();
        agg.put("company_data", List.of(
                company("北京分公司", true),
                company("上海分公司", true),
                company("广州分公司", false)
        ));
        agg.put("summary", Map.of());
        agg.put("detail_rows", List.of(
                detailRow("北京分公司", 1000000, 30000),
                detailRow("北京分公司", 570500, 20000),
                detailRow("上海分公司", 800000, 50000)
        ));
        agg.put("detail_summary", Map.of(
                "bare_price", Map.of("total", 2370500, "count", 3, "average", 790166.67),
                "mileage", Map.of("total", 100000, "count", 3, "average", 33333.33)
        ));
        return agg;
    }

    private Map<String, Object> company(String name, boolean submitted) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("company_name", name);
        c.put("has_submitted", submitted);
        c.put("values", Map.of());
        return c;
    }

    private Map<String, Object> detailRow(String companyName, int barePrice, int mileage) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("company_name", companyName);
        row.put("engine_no", 12345678);
        row.put("bare_price", barePrice);
        row.put("mileage", mileage);
        row.put("brand", companyName.contains("北京") ? "丰田" : "奥迪");
        return row;
    }

    private void stubPlan(String planJson) {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(planJson);
        // 总结阶段直接失败，走规则文案降级，隔离 LLM 影响
        when(aiClient.chat(anyList(), eq(false))).thenThrow(new DomainException("AI 不可用", 502));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> plan(Map<String, Object> result) {
        return (Map<String, Object>) result.get("plan");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> table(Map<String, Object> result) {
        return (Map<String, Object>) result.get("table");
    }

    @SuppressWarnings("unchecked")
    private List<List<String>> rows(Map<String, Object> result) {
        return (List<List<String>>) table(result).get("rows");
    }

    @SuppressWarnings("unchecked")
    private List<String> columns(Map<String, Object> result) {
        return (List<String>) table(result).get("columns");
    }

    @Test
    void 默认指标排除标识字段且包含记录数() {
        stubPlan("{\"template_id\":10,\"period_labels\":[\"2026年Q3\"],\"metric_field_names\":[]," +
                "\"dimension\":\"company\",\"chart_type\":\"bar\",\"title\":\"公务车\",\"unanswerable_reason\":null}");

        Map<String, Object> result = service.query("统计公务车情况", List.of(), admin);

        List<Map<String, String>> metrics = (List<Map<String, String>>) plan(result).get("metrics");
        List<String> fieldNames = metrics.stream().map(m -> m.get("field_name")).toList();
        assertTrue(fieldNames.contains("_record_count"), "默认指标应包含记录数");
        assertTrue(fieldNames.contains("bare_price"), "默认指标应包含裸车价");
        assertFalse(fieldNames.contains("engine_no"), "标识字段不应进默认指标");
    }

    @Test
    void 机构筛选只保留匹配机构且支持模糊匹配() {
        stubPlan("{\"template_id\":10,\"period_labels\":[\"2026年Q3\"],\"metric_field_names\":[\"bare_price\"]," +
                "\"dimension\":\"company\",\"chart_type\":\"bar\",\"company_names\":[\"北京\"],\"unanswerable_reason\":null}");

        Map<String, Object> result = service.query("北京的裸车价", List.of(), admin);

        List<List<String>> rows = rows(result);
        assertEquals(1, rows.size(), "只应保留北京分公司一行");
        assertEquals("北京分公司", rows.get(0).get(0));
        assertEquals("1,570,500", rows.get(0).get(1), "明细合计应带千分位");
        assertEquals(List.of("北京"), plan(result).get("company_names"));
    }

    @Test
    void 机构名全部对不上时忽略筛选() {
        stubPlan("{\"template_id\":10,\"period_labels\":[\"2026年Q3\"],\"metric_field_names\":[\"bare_price\"]," +
                "\"dimension\":\"company\",\"chart_type\":\"bar\",\"company_names\":[\"不存在的机构\"],\"unanswerable_reason\":null}");

        Map<String, Object> result = service.query("裸车价", List.of(), admin);

        assertEquals(3, rows(result).size(), "筛选无匹配时应回退为全部机构");
        assertEquals(List.of(), plan(result).get("company_names"));
    }

    @Test
    void 平均聚合按明细行取平均并体现在列名() {
        stubPlan("{\"template_id\":10,\"period_labels\":[\"2026年Q3\"],\"metric_field_names\":[\"bare_price\"]," +
                "\"dimension\":\"period\",\"aggregation\":\"avg\",\"chart_type\":\"table\",\"unanswerable_reason\":null}");

        Map<String, Object> result = service.query("裸车价平均值", List.of(), admin);

        assertEquals("avg", plan(result).get("aggregation"));
        assertTrue(columns(result).contains("裸车价（平均）"), "列名应标注平均");
        // (1000000 + 570500 + 800000) / 3 = 790166.67
        assertEquals("790,166.67", rows(result).get(0).get(1));
    }

    @Test
    void 记录数指标按机构统计明细行数() {
        stubPlan("{\"template_id\":10,\"period_labels\":[\"2026年Q3\"],\"metric_field_names\":[\"_record_count\"]," +
                "\"dimension\":\"company\",\"chart_type\":\"bar\",\"unanswerable_reason\":null}");

        Map<String, Object> result = service.query("各机构有多少台车", List.of(), admin);

        List<List<String>> rows = rows(result);
        assertEquals("2", rows.get(0).get(1), "北京应为 2 台");
        assertEquals("1", rows.get(1).get(1), "上海应为 1 台");
        assertEquals("-", rows.get(2).get(1), "未提交机构显示 -");
    }

    @Test
    void 按字段分组统计各组聚合值与记录数() {
        stubPlan("{\"template_id\":10,\"period_labels\":[\"2026年Q3\"],\"metric_field_names\":[\"bare_price\",\"_record_count\"]," +
                "\"dimension\":\"field\",\"group_by_field\":\"brand\",\"chart_type\":\"bar\",\"unanswerable_reason\":null}");

        Map<String, Object> result = service.query("按品牌统计裸车价", List.of(), admin);

        assertEquals("field", plan(result).get("dimension"));
        assertEquals("brand", plan(result).get("group_by_field"));
        assertEquals("品牌", plan(result).get("group_by_field_label"));
        // 明细行：北京 2 行（丰田）、上海 1 行（奥迪）
        List<List<String>> rows = rows(result);
        assertEquals(2, rows.size(), "应按品牌分两组");
        // 第一组应聚合值更高（丰田 2 行合计 1,570,500 > 奥迪 1 行 800,000）
        assertEquals("丰田", rows.get(0).get(0), "降序排列后丰田在前");
        assertEquals("1,570,500", rows.get(0).get(1), "丰田裸车价合计应带千分位");
        assertEquals("2", rows.get(0).get(2), "丰田记录数应为 2");
        assertEquals("奥迪", rows.get(1).get(0));
        assertEquals("800,000", rows.get(1).get(1));
        assertEquals("1", rows.get(1).get(2));
    }

    @Test
    void groupByField不在可分组字段清单时降级为机构维度() {
        stubPlan("{\"template_id\":10,\"period_labels\":[\"2026年Q3\"],\"metric_field_names\":[\"bare_price\"]," +
                "\"dimension\":\"field\",\"group_by_field\":\"engine_no\",\"chart_type\":\"bar\",\"unanswerable_reason\":null}");

        Map<String, Object> result = service.query("按发动机号统计", List.of(), admin);

        assertEquals("company", plan(result).get("dimension"), "engine_no 是数值字段不在可分组字段清单，应降级");
        assertNull(plan(result).get("group_by_field"));
    }

    @Test
    void 计划外周期回退到最近一期() {
        stubPlan("{\"template_id\":10,\"period_labels\":[\"2030年Q1\"],\"metric_field_names\":[\"bare_price\"]," +
                "\"dimension\":\"company\",\"chart_type\":\"bar\",\"unanswerable_reason\":null}");

        Map<String, Object> result = service.query("裸车价", List.of(), admin);

        assertEquals(List.of("2026年Q3"), plan(result).get("period_labels"), "编造的周期应回退为最近一期");
    }

    @Test
    void 无法回答时返回纯文本() {
        stubPlan("{\"unanswerable_reason\":\"该问题与报表数据无关\"}");

        Map<String, Object> result = service.query("今天天气如何", List.of(), admin);

        assertNull(result.get("plan"));
        assertNull(result.get("chart"));
        assertTrue(String.valueOf(result.get("answer")).contains("该问题与报表数据无关"));
    }

    @Test
    void 同一用户并发第二次请求被拒() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(aiClient.chat(anyList(), eq(true))).thenAnswer(inv -> {
            entered.countDown();
            release.await(5, TimeUnit.SECONDS);
            return "{\"unanswerable_reason\":\"测试\"}";
        });

        Thread first = new Thread(() -> service.query("第一问", List.of(), admin));
        first.start();
        assertTrue(entered.await(5, TimeUnit.SECONDS), "首个请求应已进入 LLM 调用");
        try {
            DomainException e = assertThrows(DomainException.class,
                    () -> service.query("第二问", List.of(), admin));
            assertEquals(429, e.getStatusCode());
        } finally {
            release.countDown();
            first.join(5000);
        }
        // 首个请求结束后应可再次提问
        Map<String, Object> again = service.query("第三问", List.of(), admin);
        assertNull(again.get("plan"));
    }
}
