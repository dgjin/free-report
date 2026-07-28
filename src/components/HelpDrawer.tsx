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

interface GuideField {
  label: string;
  required?: boolean;
  note?: string;
}

interface TemplateGuide {
  name: string;
  period: string;
  purpose: string;
  summaryFields?: GuideField[];
  detailFields?: GuideField[];
  matrix?: boolean;
  tips: string[];
}

/**
 * 模板填报说明（与 sql/002_seed.sql 种子模板保持一致；新增模板时请同步补充）
 */
const TEMPLATE_GUIDES: TemplateGuide[] = [
  {
    name: '月度销售与经营报表',
    period: '月度',
    purpose: '汇总各分公司月度销售收入、利润及核心产品销售明细。',
    summaryFields: [
      { label: '总收入（万元）', required: true },
      { label: '净利润（万元）', required: true },
      { label: '在册员工数（人）' },
      { label: '填报基准日', required: true },
      { label: '经营情况说明' },
    ],
    detailFields: [
      { label: '产品/项目名称', required: true },
      { label: '销量/数量（件）', required: true },
      { label: '产品销售额（万元）', required: true },
      { label: '销售渠道', note: '直销 / 代理商 / 线上平台 / 大客户' },
    ],
    tips: [
      '金额单位均为「万元」，请与明细行销售额口径保持一致',
      '明细区可一次添加多行产品，提交前请核对合计与总收入',
    ],
  },
  {
    name: '季度资产与设备清查表',
    period: '季度',
    purpose: '清查各分公司季度固定资产、设备状况及盘点明细。',
    summaryFields: [
      { label: '资产总估值（万元）', required: true },
      { label: '盘点结论', required: true, note: '良好 / 正常 / 存在轻微异常 / 需要整改' },
    ],
    detailFields: [
      { label: '资产编号', required: true },
      { label: '资产名称', required: true },
      { label: '资产类别', required: true, note: '办公设备 / IT基础设施 / 生产机械 / 运输车辆 / 其他' },
      { label: '原值（元）', required: true },
      { label: '使用状态', required: true, note: '正常在用 / 待维修 / 已提报废 / 闲置中' },
    ],
    tips: [
      '明细「原值」单位为元，汇总「资产总估值」单位为万元，注意换算',
      '建议按资产编号逐条盘点登记，盘点结论应与明细使用状态相符',
    ],
  },
  {
    name: '二维交叉表模板',
    period: '通用',
    purpose: '适用于「行维度 × 列指标」交叉填报的场景（如按区域 × 指标填报）。',
    matrix: true,
    tips: [
      '行列结构由模板固定，点击交叉单元格直接填写',
      '空白单元格视为未填报，数字列自动参与汇总统计',
    ],
  },
];

const FIELD_TYPE_LEGEND: Array<{ label: string; desc: string }> = [
  { label: '数字', desc: '仅接受数值，自动参与汇总统计' },
  { label: '日期', desc: '点击输入框选择日期' },
  { label: '下拉选择', desc: '从预设选项中任选其一' },
  { label: '多行文本', desc: '填写较长的文字说明' },
  { label: '二维交叉表', desc: '在行 × 列交叉单元格中填写' },
];

const GuideFieldList: React.FC<{ title: string; fields: GuideField[] }> = ({ title, fields }) => (
  <div>
    <div className="text-[11px] font-semibold text-ink mb-1.5">{title}</div>
    <ul className="space-y-1">
      {fields.map((f) => (
        <li key={f.label} className="text-[12px] leading-[1.6] text-mute flex items-baseline gap-1">
          <span className="text-body">
            {f.label}
            {f.required && <span className="text-[#9F2F2D] font-bold"> *</span>}
          </span>
          {f.note && <span className="text-[11px] text-faint">（{f.note}）</span>}
        </li>
      ))}
    </ul>
  </div>
);

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
                  <div className="text-mute">在「报表填报」查看收到的下发任务，点击进入填报。支持汇总指标和明细行填写，交叉表可编辑单元格。</div>
                </div>
                <div className="apple-row px-4 py-3 bg-canvas rounded-[12px]">
                  <div className="font-semibold text-ink mb-1">审批流程</div>
                  <div className="text-mute">经办人提交后，复核人和审批人依次在「审批中心」处理。可查看填报详情并附审批意见。退回后经办人可修改重提。</div>
                </div>
              </div>
            </section>
          )}

          {/* 模板填报说明 */}
          <section>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
              <Grid3x3 className="w-4 h-4 text-ink" />
              <span>模板填报说明</span>
            </h3>
            <div className="space-y-3">
              {TEMPLATE_GUIDES.map((guide) => (
                <div
                  key={guide.name}
                  className="rounded-[12px] overflow-hidden"
                  style={{ border: '1px solid var(--hairline)' }}
                >
                  <div className="px-4 py-2.5 bg-canvas flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{guide.name}</span>
                    <span className="shrink-0 text-[10px] font-bold text-mute bg-line px-2 py-0.5 rounded-full">
                      {guide.period}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    <p className="text-[12px] text-mute leading-[1.6]">{guide.purpose}</p>
                    {guide.summaryFields && (
                      <GuideFieldList title="汇总指标" fields={guide.summaryFields} />
                    )}
                    {guide.detailFields && (
                      <GuideFieldList title="明细行（可添加多行）" fields={guide.detailFields} />
                    )}
                    {guide.matrix && (
                      <div className="text-[12px] text-mute leading-[1.6]">
                        填报区域为交叉表格，行、列由模板预定义。
                      </div>
                    )}
                    <ul className="space-y-1 pt-1" style={{ borderTop: '1px dashed var(--hairline)' }}>
                      {guide.tips.map((tip) => (
                        <li key={tip} className="text-[11px] text-mute leading-[1.6] flex gap-1.5">
                          <Zap className="w-3 h-3 text-faint shrink-0 mt-[3px]" />
                          <span>{tip}</span>
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
            </div>
          </section>

          {/* 使用提示 */}
          <section>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink mb-2.5">
              <Zap className="w-4 h-4 text-ink" />
              <span>使用提示</span>
            </h3>
            <ul className="space-y-1.5 text-[12px] text-mute leading-[1.7] list-disc pl-5">
              <li>退回的报表可在原任务页面直接修改并重新提交</li>
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
