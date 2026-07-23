import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Building2,
  Clock,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Eye,
  Filter,
  BarChart3,
  Edit,
} from 'lucide-react';
import { api, getStoredUser } from '../services/api';
import { ReportAssignment, UserInfo } from '../types';

export const AssignmentList: React.FC = () => {
  const [assignments, setAssignments] = useState<ReportAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [user, setUser] = useState<UserInfo | null>(getStoredUser());

  const navigate = useNavigate();
  const isHQ = user?.role === 'department_report_admin' || user?.role === 'super_admin';

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const list = await api.getAssignments();
      setAssignments(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const statusBadgeMap: Record<string, { label: string; bg: string; text: string; border: string }> = {
    pending: { label: '待填报', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    filling: { label: '填报草稿中', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    submitted: { label: '已提交待审核', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    approved: { label: '审批通过', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    aggregated: { label: '已自动汇总', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    rejected: { label: '已退回整改', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  };

  const filteredAssignments = assignments.filter((a) => {
    if (statusFilter === 'all') return true;
    return a.status === statusFilter;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Send className="w-5 h-5 text-blue-600" />
            <span>{isHQ ? '下发管理与状态跟进' : '我的周期报表填报任务'}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isHQ
              ? '实时监控各分公司周期报表下发进度，快速查看提交版本与审批流转轨迹。'
              : '查看总部下发至本分公司的填报任务，在线保存草稿并发起三级审批流。'}
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            全部 ({assignments.length})
          </button>
          <button
            onClick={() => setStatusFilter('submitted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'submitted'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            待审批 ({assignments.filter((a) => a.status === 'submitted').length})
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'approved'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            已通过 ({assignments.filter((a) => a.status === 'approved' || a.status === 'aggregated').length})
          </button>
        </div>
      </div>

      {/* Assignment Items List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">加载下发任务列表中...</div>
      ) : filteredAssignments.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
          <Send className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-bold text-slate-700">暂无相匹配的下发任务</div>
          <p className="text-xs text-slate-400 mt-1">请尝试切换筛选条件或联系总部下发</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAssignments.map((item) => {
            const badge = statusBadgeMap[item.status] || statusBadgeMap.pending;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {item.period_label}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-slate-500 flex-wrap gap-y-1">
                    <div className="flex items-center space-x-1">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                      <span>模板: {item.template_name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>分公司: {item.company_name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>截止时间: {item.deadline}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  {isHQ ? (
                    <button
                      onClick={() => navigate(`/aggregation?template_id=${item.template_id}`)}
                      className="px-4 py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 font-semibold text-xs rounded-xl transition-colors flex items-center space-x-1.5"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>全公司对比汇总</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate(`/fill/${item.id}`)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>{item.status === 'approved' ? '查看已审单据' : '进行报表填报'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
