import React, { useEffect } from 'react';
import {
  X,
  BookOpen,
  Shield,
  Workflow,
  FileSpreadsheet,
  Grid3x3,
  Zap,
} from './icons';
import { UserInfo } from '../types';

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

export const HelpDrawer: React.FC<HelpDrawerProps> = ({ open, onClose, user }) => {
  const isHQ = user?.role === 'department_report_admin' || user?.role === 'super_admin';
  const isDigitalAdmin = user?.role === 'digital_admin';

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
          {/* 角色与权限 */}
          <section>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
              <Shield className="w-4 h-4 text-ink" />
              <span>角色与权限</span>
            </h3>
            <div className="space-y-2 text-[12px] leading-[1.7]">
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">超级管理员</span><span className="text-mute">全局只读视图，可管理机构与用户，不可填报或签收</span></div>
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">部门报表管理员</span><span className="text-mute">设计模板、下发任务、签收报表、查看汇总（仅限本部门）</span></div>
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">数智化转型办公室</span><span className="text-mute">审批各部门提交的报表模板；可查看所有部门模板</span></div>
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">分公司经办人</span><span className="text-mute">填写并提交报表数据</span></div>
              <div className="flex gap-3"><span className="font-semibold text-ink shrink-0 w-24">复核人 / 审批人</span><span className="text-mute">查看填报信息，进行审批操作（不可填报）</span></div>
            </div>
          </section>

          {/* 三级审批流程 */}
          <section>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
              <Workflow className="w-4 h-4 text-ink" />
              <span>三级审批流程</span>
            </h3>
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
          </section>

          {/* 模板审批流程 */}
          <section>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
              <Shield className="w-4 h-4 text-ink" />
              <span>模板审批流程</span>
            </h3>
            <div className="bg-canvas rounded-[12px] p-4 space-y-2 text-[12px]">
              {[
                { step: '1', label: '创建模板', desc: '部门报表管理员设计模板，保存后为「草稿」状态' },
                { step: '2', label: '提交审批', desc: '在模板列表点击「提交审批」，模板进入「待审批」并锁定编辑' },
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
          </section>

          {/* 总部/部门操作指南 */}
          {isHQ && (
            <section>
              <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
                <FileSpreadsheet className="w-4 h-4 text-ink" />
                <span>总部/部门操作指南</span>
              </h3>
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
              </div>
            </section>
          )}

          {/* 数智化转型办公室操作指南 */}
          {isDigitalAdmin && (
            <section>
              <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
                <FileSpreadsheet className="w-4 h-4 text-ink" />
                <span>数智化转型办公室操作指南</span>
              </h3>
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
            </section>
          )}

          {/* 分公司操作指南 */}
          {!isHQ && !isDigitalAdmin && (
            <section>
              <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
                <FileSpreadsheet className="w-4 h-4 text-ink" />
                <span>分公司操作指南</span>
              </h3>
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
            </section>
          )}

          {/* 模版制定说明 */}
          <section>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
              <Grid3x3 className="w-4 h-4 text-ink" />
              <span>模版制定说明</span>
            </h3>
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
          </section>

          {/* 使用提示 */}
          <section>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
              <Zap className="w-4 h-4 text-ink" />
              <span>使用提示</span>
            </h3>
            <ul className="space-y-1.5 text-[12px] text-mute leading-[1.7] list-disc pl-5">
              <li>月报/季报/年报模板可在「模板管理 → 周期计划」配置自动下发：模板审批发布后，系统每日按设定时间自动向目标分公司生成本期任务，也可在弹窗中「立即执行一次」手动触发补发</li>
              <li>「模板管理 → 数据导入」支持按模板批量导入 Excel：「历史归档」直接成为已签收数据并计入汇总；「期初预填」为已下发任务生成草稿，由分公司经办人核对后提交</li>
              <li>填报被驳回/签收退回或模板被驳回时，工作台顶部会出现红色「退回提醒」，左侧导航对应菜单也会显示红色角标；修改后重新提交即可消除</li>
              <li>退回的报表可在原任务页面直接修改并重新提交</li>
              <li>填报、复核、审核与查看页面的汇总/明细/交叉表数据区均支持全屏展示：点击数据区右上角全屏按钮铺满屏幕（按 Esc 或再次点击退出），宽表数据可完整展开查看</li>
              <li>已签收的报表状态为「已签收」，可在汇总报表中查看</li>
              <li>逾期任务会在列表中标记「已逾期」</li>
              <li>一次性下发的任务会标注「⚡ 一次性」徽章</li>
              <li>汇总报表仅统计已审批通过的填报数据</li>
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
};
