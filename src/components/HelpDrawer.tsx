import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  BookOpen,
  Shield,
  Workflow,
  FileSpreadsheet,
  Grid3x3,
  Zap,
  ChevronDown,
  Send,
} from './icons';
import { UserInfo } from '../types';
import { api } from '../services/api';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
  user: UserInfo | null;
}

interface DataRegionGuide {
  name: string;
  tag: string;
  rows: Array<{ label: string; desc: string }>;
}

/**
 * 模版制定说明：三种数据区域的概念、填报效果、汇总效果与举例
 */
const DATA_REGION_GUIDES: DataRegionGuide[] = [
  {
    name: '汇总指标',
    tag: '每机构每期一个值',
    rows: [
      { label: '适用场景', desc: '公司级关键指标，如总收入、净利润、填报基准日、盘点结论' },
      { label: '填报效果', desc: '经办人在「汇总指标数据」区块逐项填写，每项仅一个值' },
      { label: '汇总效果', desc: '数字型指标在「汇总报表」自动加总并生成各机构对比' },
      { label: '举例', desc: '「总收入（万元）」设为数字型汇总指标；「盘点结论」设为下拉型汇总指标' },
    ],
  },
  {
    name: '明细行',
    tag: '可添加任意多行',
    rows: [
      { label: '适用场景', desc: '清单 / 台账类数据，如产品明细、资产明细、问题清单' },
      { label: '填报效果', desc: '经办人点击「添加一行」逐条录入，行数不限' },
      { label: '汇总效果', desc: '数字列按机构自动合计，明细可在「汇总报表 → 明细数据」穿透查看' },
      { label: '举例', desc: '「产品明细」= 产品名称（文本）+ 销量（数字）+ 销售额（数字）+ 渠道（下拉）' },
    ],
  },
  {
    name: '二维交叉表',
    tag: '行维度 × 列指标',
    rows: [
      { label: '适用场景', desc: '按固定维度拆解指标，行与列的结构完全由模板预定义' },
      { label: '填报效果', desc: '经办人在交叉单元格中直接填写，行列不可增删' },
      { label: '汇总效果', desc: '数字列自动参与汇总统计，空白单元格视为未填报' },
      { label: '举例', desc: '行「销售区域」（华东 / 华北 / 华南）× 列「销售额」「同比增长率」（均为数字）' },
    ],
  },
];

/** 创建字段的三种方式（模版编辑器右上角入口） */
const FIELD_CREATION_WAYS: Array<{ name: string; desc: string }> = [
  { name: '新增模版字段', desc: '逐个创建字段（默认作为明细行），把控件类型、显示名称、唯一标识与必填规则' },
  { name: '导入Excel', desc: '智能识别真实表格：自动跳过标题/注释/落款行并定位表头（识别不准可手动选择表头行），自动判定明细表/汇总指标表/交叉表格式（普通表格也可强制按交叉表导入，首列作行维度），推断字段类型并提取下拉选项' },
  { name: '创建交叉表', desc: '填写行维度标签与行选项（每行一个），再为每列指定列标签与控件类型' },
];

/** 完整模版设计示例 */
const TEMPLATE_DESIGN_EXAMPLES: Array<{ name: string; period: string; structure: string; points: string[] }> = [
  {
    name: '月度销售与经营报表',
    period: '月报',
    structure: '5 项汇总指标 + 4 列明细行',
    points: [
      '汇总指标：总收入、净利润（数字，自动加总）、在册员工数（数字）、填报基准日（日期）、经营情况说明（多行文本）',
      '明细行：产品名称（文本）、销量（数字）、销售额（数字）、销售渠道（下拉：直销 / 代理商 / 线上平台 / 大客户）',
      '效果：汇总报表自动对比各公司收入与利润，并可逐条穿透产品明细',
    ],
  },
  {
    name: '区域经营交叉表',
    period: '季报',
    structure: '1 张交叉表（4 行 × 2 列）',
    points: [
      '行维度「销售区域」：华东 / 华北 / 华南 / 西南（创建时行选项每行填写一个）',
      '列指标：销售额（数字）、订单数（数字），每一列即一个交叉表列字段',
      '效果：经办人在 4×2 的单元格矩阵中直接填写，数字列自动汇总',
    ],
  },
];

/** 模版设计规则 */
const TEMPLATE_DESIGN_RULES: string[] = [
  '字段唯一标识（Key）在模板内必须唯一，留空时系统按控件类型自动生成',
  '数字型字段自动参与汇总统计；文本、日期、下拉仅作展示不合计',
  '下拉单选的预设选项用逗号分隔（如：正常, 待维修, 报废）',
  '新增字段时可勾选「标记为敏感字段」，敏感字段不会暴露给智能问数，适用于包含个人隐私、商业秘密的数据',
  '模板头部的「智能问数 · 开/关」徽章可控制整个模板是否对 AI 查询可见',
  '模板未下发前（设计阶段）可自由修改、删除字段；一经下发遵循「只增不减」规范：字段不可物理删除，仅可停用，停用后历史数据完整保留、新填报不再要求',
  '草稿与已发布状态可继续追加字段；待审批、已停用状态的字段配置为只读',
  '汇总指标、明细行、交叉表可在同一模板中混合搭配',
];

const FIELD_TYPE_LEGEND: Array<{ label: string; desc: string }> = [
  { label: '数字', desc: '仅接受数值，自动参与汇总统计' },
  { label: '日期', desc: '点击输入框选择日期' },
  { label: '下拉选择', desc: '从预设选项中任选其一' },
  { label: '多行文本', desc: '填写较长的文字说明' },
  { label: '二维交叉表', desc: '在行 × 列交叉单元格中填写' },
];

/** AI 智能问答知识库 */
const AI_QA_KNOWLEDGE_BASE: Array<{ q: string; a: string }> = [
  {
    q: '如何创建报表模板？',
    a: '进入「模板管理」→ 点击「新建模板」→ 填写模板的名称、周期类型、说明 → 在字段设计页通过「新增模版字段」「导入Excel」或「创建交叉表」添加字段 → 完成后点击「提交审批」，数智化转型办公室审批通过后即可下发。',
  },
  {
    q: '如何下发报表任务？',
    a: '进入「下发管理」→ 选择已发布的模板 → 指定目标分公司、周期与截止日期 → 点击「下发」。支持「一次性下发」用于补充调查场景（不受周期去重约束）。也可在「周期计划」中配置自动下发，系统每日按设定时间自动生成任务。',
  },
  {
    q: '如何填报报表？',
    a: '进入「报表填报」→ 查看收到的下发任务 → 点击进入填报页 → 填写汇总指标、明细行或交叉表数据 → 点击「提交」。支持「导入Excel」批量导入明细数据，系统会自动跳过标题/说明/落款行并定位表头，数字、日期与下拉值自动规范化。',
  },
  {
    q: '审批流程是怎样的？',
    a: '三级审批：① 经办人填报提交 → ② 复核人审核（通过或退回）→ ③ 审批人终审（通过或退回）→ ④ 发起部门签收确认。退回后经办人可修改重提，流程从头开始。',
  },
  {
    q: '模板审批流程是怎样的？',
    a: '四步：① 部门报表管理员创建模板（草稿）→ ② 点击「提交审批」（待审批，锁定编辑）→ ③ 数智化转型办公室审批（通过或驳回）→ ④ 通过后自动发布，可下发；驳回退回草稿可修改重提。',
  },
  {
    q: '如何使用智能问数？',
    a: '进入「智能问数」→ 用日常说法提问（如「北京分公司上月的裸车价是多少」）→ 系统自动定位报表、周期与指标 → 生成文字结论、图表和数据明细。支持多轮对话，点击「下载」可导出 Excel。敏感字段和关闭了智能问数开关的模板不会出现在查询结果中。',
  },
  {
    q: '智能问数可以查询哪些数据？',
    a: '部门报表管理员可查询本部门模板的具体报表数据；超级管理员与数智化转型办公室仅限运营统计（如「各部门下发报表的情况」「各分公司填报情况分析」），不可查询具体报表数值。标记为「敏感」的字段和关闭了「智能问数」开关的模板会被自动排除。',
  },
  {
    q: '如何设置敏感字段？',
    a: '两种方式：① 新增字段时勾选「标记为敏感字段」；② 在字段设计页的字段卡片上点击「标记敏感」按钮。敏感字段不会出现在智能问数的上下文中，也无法被 LLM 选中为查询指标，适用于包含个人隐私、商业秘密等不宜公开查询的数据。',
  },
  {
    q: '如何开关模板的智能问数功能？',
    a: '在模板设计页的头部区域，点击「智能问数 · 开/关」徽章即可切换。关闭后该模板的所有字段都不会出现在智能问数中，但不影响模板的正常填报和汇总功能。',
  },
  {
    q: '如何导出报表数据？',
    a: '两种导出：① 汇总报表页点击「导出 Excel」，生成机构对比、明细、进度三张表；② 智能问数结果点击「下载」，生成查询说明、数据表格、图表数据三张表。填报页面也支持导出当前任务的填报数据。',
  },
  {
    q: '如何处理被退回的报表？',
    a: '工作台顶部会出现红色「退回提醒」，左侧导航菜单显示红色角标 → 进入原任务页面 → 查看退回原因 → 修改数据 → 重新提交即可消除提醒。',
  },
  {
    q: '如何配置模板自动下发？',
    a: '进入「模板管理」→ 找到目标模板 → 点击「周期计划」→ 配置下发时间、目标分公司 → 保存。模板审批发布后，系统每日按设定时间自动向目标分公司生成本期任务。也可在弹窗中「立即执行一次」手动触发补发。',
  },
  {
    q: '如何查看汇总报表？',
    a: '进入「汇总报表」→ 选择模板 → 查看多机构对比、明细数据与填报进度。数字型指标自动加总对比，明细可逐条穿透查看。仅统计已审批通过的填报数据。',
  },
  {
    q: '如何强制收回已下发的任务？',
    a: '在「下发管理」列表中找到未汇总的任务 → 点击「收回」→ 填写收回原因 → 确认。收回后任务终止，相关审批记录自动取消。已汇总的任务不可收回。',
  },
  {
    q: '模板字段可以删除吗？',
    a: '模板未下发前（设计阶段）可自由修改、删除字段；一经下发遵循「只增不减」规范：字段不可物理删除，仅可停用。停用后历史数据完整保留，新填报不再要求填写。',
  },
  {
    q: '如何批量导入历史数据？',
    a: '进入「模板管理」→ 点击「数据导入」→ 选择「历史归档」或「期初预填」→ 上传 Excel。「历史归档」直接成为已签收数据并计入汇总；「期初预填」为已下发任务生成草稿，由分公司经办人核对后提交。',
  },
  {
    q: '各角色的权限是什么？',
    a: '超级管理员：全局只读视图，可管理机构与用户，智能问数仅限运营统计；部门报表管理员：设计模板、下发任务、签收报表、查看汇总、智能问数（限本部门）；数智化转型办公室：审批模板，可查看所有模板，智能问数仅限运营统计；分公司经办人：填写并提交报表；复核人/审批人：审批操作（不可填报）。',
  },
];

/** 可折叠的帮助区块 */
const HelpSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ icon, title, open, onToggle, children }) => (
  <section>
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 text-[14px] font-semibold text-ink mb-2.5 group"
    >
      <span className="flex items-center gap-2">
        {icon}
        <span>{title}</span>
      </span>
      <ChevronDown
        className={`w-3.5 h-3.5 text-mute transition-transform duration-200 group-hover:text-ink ${open ? 'rotate-180' : ''}`}
      />
    </button>
    {open && children}
  </section>
);

/** AI 智能问答的可折叠问答对 */
const AiQaItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{ border: '1px solid var(--hairline)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left bg-canvas hover:bg-line transition-colors"
      >
        <span className="text-[12px] font-semibold text-ink leading-[1.5]">{question}</span>
        <ChevronDown
          className={`w-3 h-3 text-mute shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3.5 py-2.5 text-[12px] text-mute leading-[1.7] bg-white">
          {answer}
        </div>
      )}
    </div>
  );
};

export const HelpDrawer: React.FC<HelpDrawerProps> = ({ open, onClose, user }) => {
  const isHQ = user?.role === 'department_report_admin' || user?.role === 'super_admin';
  const isDigitalAdmin = user?.role === 'digital_admin';

  // 默认展开与当前角色相关的操作指南，其余折叠
  const defaultOpen = isHQ ? 'hq' : isDigitalAdmin ? 'digital' : 'branch';
  const [openSections, setOpenSections] = useState<Set<string>>(new Set([defaultOpen]));

  // AI 对话状态
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      // 手风琴模式：展开一个时自动收起其他
      if (prev.has(id)) {
        return new Set<string>();
      }
      return new Set<string>([id]);
    });
  };

  // 滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // 发送问题
  const handleChatSend = async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: question }]);
    setChatLoading(true);

    try {
      const res = await api.helpAiAsk(question, chatMessages);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.answer }]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '抱歉，智能帮助暂时不可用，请稍后再试。您也可以浏览下方的帮助文档找到答案。' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Scrim */}
      <div
        className="scrim-fade-in absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside
        className="drawer-slide-in absolute top-0 right-0 h-full w-full max-w-[440px] bg-white flex flex-col"
        style={{ boxShadow: 'var(--sh-overlay)' }}
        role="dialog"
        aria-label="系统使用指南"
      >
        {/* Header */}
        <div
          className="shrink-0 px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-ink tracking-[-0.01em]">
            <BookOpen className="w-5 h-5 text-ink" />
            <span>系统使用指南</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-mute hover:text-ink hover:bg-canvas transition-colors"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* AI 智能问答对话区 */}
          <div
            className="rounded-[12px] overflow-hidden"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <div className="px-4 py-3 bg-canvas flex items-center gap-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <Zap className="w-4 h-4 text-ink" />
              <span className="text-[13px] font-semibold text-ink">AI 智能帮助</span>
              <span className="text-[11px] text-mute ml-auto">输入问题，快速获得解答</span>
            </div>

            {/* 消息列表 */}
            <div className="px-4 py-3 space-y-3 min-h-[120px] max-h-[280px] overflow-y-auto bg-white">
              {chatMessages.length === 0 && (
                <div className="text-[12px] text-mute text-center py-4">
                  您好！我是智能帮助助手，可以回答关于系统使用的问题。<br />
                  试试问我：「如何创建模板？」「审批流程是什么？」
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-[12px] text-[12px] leading-[1.7] ${
                      msg.role === 'user'
                        ? 'bg-ink text-white rounded-br-sm'
                        : 'bg-canvas text-body rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-canvas px-3.5 py-2.5 rounded-[12px] rounded-bl-sm text-[12px] text-mute">
                    正在思考中...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 输入区 */}
            <div className="px-3 py-2.5 bg-canvas flex items-center gap-2" style={{ borderTop: '1px solid var(--hairline)' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
                placeholder="输入您的问题..."
                disabled={chatLoading}
                className="flex-1 px-3 py-2 bg-white border border-line rounded-[10px] text-[12px] text-ink placeholder:text-faint focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)] disabled:opacity-50"
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
                className="h-8 w-8 flex items-center justify-center rounded-[10px] bg-ink hover:bg-inkhover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* 角色与权限 */}
          <HelpSection icon={<Shield className="w-4 h-4 text-ink" />} title="角色与权限"
            open={openSections.has('roles')} onToggle={() => toggleSection('roles')}>
            <div className="space-y-2 text-[12px] leading-[1.7]">
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">超级管理员</span><span className="text-mute">全局只读视图，可管理机构与用户，不可填报或签收；智能问数仅限运营统计</span></div>
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">部门报表管理员</span><span className="text-mute">设计模板、下发任务、签收报表、查看汇总、智能问数（仅限本部门），可设置敏感字段与 AI 开关</span></div>
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">数智化转型办公室</span><span className="text-mute">审批各部门提交的报表模板；可查看所有部门模板；智能问数仅限运营统计</span></div>
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">分公司经办人</span><span className="text-mute">填写并提交报表数据</span></div>
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">复核人 / 审批人</span><span className="text-mute">查看填报信息，进行审批操作（不可填报）</span></div>
            </div>
          </HelpSection>

          {/* 三级审批流程 */}
          <HelpSection icon={<Workflow className="w-4 h-4 text-ink" />} title="三级审批流程"
            open={openSections.has('approval')} onToggle={() => toggleSection('approval')}>
            <div className="bg-canvas rounded-[12px] p-4 space-y-2 text-[12px]">
              {[
                { step: '1', label: '经办人填报', desc: '分公司经办人填写报表数据并提交' },
                { step: '2', label: '复核人审核', desc: '复核人检查数据准确性，通过或退回' },
                { step: '3', label: '审批人终审', desc: '审批人最终确认，通过后流转至发起部门' },
                { step: '4', label: '部门签收', desc: '发起部门确认接收已审批的报表' },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-ink text-white text-[10px] font-bold flex items-center justify-center tabular-nums">{s.step}</span>
                  <div>
                    <span className="font-semibold text-ink">{s.label}</span>
                    <span className="text-mute ml-2">{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-mute mt-2">退回的报表可修改后重新提交，流程从头开始</p>
          </HelpSection>

          {/* 模板审批流程 */}
          <HelpSection icon={<Shield className="w-4 h-4 text-ink" />} title="模板审批流程"
            open={openSections.has('template-approval')} onToggle={() => toggleSection('template-approval')}>
            <div className="bg-canvas rounded-[12px] p-4 space-y-2 text-[12px]">
              {[
                { step: '1', label: '创建模板', desc: '部门报表管理员设计模板，保存后为「草稿」状态' },
                { step: '2', label: '提交审批', desc: '在模板列表或字段设计页面点击「提交审批」，模板进入「待审批」并锁定编辑' },
                { step: '3', label: '数转办审批', desc: '数智化转型办公室在「审批中心」通过或驳回，可附审批意见' },
                { step: '4', label: '发布下发', desc: '审批通过后模板自动发布方可下发；驳回退回草稿可修改重提' },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-ink text-white text-[10px] font-bold flex items-center justify-center tabular-nums">{s.step}</span>
                  <div>
                    <span className="font-semibold text-ink">{s.label}</span>
                    <span className="text-mute ml-2">{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </HelpSection>

          {/* 总部/部门操作指南 */}
          {isHQ && (
            <HelpSection icon={<FileSpreadsheet className="w-4 h-4 text-ink" />} title="总部/部门操作指南"
              open={openSections.has('hq')} onToggle={() => toggleSection('hq')}>
              <div className="space-y-2.5 text-[12px] leading-[1.7]">
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">模板管理</div>
                  <div className="text-mute">在「模板管理」创建模板，支持文本、数字、日期、下拉、多行文本及二维交叉表字段。新模板为草稿，需提交数智化转型办公室审批发布后方可下发。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">下发任务</div>
                  <div className="text-mute">在「下发管理」选择已发布模板，指定目标分公司、周期与截止日期。支持「一次性下发」用于补充调查场景（不受周期去重约束）。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">强制收回</div>
                  <div className="text-mute">在「下发管理」列表中，对未汇总的任务可执行「收回」。收回后任务终止，审批记录自动取消，需填写收回原因。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">签收报表</div>
                  <div className="text-mute">在工作台「待签收任务」区块查看已审批的报表，确认后签收或退回。退回需填写原因。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">汇总报表</div>
                  <div className="text-mute">在「汇总报表」查看多机构对比、明细数据与填报进度，支持导出 Excel（含机构对比、明细、进度三张表）。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">智能问数</div>
                  <div className="text-mute">在「智能问数」用日常说法提问即可查询报表数据，系统自动定位报表、周期与指标，生成文字结论、图表和数据明细。支持多轮对话，点击「下载」可导出 Excel（含查询说明、数据表格、图表数据）。可在模板设计页头部切换「智能问数 · 开/关」。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">敏感字段与 AI 开关</div>
                  <div className="text-mute">新增字段时可勾选「标记为敏感字段」，或在字段卡片上点击「标记敏感」切换。敏感字段不会出现在智能问数中。模板头部的「智能问数 · 开/关」徽章可控制整个模板是否对 AI 可见。</div>
                </div>
              </div>
            </HelpSection>
          )}

          {/* 数智化转型办公室操作指南 */}
          {isDigitalAdmin && (
            <HelpSection icon={<FileSpreadsheet className="w-4 h-4 text-ink" />} title="数智化转型办公室操作指南"
              open={openSections.has('digital')} onToggle={() => toggleSection('digital')}>
              <div className="space-y-2.5 text-[12px] leading-[1.7]">
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">模板审批</div>
                  <div className="text-mute">在「审批中心」的「模板审批」标签页查看待审批模板（模板名、所属部门、提交人、提交时间），可填写审批意见后执行「通过」或「驳回」。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">审批结果</div>
                  <div className="text-mute">通过后模板自动发布，发起部门即可下发填报任务；驳回后模板退回草稿，部门修改后可重新提交审批。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">模板查看</div>
                  <div className="text-mute">在「模板管理」页面可查看所有部门的模板及其当前状态（草稿 / 待审批 / 已发布 / 已归档）。</div>
                </div>
              </div>
            </HelpSection>
          )}

          {/* 分公司操作指南 */}
          {!isHQ && !isDigitalAdmin && (
            <HelpSection icon={<FileSpreadsheet className="w-4 h-4 text-ink" />} title="分公司操作指南"
              open={openSections.has('branch')} onToggle={() => toggleSection('branch')}>
              <div className="space-y-2.5 text-[12px] leading-[1.7]">
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">报表填报</div>
                  <div className="text-mute">在「报表填报」查看收到的下发任务，点击进入填报。支持汇总指标和明细行填写，交叉表可编辑单元格。明细区「导入Excel」可直接导入真实表格：自动跳过标题/说明/落款行并定位表头，表头按字段标签模糊匹配，数字、日期与下拉值自动规范化。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">审批流程</div>
                  <div className="text-mute">经办人提交后，复核人和审批人依次在「审批中心」处理。可查看填报详情并附审批意见。退回后经办人可修改重提。</div>
                </div>
              </div>
            </HelpSection>
          )}

          {/* 模版制定说明 */}
          <HelpSection icon={<Grid3x3 className="w-4 h-4 text-ink" />} title="模版制定说明"
            open={openSections.has('template-design')} onToggle={() => toggleSection('template-design')}>
            <div className="space-y-3">
              {/* 三种数据区域 */}
              {DATA_REGION_GUIDES.map((region) => (
                <div
                  key={region.name}
                  className="rounded-[12px] overflow-hidden"
                  style={{ border: '1px solid var(--hairline)' }}
                >
                  <div className="px-4 py-2.5 bg-canvas flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{region.name}</span>
                    <span className="shrink-0 text-[10px] font-bold text-mute bg-line px-2 py-0.5 rounded-full">
                      {region.tag}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    {region.rows.map((row) => (
                      <div key={row.label} className="text-[12px] leading-[1.6] flex gap-2">
                        <span className="font-semibold text-body shrink-0 w-14">{row.label}</span>
                        <span className="text-mute">{row.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* 创建字段的三种方式 */}
              <div className="rounded-[12px] px-4 py-3 bg-canvas">
                <div className="text-[11px] font-semibold text-ink mb-1.5">创建字段的三种方式（模版编辑器右上角）</div>
                <div className="space-y-1.5">
                  {FIELD_CREATION_WAYS.map((w, i) => (
                    <div key={w.name} className="text-[12px] leading-[1.6] flex items-start gap-2">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-ink text-white text-[9px] font-bold flex items-center justify-center tabular-nums mt-[2px]">{i + 1}</span>
                      <span className="text-mute">
                        <span className="font-semibold text-body">{w.name}</span>：{w.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 完整设计示例 */}
              {TEMPLATE_DESIGN_EXAMPLES.map((ex) => (
                <div
                  key={ex.name}
                  className="rounded-[12px] overflow-hidden"
                  style={{ border: '1px solid var(--hairline)' }}
                >
                  <div className="px-4 py-2.5 bg-canvas flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">示例：{ex.name}</span>
                    <span className="shrink-0 text-[10px] font-bold text-mute bg-line px-2 py-0.5 rounded-full">
                      {ex.period}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[11px] font-semibold text-ink mb-1.5">{ex.structure}</div>
                    <ul className="space-y-1">
                      {ex.points.map((p) => (
                        <li key={p} className="text-[11px] text-mute leading-[1.6] flex gap-1.5">
                          <Zap className="w-3 h-3 text-faint shrink-0 mt-[3px]" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}

              {/* 字段类型图例 */}
              <div className="rounded-[12px] px-4 py-3 bg-canvas">
                <div className="text-[11px] font-semibold text-ink mb-1.5">字段类型说明</div>
                <div className="space-y-1">
                  {FIELD_TYPE_LEGEND.map((t) => (
                    <div key={t.label} className="text-[11px] leading-[1.6] flex gap-2">
                      <span className="font-semibold text-body shrink-0 w-14">{t.label}</span>
                      <span className="text-mute">{t.desc}</span>
                    </div>
                  ))}
                  <div className="text-[11px] leading-[1.6] flex gap-2">
                    <span className="font-semibold text-body shrink-0 w-14">必填标记</span>
                    <span className="text-mute">带 <span className="text-[#9F2F2D] font-bold">*</span> 为必填项，提交前必须填写完整</span>
                  </div>
                </div>
              </div>

              {/* 模版设计规则 */}
              <div className="rounded-[12px] px-4 py-3 bg-canvas">
                <div className="text-[11px] font-semibold text-ink mb-1.5">模版设计规则</div>
                <ul className="space-y-1 list-disc pl-4">
                  {TEMPLATE_DESIGN_RULES.map((r) => (
                    <li key={r} className="text-[11px] text-mute leading-[1.6]">{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </HelpSection>

          {/* AI 智能问答知识库 */}
          <HelpSection icon={<Zap className="w-4 h-4 text-ink" />} title="AI 智能问答"
            open={openSections.has('ai-qa')} onToggle={() => toggleSection('ai-qa')}>
            <div className="space-y-2">
              <p className="text-[11px] text-mute mb-2">点击问题查看答案，快速了解系统使用方法</p>
              {AI_QA_KNOWLEDGE_BASE.map((item, idx) => (
                <AiQaItem key={idx} question={item.q} answer={item.a} />
              ))}
            </div>
          </HelpSection>

          {/* 使用提示 */}
          <HelpSection icon={<Zap className="w-4 h-4 text-ink" />} title="使用提示"
            open={openSections.has('tips')} onToggle={() => toggleSection('tips')}>
            <ul className="space-y-1.5 text-[12px] text-mute leading-[1.7] list-disc pl-5">
              <li>模板字段设计完成后，可在字段设计页面直接点击「提交审批」，无需返回模板列表</li>
              <li>月报/季报/年报模板可在「模板管理 → 周期计划」配置自动下发：模板审批发布后，系统每日按设定时间自动向目标分公司生成本期任务，也可在弹窗中「立即执行一次」手动触发补发</li>
              <li>「模板管理 → 数据导入」支持按模板批量导入 Excel：「历史归档」直接成为已签收数据并计入汇总；「期初预填」为已下发任务生成草稿，由分公司经办人核对后提交</li>
              <li>填报被驳回/签收退回或模板被驳回时，工作台顶部会出现红色「退回提醒」，左侧导航对应菜单也会显示红色角标；修改后重新提交即可消除</li>
              <li>退回的报表可在原任务页面直接修改并重新提交</li>
              <li>填报、复核、审核与查看页面的汇总/明细/交叉表数据区均支持全屏展示：点击数据区右上角全屏按钮铺满屏幕（按 Esc 或再次点击退出），宽表数据可完整展开查看</li>
              <li>已签收的报表状态为「已签收」，可在汇总报表中查看</li>
              <li>逾期任务会在列表中标记「已逾期」</li>
              <li>一次性下发的任务会标注「⚡ 一次性」徽章，不受周期去重约束，适用于补充调查场景</li>
              <li>汇总报表仅统计已审批通过的填报数据</li>
              <li>智能问数仅统计已提交并通过接收的数据，结果支持下载为 Excel（含图表数据）</li>
              <li>新增字段时可勾选「标记为敏感字段」，或在字段卡片上点击「标记敏感」切换；敏感字段不会暴露在智能问数中</li>
              <li>模板设计页头部的「智能问数 · 开/关」徽章可控制整个模板是否对 AI 查询可见</li>
              <li>每用户智能问数每小时最多 20 次调用，超限后请稍后再试</li>
            </ul>
          </HelpSection>
        </div>
      </aside>
    </div>
  );
};
