import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  Send,
  CheckSquare,
  BarChart3,
  Plus,
  Clock,
  ArrowRight,
  Building2,
  AlertCircle,
  TrendingUp,
  FileCheck2,
} from 'lucide-react';
import { api, getStoredUser } from '../services/api';
import { UserInfo, ReportTemplate, ReportAssignment, PendingApprovalTask } from '../types';

export const Dashboard: React.FC = () => {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser());
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [assignments, setAssignments] = useState<ReportAssignment[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalTask[]>([]);
  const [branchesCount, setBranchesCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const navigate = useNavigate();
  const isHQ = user?.role === 'department_report_admin' || user?.role === 'super_admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const uRes = await api.getMe();
      setUser(uRes.user);

      if (uRes.user.role === 'department_report_admin' || uRes.user.role === 'super_admin') {
        const [tList, aList, bList] = await Promise.all([
          api.getTemplates(),
          api.getAssignments(),
          api.getBranches(),
        ]);
        setTemplates(tList);
        setAssignments(aList);
        setBranchesCount(bList.length);
      } else {
        const [aList, pList] = await Promise.all([
          api.getAssignments(),
          api.getPendingApprovals(),
        ]);
        setAssignments(aList);
        setPendingApprovals(pList);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const statusMap: Record<string, { label: string; bg: string; text: string }> = {
    pending: { label: '待填报', bg: 'bg-slate-100', text: 'text-slate-700' },
    filling: { label: '填报中', bg: 'bg-blue-50', text: 'text-blue-700' },
    submitted: { label: '已提交待审', bg: 'bg-amber-50', text: 'text-amber-700' },
    pending_receipt: { label: '待下发部门签收', bg: 'bg-amber-50', text: 'text-amber-700' },
    received: { label: '下发部门已签收', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    returned: { label: '已退回修改', bg: 'bg-rose-50', text: 'text-rose-700' },
    approved: { label: '已审批通过', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    aggregated: { label: '已自动汇总', bg: 'bg-indigo-50', text: 'text-indigo-700' },
    rejected: { label: '已退回', bg: 'bg-rose-50', text: 'text-rose-700' },
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-white/10 rounded-full text-xs font-medium text-indigo-200 mb-2.5 backdrop-blur-sm">
              <Building2 className="w-3.5 h-3.5" />
              <span>{user?.company_name} · {isHQ ? '总部层级' : '分公司层级'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              欢迎回来，{user?.display_name || '使用者'}
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
              {isHQ
                ? '自由报表统一管控中心：轻松设计通用模板、按周期一键下发各分公司、全流程跟进与自动智能汇总。'
                : '自由报表分公司填报中心：高效完成周期性数据上报、经办人-复核人-审批人在线三级穿透审核。'}
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {user?.role === 'department_report_admin' ? (
              <button
                onClick={() => navigate('/templates')}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>新建模板</span>
              </button>
            ) : user?.role === 'super_admin' ? (
              <button onClick={() => navigate('/global-view')} className="px-4 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl">进入全局只读视图</button>
            ) : (
              <button
                onClick={() => navigate('/fill')}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>立即填报</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      {isHQ ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">发布的模板数</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{templates.length}</div>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">下发任务总数</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{assignments.length}</div>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Send className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">已完结/汇总数量</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {assignments.filter((a) => a.status === 'approved' || a.status === 'aggregated').length}
              </div>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">关联分公司数量</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{branchesCount}</div>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">收到下发任务</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{assignments.length}</div>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Send className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">待处理/待审批</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{pendingApprovals.length}</div>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">已终审通过报表</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {assignments.filter((a) => a.status === 'approved' || a.status === 'aggregated').length}
              </div>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Task List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>{isHQ ? '最新下发管控任务' : '需要关注的报表任务'}</span>
              </h2>
              <Link
                to={isHQ ? '/assignments' : '/fill'}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
              >
                <span>查看全部</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">加载任务列表中...</div>
            ) : assignments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">暂无报表任务</div>
            ) : (
              <div className="space-y-3">
                {assignments.slice(0, 5).map((item) => {
                  const sInfo = statusMap[item.status] || statusMap.pending;
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-slate-200/70 hover:border-indigo-200 hover:bg-slate-50/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-slate-800">{item.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${sInfo.bg} ${sInfo.text}`}
                          >
                            {sInfo.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center space-x-3">
                          <span>周期: {item.period_label}</span>
                          <span>截止日期: {item.deadline}</span>
                          {isHQ && <span>分公司: {item.company_name}</span>}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center space-x-2">
                        {isHQ ? (
                          <button
                            onClick={() => navigate(`/aggregation?template_id=${item.template_id}`)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 text-xs font-semibold rounded-lg transition-colors border border-slate-200"
                          >
                            查看对比汇总
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/fill/${item.id}`)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
                          >
                            {item.status === 'approved' ? '查看详情' : '在线填报/修改'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 col): Quick Shortcuts & Pending Approvals */}
        <div className="space-y-6">
          {!isHQ && pendingApprovals.length > 0 && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center space-x-2 text-amber-800 font-bold text-sm mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>待处理复核/审批 ({pendingApprovals.length})</span>
              </div>
              <p className="text-xs text-amber-700 mb-3">
                您当前有待核查流转的填报单，请及时完成评审。
              </p>
              <button
                onClick={() => navigate('/approvals')}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1"
              >
                <span>前往审批中心</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>常用快捷导航</span>
            </h3>

            <div className="grid grid-cols-1 gap-2 text-xs font-medium">
              {isHQ ? (
                <>
                  <Link
                    to="/templates"
                    className="p-3 bg-slate-50/80 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 rounded-xl border border-slate-200/80 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                      <span>报表模板库与设计器</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </Link>

                  <Link
                    to="/assignments"
                    className="p-3 bg-slate-50/80 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 rounded-xl border border-slate-200/80 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <Send className="w-4 h-4 text-indigo-600" />
                      <span>发起周期下发与催报</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </Link>

                  <Link
                    to="/aggregation"
                    className="p-3 bg-slate-50/80 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 rounded-xl border border-slate-200/80 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <BarChart3 className="w-4 h-4 text-emerald-600" />
                      <span>横向汇总表与指标计算</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/fill"
                    className="p-3 bg-slate-50/80 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 rounded-xl border border-slate-200/80 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>待填报多明细列表</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </Link>

                  <Link
                    to="/approvals"
                    className="p-3 bg-slate-50/80 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 rounded-xl border border-slate-200/80 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <CheckSquare className="w-4 h-4 text-amber-600" />
                      <span>经办/复核/终审轨迹</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
