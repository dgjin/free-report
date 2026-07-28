import React, { useEffect, useState } from 'react';
import { Calendar, X, CheckCircle, Building2, Zap } from './icons';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import type { Company, ReportTemplate, TemplateSchedule } from '../types';
import { describeIssueRule, isSchedulablePeriodType } from '../utils/periodSchedule';

interface TemplateScheduleModalProps {
  template: ReportTemplate;
  branches: Company[];
  onClose: () => void;
}

/**
 * 周期下发计划配置弹窗：启用开关、下发时间、截止偏移、目标分公司、手动立即执行。
 * 仅 monthly/quarterly/yearly 模板可启用；手动执行要求计划已启用且模板已发布。
 */
export const TemplateScheduleModal: React.FC<TemplateScheduleModalProps> = ({
  template,
  branches,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [schedule, setSchedule] = useState<TemplateSchedule | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [issueDay, setIssueDay] = useState(5);
  const [issueMonth, setIssueMonth] = useState(1);
  const [offsetDays, setOffsetDays] = useState(10);
  const [targetIds, setTargetIds] = useState<number[]>([]);

  const schedulable = isSchedulablePeriodType(template.period_type);
  const isYearly = template.period_type === 'yearly';
  const published = template.status === 'published';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getTemplateSchedule(template.id);
        if (cancelled) return;
        setSchedule(s);
        setEnabled(s.enabled);
        setIssueDay(s.issue_day || 5);
        setIssueMonth(s.issue_month || 1);
        setOffsetDays(s.deadline_offset_days || 10);
        setTargetIds(s.target_company_ids || []);
      } catch (err: any) {
        if (!cancelled) toast(err.message || '读取周期计划失败', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template.id]);

  const toggleTarget = (id: number) => {
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (issueDay < 1 || issueDay > 28) return toast('下发日须在 1-28 之间', 'error');
    if (offsetDays < 1 || offsetDays > 365) return toast('截止天数须在 1-365 之间', 'error');
    if (enabled && targetIds.length === 0) return toast('启用自动下发须至少选择一个目标机构', 'error');
    setSaving(true);
    try {
      const res = await api.saveTemplateSchedule(template.id, {
        enabled,
        issue_day: issueDay,
        issue_month: isYearly ? issueMonth : null,
        deadline_offset_days: offsetDays,
        target_company_ids: targetIds,
      });
      setSchedule(res.schedule);
      toast(res.message, 'success');
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await api.runTemplateSchedule(template.id);
      toast(res.message, res.generated ? 'success' : 'info');
      const s = await api.getTemplateSchedule(template.id);
      setSchedule(s);
    } catch (err: any) {
      toast(err.message || '执行失败', 'error');
    } finally {
      setRunning(false);
    }
  };

  const issueDayLabel =
    template.period_type === 'monthly'
      ? '每月第几日下发'
      : template.period_type === 'quarterly'
        ? '每季首月第几日下发'
        : '第几日下发';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <div
        className="bg-white rounded-[12px] max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: 'var(--sh-overlay)' }}
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink tracking-[-0.01em] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-ink" />
              <span>周期下发计划</span>
            </h2>
            <div className="text-xs text-mute mt-0.5">模板: {template.name}</div>
          </div>
          <button onClick={onClose} className="text-mute hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-mute">加载计划配置中...</div>
        ) : !schedulable ? (
          <div className="px-4 py-3 bg-canvas rounded-[12px] text-sm text-mute">
            该模板为{template.period_type === 'daily' ? '日度' : template.period_type === 'weekly' ? '周度' : '自定义'}周期，
            仅月报 / 季报 / 年报支持配置自动下发计划。
          </div>
        ) : (
          <div className="space-y-4">
            {/* 启用开关 */}
            <label
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[12px] cursor-pointer border transition-colors ${
                enabled
                  ? 'bg-[rgba(17,17,17,0.06)] border-[rgba(17,17,17,0.25)]'
                  : 'bg-canvas border-line hover:bg-hoverbg'
              }`}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 accent-ink cursor-pointer"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-ink">启用自动下发</div>
                <div className="text-xs text-mute mt-0.5">
                  模板审批发布后，系统每日按设定时间自动向目标分公司生成本期任务
                </div>
              </div>
            </label>

            {/* 下发时间 */}
            <div className={`grid ${isYearly ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              {isYearly && (
                <div>
                  <label className="block text-xs font-medium text-body mb-1.5">每年第几月下发</label>
                  <select
                    value={issueMonth}
                    onChange={(e) => setIssueMonth(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink focus:outline-none focus:border-ink"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {m} 月
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-body mb-1.5">{issueDayLabel}</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={issueDay}
                  onChange={(e) => setIssueDay(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink focus:outline-none focus:border-ink"
                />
              </div>
            </div>
            <p className="text-[11px] text-faint -mt-2">
              当前规则：{describeIssueRule(template.period_type, issueDay, isYearly ? issueMonth : null)} 自动下发（1-28 日）
            </p>

            {/* 截止偏移 */}
            <div>
              <label className="block text-xs font-medium text-body mb-1.5">填报截止天数（下发后 N 天截止）</label>
              <input
                type="number"
                min={1}
                max={365}
                value={offsetDays}
                onChange={(e) => setOffsetDays(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink focus:outline-none focus:border-ink"
              />
            </div>

            {/* 目标分公司 */}
            <div>
              <label className="block text-xs font-medium text-body mb-2">目标分公司</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto p-3 bg-canvas rounded-[12px] border border-line">
                {branches.map((b) => {
                  const checked = targetIds.includes(b.id);
                  return (
                    <div
                      key={b.id}
                      onClick={() => toggleTarget(b.id)}
                      className={`px-3 py-2 rounded-[10px] text-xs flex items-center justify-between cursor-pointer border transition-colors ${
                        checked
                          ? 'bg-[rgba(17,17,17,0.08)] border-[rgba(17,17,17,0.25)] text-ink font-medium'
                          : 'bg-white border-line text-body hover:bg-hoverbg'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-mute" />
                        <span>
                          {b.name} ({b.code})
                        </span>
                      </div>
                      {checked && <CheckCircle className="w-4 h-4 text-ink" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 最近生成周期 */}
            <div className="px-3.5 py-2.5 bg-canvas rounded-[12px] text-xs text-mute flex items-center justify-between">
              <span>最近自动生成周期</span>
              <span className="font-medium text-ink">{schedule?.last_period_label || '尚未生成'}</span>
            </div>

            {!published && (
              <p className="text-[11px] text-[#956400]">
                模板当前未发布，自动下发将在模板审批通过（发布）后生效
              </p>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-line flex items-center justify-between gap-3">
          <div>
            {schedulable && !loading && (
              <button
                type="button"
                onClick={handleRun}
                disabled={running || saving || !schedule?.enabled || !published}
                title={!published ? '模板发布后方可执行' : !schedule?.enabled ? '请先保存并启用计划' : '立即按本期规则生成下发任务'}
                className="h-10 px-4 bg-canvas hover:bg-line text-ink font-medium text-sm rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{running ? '执行中...' : '立即执行一次'}</span>
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 bg-canvas hover:bg-line text-ink font-medium text-sm rounded-md transition-colors"
            >
              关闭
            </button>
            {schedulable && !loading && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || running}
                className="h-10 px-5 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存计划'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
