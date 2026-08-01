package com.freereport.service;

import com.freereport.mapper.AssignmentMapper;
import com.freereport.security.AuthUser;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 智能问数 · 运营统计：各部门下发报表情况与各机构填报情况的规则化分析。
 * 这两类问题是固定口径的任务状态统计（不依赖模板指标，也不需要模型理解），
 * 在主流程进入 LLM 计划阶段之前用关键词规则识别并直接作答：
 * 口径确定、响应快，且在 AI 服务不可用时依然可用。
 * 数据范围与 {@code AssignmentMapper.findForUser} 的权限口径保持一致，不越权。
 */
@Component
public class AiOperationAnalyzer {

    /** 图表最多展示的部门/机构数（完整数据仍在表格中展示） */
    private static final int MAX_CHART_CATEGORIES = 15;

    private final AssignmentMapper assignmentMapper;

    public AiOperationAnalyzer(AssignmentMapper assignmentMapper) {
        this.assignmentMapper = assignmentMapper;
    }

    /**
     * 命中运营统计意图时直接给出完整问数结果（answer/plan/chart/table/scope_note 结构）；
     * 未命中返回 null，主流程继续走 LLM 计划。
     */
    public Map<String, Object> answerIfMatched(String question, AuthUser user) {
        String text = question == null ? "" : question.replaceAll("\\s+", "");
        if (text.isEmpty()) {
            return null;
        }
        boolean hasIssueWord = containsAny(text, "下发", "下派");
        // 填报/提交进度类：流程词命中；「完成情况」只在不涉及下发时才算填报（「下发完成情况」说的是下发本身）
        boolean fillHit = containsAny(text, "填报情况", "填报进度", "填报率", "提交情况", "上报情况", "报送情况")
                || (text.contains("填报") && containsAny(text, "进度", "情况", "完成", "分析"))
                || (!hasIssueWord && text.contains("完成情况"));
        // 下发类：含「下发/下派」且提到部门或情况统计
        boolean issueHit = hasIssueWord
                && containsAny(text, "部门", "情况", "统计", "分析", "多少", "哪些", "完成", "进度");
        if (fillHit && issueHit) {
            // 复合问句（如「总部部门下发及分公司填报情况」）：按先出现的意图作答，并引导追问另一维度
            return issueIntentIndex(text) <= fillIntentIndex(text)
                    ? withFollowUp(buildIssueStats(user), "各分公司填报情况分析")
                    : withFollowUp(buildFillStats(user), "各部门下发报表的情况");
        }
        if (fillHit) {
            return buildFillStats(user);
        }
        if (issueHit) {
            return buildIssueStats(user);
        }
        return null;
    }

    /** 「下发/下派」首次出现位置，未出现返回 MAX（词序越靠前优先级越高） */
    private int issueIntentIndex(String text) {
        int index = indexOfAny(text, "下发", "下派");
        return index < 0 ? Integer.MAX_VALUE : index;
    }

    /** 填报类意图词首次出现位置，未出现返回 MAX */
    private int fillIntentIndex(String text) {
        int index = indexOfAny(text, "填报", "提交", "上报", "报送", "完成");
        return index < 0 ? Integer.MAX_VALUE : index;
    }

    /** 在结论文案末尾追加另一维度的追问引导（复合问句只答了一个维度时使用） */
    private Map<String, Object> withFollowUp(Map<String, Object> result, String followUpQuestion) {
        result.put("answer", result.get("answer") + "如需另一维度分析，可继续问我「" + followUpQuestion + "」。");
        return result;
    }

    private int indexOfAny(String text, String... keywords) {
        int best = -1;
        for (String keyword : keywords) {
            int index = text.indexOf(keyword);
            if (index >= 0 && (best < 0 || index < best)) {
                best = index;
            }
        }
        return best;
    }

    // ---- 各部门下发报表情况 ----

    private Map<String, Object> buildIssueStats(AuthUser user) {
        List<Map<String, Object>> groups = assignmentMapper.statsByIssuerDepartment(user.getCompanyId(), user.getRole());
        if (groups.isEmpty()) {
            return result("当前范围内还没有下发任务记录，暂无法统计各部门下发情况。", null, null,
                    "统计范围：您权限可见的全部下发任务 ｜ 按下发部门分组");
        }

        List<String> columns = List.of("部门", "下发任务数", "涉及模板", "覆盖机构",
                "填报中", "审核中", "待签收", "已签收", "已退回", "已撤回");
        List<List<String>> rows = new ArrayList<>();
        long totalAll = 0;
        long receivedAll = 0;
        long fillingAll = 0;
        long reviewingAll = 0;
        long pendingAll = 0;
        long rejectedAll = 0;
        long recalledAll = 0;
        for (Map<String, Object> g : groups) {
            long total = num(g.get("total"));
            long received = num(g.get("received"));
            totalAll += total;
            receivedAll += received;
            fillingAll += num(g.get("filling"));
            reviewingAll += num(g.get("reviewing"));
            pendingAll += num(g.get("pendingReceipt"));
            rejectedAll += num(g.get("rejected"));
            recalledAll += num(g.get("recalled"));
            rows.add(List.of(
                    str(g.get("groupName")),
                    String.valueOf(total),
                    String.valueOf(num(g.get("templates"))),
                    String.valueOf(num(g.get("companies"))),
                    String.valueOf(num(g.get("filling"))),
                    String.valueOf(num(g.get("reviewing"))),
                    String.valueOf(num(g.get("pendingReceipt"))),
                    String.valueOf(received),
                    String.valueOf(num(g.get("rejected"))),
                    String.valueOf(num(g.get("recalled")))
            ));
        }

        Map<String, Object> top = groups.get(0);
        String answer = String.format(
                "共统计 %d 个下发部门，累计下发任务 %d 项：填报中 %d、审核中 %d、待签收 %d、已签收 %d、已退回 %d、已撤回 %d。"
                        + "下发最多的是「%s」（%d 项，覆盖 %d 家机构，已签收 %d 项）。",
                groups.size(), totalAll, fillingAll, reviewingAll, pendingAll, receivedAll, rejectedAll, recalledAll,
                str(top.get("groupName")), num(top.get("total")), num(top.get("companies")), num(top.get("received")));

        Map<String, Object> chart = chart("各部门下发任务数", groups, "下发任务数");
        return result(answer, chart, table(columns, rows),
                "统计范围：您权限可见的全部下发任务 ｜ 按下发部门分组 ｜ 填报中含尚未开填任务；待签收含已审批待签收；已签收含已汇总；已退回含审批驳回与签收退回");
    }

    // ---- 各机构填报情况 ----

    private Map<String, Object> buildFillStats(AuthUser user) {
        List<Map<String, Object>> groups = assignmentMapper.statsByAssignedCompany(user.getCompanyId(), user.getRole());
        if (groups.isEmpty()) {
            return result("当前范围内还没有待填报的下发任务（不含已撤回），暂无法统计各机构填报情况。", null, null,
                    "统计范围：您权限可见的下发任务（不含已撤回） ｜ 按填报机构分组");
        }

        List<String> columns = List.of("机构", "任务数", "填报中", "审核中", "待签收", "已签收", "已退回", "完成率");
        List<List<String>> rows = new ArrayList<>();
        long totalAll = 0;
        long receivedAll = 0;
        long fillingAll = 0;
        long reviewingAll = 0;
        long pendingAll = 0;
        long rejectedAll = 0;
        // 完成率最高/最低的机构（任务数相同按出现顺序，先高后低各取其一）
        Map<String, Object> best = null;
        Map<String, Object> worst = null;
        for (Map<String, Object> g : groups) {
            long total = num(g.get("total"));
            long received = num(g.get("received"));
            totalAll += total;
            receivedAll += received;
            fillingAll += num(g.get("filling"));
            reviewingAll += num(g.get("reviewing"));
            pendingAll += num(g.get("pendingReceipt"));
            rejectedAll += num(g.get("rejected"));
            rows.add(List.of(
                    str(g.get("groupName")),
                    String.valueOf(total),
                    String.valueOf(num(g.get("filling"))),
                    String.valueOf(num(g.get("reviewing"))),
                    String.valueOf(num(g.get("pendingReceipt"))),
                    String.valueOf(received),
                    String.valueOf(num(g.get("rejected"))),
                    percent(received, total)
            ));
            if (best == null || rate(received, total) > rate(num(best.get("received")), num(best.get("total")))) {
                best = g;
            }
            if (worst == null || rate(received, total) < rate(num(worst.get("received")), num(worst.get("total")))) {
                worst = g;
            }
        }

        StringBuilder answer = new StringBuilder(String.format(
                "共统计 %d 家填报机构，任务总数 %d 项（不含已撤回），整体完成率 %s（已签收 %d 项）。",
                groups.size(), totalAll, percent(receivedAll, totalAll), receivedAll));
        if (best != null) {
            answer.append(String.format("完成率最高的是「%s」（%s）；",
                    str(best.get("groupName")), percent(num(best.get("received")), num(best.get("total")))));
        }
        if (worst != null && worst != best) {
            answer.append(String.format("「%s」相对滞后（%s）。",
                    str(worst.get("groupName")), percent(num(worst.get("received")), num(worst.get("total")))));
        }
        answer.append(String.format("其余状态分布：填报中 %d、审核中 %d、待签收 %d、已退回 %d。",
                fillingAll, reviewingAll, pendingAll, rejectedAll));

        Map<String, Object> chart = chart("各机构填报任务数", groups, "任务数");
        return result(answer.toString(), chart, table(columns, rows),
                "统计范围：您权限可见的下发任务（不含已撤回） ｜ 按填报机构分组 ｜ 完成率 = 已签收（含已汇总）÷ 任务数 ｜ 填报中含尚未开填任务");
    }

    // ---- 组装 ----

    /** 柱状图：任务数 vs 已签收 双系列，分类过多时只取前若干（表格仍展示全量） */
    private Map<String, Object> chart(String title, List<Map<String, Object>> groups, String totalSeriesName) {
        List<Map<String, Object>> limited = groups.size() > MAX_CHART_CATEGORIES
                ? groups.subList(0, MAX_CHART_CATEGORIES)
                : groups;
        List<String> categories = new ArrayList<>();
        List<Double> totals = new ArrayList<>();
        List<Double> receiveds = new ArrayList<>();
        for (Map<String, Object> g : limited) {
            categories.add(str(g.get("groupName")));
            totals.add((double) num(g.get("total")));
            receiveds.add((double) num(g.get("received")));
        }
        List<Map<String, Object>> series = new ArrayList<>();
        series.add(Map.of("name", totalSeriesName, "data", totals));
        series.add(Map.of("name", "已签收", "data", receiveds));
        Map<String, Object> chart = new LinkedHashMap<>();
        chart.put("type", "bar");
        chart.put("title", title);
        chart.put("categories", categories);
        chart.put("series", series);
        return chart;
    }

    private Map<String, Object> table(List<String> columns, List<List<String>> rows) {
        Map<String, Object> table = new LinkedHashMap<>();
        table.put("columns", columns);
        table.put("rows", rows);
        return table;
    }

    /** 与智能问数主流程一致的返回结构；运营统计无模板查询计划，plan 恒为 null */
    private Map<String, Object> result(String answer, Map<String, Object> chart,
                                       Map<String, Object> table, String scopeNote) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", answer);
        result.put("plan", null);
        result.put("chart", chart);
        result.put("table", table);
        result.put("scope_note", scopeNote);
        return result;
    }

    private boolean containsAny(String text, String... keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private double rate(long received, long total) {
        return total <= 0 ? 0 : (double) received / total;
    }

    /** 完成率：整数百分比不带小数，否则保留一位 */
    private String percent(long received, long total) {
        double pct = rate(received, total) * 100;
        if (pct == Math.rint(pct)) {
            return String.format(Locale.ROOT, "%d%%", (long) pct);
        }
        return String.format(Locale.ROOT, "%.1f%%", pct);
    }

    /** MySQL SUM 返回 BigDecimal、COUNT 返回 Long，统一转 long */
    private long num(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : 0;
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
