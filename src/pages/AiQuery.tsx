import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Sparkles, Send, AlertCircle, BarChart3, Grid3x3, ChevronDown, Download } from '../components/icons';
import { api, getStoredUser } from '../services/api';
import { getClientAccess } from '../utils/access';
import { toast } from '../utils/toast';
import {
  AI_QUESTION_MAX_LENGTH,
  AiChart,
  AiMessage,
  AiTable,
  buildRequestHistory,
  buildSuggestedQuestions,
  getChartSeriesNames,
  normalizeChartData,
  shouldRenderChart,
  validateQuestion,
} from '../utils/aiQuery';
import { ReportAssignment, ReportTemplate } from '../types';

/** 图表配色：沿用系统的低饱和色板，保证多系列可辨识且不刺眼 */
const SERIES_COLORS = ['#3B6E8F', '#7A9E7E', '#C08A5A', '#8E7CA8', '#B4676A', '#5E8C8A'];

const axisStyle = { fontSize: 11, fill: '#6B6B6B' } as const;

/** 图表区：按后端给定的 chart_type 渲染柱状/折线/饼图 */
const ChartBlock: React.FC<{ chart: AiChart }> = ({ chart }) => {
  const data = useMemo(() => normalizeChartData(chart), [chart]);
  const seriesNames = useMemo(() => getChartSeriesNames(chart), [chart]);

  if (chart.type === 'pie') {
    const key = seriesNames[0];
    const pieData = data
      .map((d) => ({ name: String(d.category), value: Number(d[key] || 0) }))
      .filter((d) => d.value > 0);
    if (pieData.length === 0) {
      return <div className="text-[12px] text-mute">当期数据为空，暂无可展示的占比图。</div>;
    }
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={100} label={(e: any) => e.name}>
            {pieData.map((_, idx) => (
              <Cell key={idx} fill={SERIES_COLORS[idx % SERIES_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: any) => Number(v).toLocaleString()} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--hairline)" vertical={false} />
          <XAxis dataKey="category" tick={axisStyle} />
          <YAxis tick={axisStyle} width={64} />
          <Tooltip formatter={(v: any) => Number(v).toLocaleString()} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {seriesNames.map((name, idx) => (
            <Line key={name} type="monotone" dataKey={name} stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
              strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--hairline)" vertical={false} />
        <XAxis dataKey="category" tick={axisStyle} interval={0} angle={data.length > 6 ? -20 : 0}
          textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 56 : 30} />
        <YAxis tick={axisStyle} width={64} />
        <Tooltip formatter={(v: any) => Number(v).toLocaleString()} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {seriesNames.map((name, idx) => (
          <Bar key={name} dataKey={name} fill={SERIES_COLORS[idx % SERIES_COLORS.length]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

/** 数据表格：默认折叠，供用户核对明细口径 */
const TableBlock: React.FC<{ table: AiTable }> = ({ table }) => {
  const [open, setOpen] = useState(false);
  if (!table.rows || table.rows.length === 0) {
    return null;
  }
  return (
    <div className="rounded-[10px] bg-canvas overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-[12px] font-semibold text-ink hover:bg-line transition-colors">
        <span className="flex items-center gap-1.5">
          <Grid3x3 className="w-3.5 h-3.5 text-mute" />
          数据明细（{table.rows.length} 行）
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-mute transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="overflow-x-auto bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-canvas text-mute text-[11px] font-semibold">
                {table.columns.map((c) => (
                  <th key={c} className="p-2.5 text-left whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rIdx) => (
                <tr key={rIdx} style={{ borderTop: '1px solid var(--hairline)' }}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}
                      className={`p-2.5 whitespace-nowrap ${cIdx === 0 ? 'font-semibold text-ink' : 'text-body tabular-nums'}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/** 导出问数结果为 Excel：Sheet1 查询说明，Sheet2 数据表格，Sheet3 图表数据 */
async function downloadQueryResult(question: string, msg: AiMessage) {
  const res = msg.response;
  if (!res) return;
  const { utils, writeFile } = await import('xlsx');
  const wb = utils.book_new();

  // Sheet 1: 查询说明
  const metaRows: string[][] = [
    ['提问', question],
    ['结论', res.answer],
  ];
  if (res.scope_note) metaRows.push(['统计口径', res.scope_note]);
  if (res.plan) {
    metaRows.push(['报表', res.plan.template_name]);
    metaRows.push(['周期', res.plan.period_labels.join('、')]);
    metaRows.push(['指标', res.plan.metrics.map((m) => m.field_label).join('、')]);
    if (res.plan.group_by_field_label) {
      metaRows.push(['分组', res.plan.group_by_field_label]);
    }
    if (res.plan.company_names && res.plan.company_names.length > 0) {
      metaRows.push(['机构', res.plan.company_names.join('、')]);
    }
  }
  metaRows.push(['导出时间', new Date().toLocaleString('zh-CN')]);
  const wsMeta = utils.aoa_to_sheet(metaRows);
  wsMeta['!cols'] = [{ wch: 12 }, { wch: 80 }];
  utils.book_append_sheet(wb, wsMeta, '查询说明');

  // Sheet 2: 数据表格
  if (res.table && res.table.columns.length > 0 && res.table.rows.length > 0) {
    const wsData = utils.aoa_to_sheet([res.table.columns, ...res.table.rows]);
    wsData['!cols'] = res.table.columns.map((_, i) => ({
      wch: Math.max(10, ...[res.table!.columns[i], ...res.table!.rows.map((r) => r[i] || '')].map((s) => s.length)) + 4,
    }));
    utils.book_append_sheet(wb, wsData, '查询数据');
  }

  // Sheet 3: 图表数据（categories × series 转为表格）
  if (res.chart && res.chart.categories.length > 0 && res.chart.series.length > 0) {
    const chartHeader = ['分类', ...res.chart.series.map((s) => s.name)];
    const chartRows = res.chart.categories.map((cat, i) => [
      cat,
      ...res.chart!.series.map((s) => s.data[i] ?? ''),
    ]);
    const wsChart = utils.aoa_to_sheet([chartHeader, ...chartRows]);
    wsChart['!cols'] = chartHeader.map((_, i) => ({
      wch: i === 0
        ? Math.max(10, ...chartRows.map((r) => String(r[0]).length)) + 4
        : 14,
    }));
    const chartSheetName = res.chart.title.length > 20 ? '图表数据' : res.chart.title;
    utils.book_append_sheet(wb, wsChart, chartSheetName);
  }

  const safeName = (res.plan?.template_name || '问数结果').replace(/[\\/?*[\]:]/g, '-');
  writeFile(wb, `${safeName}_问数结果.xlsx`);
}

export const AiQuery: React.FC = () => {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    (async () => {
      try {
        const config = await api.getAiConfig();
        setAiEnabled(config.enabled);
      } catch {
        setAiEnabled(false);
      }
      // 超管与数智化办公室仅限运营统计（各部门下发/各分公司填报情况）：建议问题只给固定引导
      const storedUser = getStoredUser();
      const access = storedUser ? getClientAccess(storedUser) : null;
      if (access && (access.isSuperAdmin || access.isDigitalAdmin)) {
        setSuggestions(['各部门下发报表的情况', '各分公司填报情况分析']);
        return;
      }
      try {
        const [templates, assignments] = await Promise.all([api.getTemplates(), api.getAssignments()]);
        setSuggestions(buildSuggestedQuestions(templates as ReportTemplate[], groupPeriods(assignments as ReportAssignment[])));
      } catch {
        // 建议问题缺失不影响提问
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const send = useCallback(async (question: string) => {
    const check = validateQuestion(question);
    if (!check.valid) {
      toast(check.error || '问题不合法', 'error');
      return;
    }
    const trimmed = question.trim();
    const history = buildRequestHistory(messages);
    const msgId = `m${nextId.current++}`;
    setMessages((prev) => [...prev,
      { id: `m${nextId.current++}`, role: 'user', content: trimmed },
      { id: msgId, role: 'assistant', content: '', statusText: '正在连接...' },
    ]);
    setInput('');
    setLoading(true);

    try {
      await api.aiQueryStream(trimmed, (type, data) => {
        setMessages((prev) => prev.map((m) => {
          if (m.id !== msgId) return m;
          const res = m.response || {};
          switch (type) {
            case 'status':
              return { ...m, statusText: data };
            case 'text_only': {
              const parsed = JSON.parse(data);
              return { ...m, content: parsed.answer || '', response: { ...res, ...parsed }, statusText: undefined };
            }
            case 'plan':
              return { ...m, response: { ...res, plan: JSON.parse(data) }, statusText: undefined };
            case 'chart':
              return { ...m, response: { ...res, chart: JSON.parse(data) }, statusText: undefined };
            case 'table':
              return { ...m, response: { ...res, table: JSON.parse(data) }, statusText: undefined };
            case 'answer_delta':
              return { ...m, content: m.content + data, statusText: undefined };
            case 'scope_note':
              return { ...m, response: { ...res, scope_note: data }, statusText: undefined };
            case 'done':
              return { ...m, statusText: undefined };
            case 'error': {
              let msg = '智能问数失败，请稍后重试';
              try { const j = JSON.parse(data); if (j.error) msg = j.error; } catch { /* ignore */ }
              return { ...m, role: 'error' as const, content: msg, statusText: undefined };
            }
            default:
              return m;
          }
        }));
      }, history);
    } catch (e: any) {
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, role: 'error' as const, content: e?.message || '智能问数失败，请稍后重试', statusText: undefined } : m
      ));
    } finally {
      setLoading(false);
    }
  }, [messages]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading) send(input);
    }
  };

  return (
    <div className="reveal max-w-[1280px] mx-auto px-4 sm:px-[22px] py-[clamp(16px,3vw,28px)] space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-white rounded-[12px] p-4 sm:p-6" style={{ boxShadow: 'var(--sh-panel)' }}>
        <h1 className="t-serif text-[26px] sm:text-[32px] text-ink flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-ink shrink-0" />
          <span>智能问数</span>
        </h1>
        <p className="text-[12px] sm:text-[13px] text-mute mt-1.5 leading-relaxed">
          用日常说法提问即可查询您管理的报表数据，系统会自动定位报表、周期与指标，并生成结论与图表。仅统计已提交并通过接收的数据。
        </p>
      </div>

      {aiEnabled === false && (
        <div className="rounded-[12px] px-4 py-3 text-[13px]" style={{ background: '#FDEBEC', color: '#9F2F2D' }}>
          <span className="font-semibold">智能问数未配置：</span>
          请在后端配置 AI_BASE_URL / AI_API_KEY / AI_MODEL 后重启服务。
        </div>
      )}

      {/* Conversation */}
      <div className="bg-white rounded-[12px] p-4 sm:p-6 space-y-4" style={{ boxShadow: 'var(--sh-panel)' }}>
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="text-[13px] text-mute">可以这样问：</div>
            <div className="flex flex-wrap gap-2">
              {(suggestions.length > 0 ? suggestions : ['各机构本期数据对比', '最近几期的趋势变化']).map((s) => (
                <button key={s} onClick={() => send(s)} disabled={loading}
                  className="px-3.5 py-2 rounded-full bg-canvas hover:bg-line text-[12px] font-medium text-ink transition-colors disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, mIdx) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] px-3.5 py-2.5 rounded-[12px] bg-ink text-white text-[13px] leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            );
          }
          if (m.role === 'error') {
            return (
              <div key={m.id} className="flex items-start gap-2 px-3.5 py-2.5 rounded-[12px] text-[13px]"
                style={{ background: '#FDEBEC', color: '#9F2F2D' }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{m.content}</span>
              </div>
            );
          }
          const res = m.response;
          return (
            <div key={m.id} className="space-y-3 rounded-[12px] bg-canvas p-3.5 sm:p-4">
              {/* 流式状态指示器：仅在有 statusText 且无内容时显示 */}
              {m.statusText && !m.content && !res?.chart && !res?.table && (
                <div className="flex items-center gap-2 text-[13px] text-mute">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-line border-t-ink animate-spin" />
                  {m.statusText}
                </div>
              )}
              {m.content && (
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-mute shrink-0 mt-0.5" />
                  <div className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">
                    {m.content}
                    {/* 流式打字光标：当 statusText 为 undefined 但 loading 且这是最后一条消息时显示 */}
                    {loading && !m.statusText && mIdx === messages.length - 1 && m.role === 'assistant' && (
                      <span className="inline-block w-[2px] h-[14px] bg-ink ml-0.5 align-middle animate-pulse" />
                    )}
                  </div>
                </div>
              )}
              {/* 流式阶段的状态文本（内容与数据已部分到达） */}
              {m.statusText && (m.content || res?.chart || res?.table) && (
                <div className="flex items-center gap-2 text-[12px] text-mute">
                  <span className="w-3 h-3 rounded-full border-2 border-line border-t-ink animate-spin" />
                  {m.statusText}
                </div>
              )}
              {res?.chart && shouldRenderChart(res.chart) && (
                <div className="bg-white rounded-[10px] p-3">
                  <div className="text-[12px] font-semibold text-ink flex items-center gap-1.5 mb-2">
                    <BarChart3 className="w-3.5 h-3.5 text-mute" />
                    {res.chart.title}
                  </div>
                  <ChartBlock chart={res.chart} />
                </div>
              )}
              {res?.table && <TableBlock table={res.table} />}
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-faint leading-relaxed flex-1">{res?.scope_note || ''}</div>
                {((res?.table && res.table.rows.length > 0) || (res?.chart && res.chart.categories.length > 0)) && (
                  <button
                    onClick={() => {
                      const userQ = mIdx > 0 && messages[mIdx - 1]?.role === 'user'
                        ? messages[mIdx - 1].content : '';
                      downloadQueryResult(userQ, m);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white text-[11px] font-semibold text-ink hover:bg-line transition-colors shrink-0"
                    style={{ boxShadow: 'var(--sh-card)' }}
                    title="下载查询结果">
                    <Download className="w-3.5 h-3.5" />
                    下载
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* loading 指示器仅在无正在流式输出的 assistant 消息时显示 */}
        {loading && !messages.some((m) => m.role === 'assistant' && m.statusText !== undefined && m.id === messages[messages.length - 1]?.id) &&
          messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-center gap-2 text-[13px] text-mute">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-line border-t-ink animate-spin" />
            正在分析数据...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="bg-white rounded-[12px] p-3 sm:p-4 flex items-end gap-2" style={{ boxShadow: 'var(--sh-panel)' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={AI_QUESTION_MAX_LENGTH}
          placeholder="例如：2026年07月各机构的总收入是多少？（Enter 发送，Shift+Enter 换行）"
          className="flex-1 resize-none px-3.5 py-2.5 bg-canvas rounded-[10px] text-[13px] text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white"
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          className="h-10 px-4 sm:px-5 bg-ink hover:bg-inkhover text-white text-[13px] font-semibold rounded-md transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40">
          <Send className="w-4 h-4" />
          <span>发送</span>
        </button>
      </div>
    </div>
  );
};

/** 按模板归集已有周期（倒序），用于生成更贴合数据的建议问题 */
function groupPeriods(assignments: ReportAssignment[]): Record<number, string[]> {
  const map: Record<number, string[]> = {};
  (assignments || []).forEach((a) => {
    if (!a.period_label) return;
    const list = map[a.template_id] || (map[a.template_id] = []);
    if (!list.includes(a.period_label)) list.push(a.period_label);
  });
  Object.values(map).forEach((list) => list.sort().reverse());
  return map;
}
