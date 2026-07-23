import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Send,
  CheckSquare,
  BarChart3,
  LogOut,
  UserCheck,
  Building2,
  ChevronDown,
  Menu,
  X,
  RefreshCw,
  Bell,
  Shield,
} from 'lucide-react';
import { api, getStoredUser, removeToken } from '../services/api';
import { UserInfo } from '../types';
import { getClientAccess } from '../utils/access';

export const Layout: React.FC = () => {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [accountSwitchOpen, setAccountSwitchOpen] = useState<boolean>(false);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    fetchMe();
  }, [location.pathname]);

  const fetchMe = async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
      if (res.user.company_level === 'branch') {
        const pending = await api.getPendingApprovals();
        setPendingCount(pending.length);
      }
    } catch {
      // ignore
    }
  };

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  const handleQuickSwitch = async (username: string) => {
    try {
      const data = await api.login(username, '123456');
      setUser(data.user);
      setAccountSwitchOpen(false);
      navigate('/');
    } catch (err: any) {
      alert(err.message || '切换账号失败');
    }
  };

  const access = user ? getClientAccess(user) : null;
  const isHQ = access?.isDepartmentAdmin === true;

  const roleLabels: Record<string, string> = {
    super_admin: '超级管理员',
    headquarter_admin: '总部管理员',
    department_report_admin: '部门报表管理员',
    branch_admin: '分公司管理员',
    handler: '经办人',
    reviewer: '复核人',
    approver: '审批人',
  };

  const quickAccounts = import.meta.env.DEV ? [
    { username: 'admin', label: '总部 - 超级管理员', company: '总部' },
    { username: 'hq_admin', label: '总部 - 总部管理员', company: '总部' },
    { username: 'bj_handler', label: '北京 - 经办人', company: '北京分公司' },
    { username: 'bj_reviewer', label: '北京 - 复核人', company: '北京分公司' },
    { username: 'bj_approver', label: '北京 - 审批人', company: '北京分公司' },
    { username: 'sh_handler', label: '上海 - 经办人', company: '上海分公司' },
    { username: 'sh_reviewer', label: '上海 - 复核人', company: '上海分公司' },
    { username: 'sh_approver', label: '上海 - 审批人', company: '上海分公司' },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Mobile Menu Toggle */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus:outline-none"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="flex items-center space-x-2.5 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg text-white font-bold flex items-center justify-center shadow-xs">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="flex items-center">
                <span className="font-bold text-slate-800 text-xl tracking-tight">
                  自由报表
                </span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-semibold uppercase tracking-wider ml-2 border border-slate-200">
                  FreeReport v0.1
                </span>
              </div>
            </div>
          </div>

          {/* Right Profile & Quick Switcher */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Quick Switch Demo Button */}
            {import.meta.env.DEV && <div className="relative">
              <button
                onClick={() => setAccountSwitchOpen(!accountSwitchOpen)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-xs"
                title="快速切换测试账号"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">切换视角</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {accountSwitchOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white text-slate-800 rounded-xl shadow-lg border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>快捷切换多身份（免密码）</span>
                    <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {quickAccounts.map((acc) => {
                      const isCurrent = user?.username === acc.username;
                      return (
                        <button
                          key={acc.username}
                          onClick={() => handleQuickSwitch(acc.username)}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-indigo-50/80 transition-colors ${
                            isCurrent ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700'
                          }`}
                        >
                          <div>
                            <div>{acc.label}</div>
                            <div className="text-[10px] text-slate-400">{acc.company}</div>
                          </div>
                          {isCurrent && <UserCheck className="w-4 h-4 text-indigo-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>}

            {/* Current User Info Badge */}
            {user && (
              <div className="flex items-center space-x-2.5 pl-3 border-l border-slate-200">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-semibold text-slate-800 flex items-center justify-end space-x-1">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <span>{user.company_name}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {user.display_name} ({roleLabels[user.role] || user.role})
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {user.display_name ? user.display_name.charAt(0) : 'U'}
                </div>

                <button
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="退出登录"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl w-full mx-auto flex-1 flex">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-y-0 left-0 transform ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          } md:relative md:translate-x-0 transition duration-200 ease-in-out z-30 w-60 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 top-16 md:top-0`}
        >
          <div className="p-4 space-y-6">
            {/* View Context Badge */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center space-x-3">
              <div
                className={`p-2 rounded-lg text-white ${
                  isHQ ? 'bg-indigo-600' : 'bg-emerald-600'
                }`}
              >
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 font-medium">当前控制视角</div>
                <div className="text-xs font-bold text-slate-800">
                  {isHQ ? '总部工作平台' : `${user?.company_name || '分公司'}平台`}
                </div>
              </div>
            </div>

            {/* Navigation Menu */}
            <nav className="space-y-1">
              <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                功能导航
              </div>

              {/* Common Dashboard */}
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  location.pathname === '/'
                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <LayoutDashboard className={`w-4 h-4 ${location.pathname === '/' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>工作台</span>
                </div>
              </Link>

              {/* Headquarters Specific Routes */}
              {isHQ && (
                <>
                  <Link
                    to="/templates"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      location.pathname.startsWith('/templates')
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <FileSpreadsheet className={`w-4 h-4 ${location.pathname.startsWith('/templates') ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span>模板管理</span>
                    </div>
                  </Link>

                  <Link
                    to="/assignments"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      location.pathname.startsWith('/assignments')
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Send className={`w-4 h-4 ${location.pathname.startsWith('/assignments') ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span>下发管理</span>
                    </div>
                  </Link>

                  <Link
                    to="/aggregation"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      location.pathname.startsWith('/aggregation')
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <BarChart3 className={`w-4 h-4 ${location.pathname.startsWith('/aggregation') ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span>汇总报表</span>
                    </div>
                  </Link>
                </>
              )}

              {access?.canReceive && <Link to="/receipts" onClick={() => setMobileMenuOpen(false)} className="flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"><CheckSquare className="w-4 h-4"/><span>签收中心</span></Link>}
              {isHQ && <Link to="/fill" onClick={() => setMobileMenuOpen(false)} className="flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"><FileSpreadsheet className="w-4 h-4"/><span>收到的任务</span></Link>}
              {access?.canManageOrganizations && <Link to="/organizations" onClick={() => setMobileMenuOpen(false)} className="flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"><Building2 className="w-4 h-4"/><span>机构管理</span></Link>}
              {access?.isSuperAdmin && <Link to="/global-view" onClick={() => setMobileMenuOpen(false)} className="flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"><Shield className="w-4 h-4"/><span>全局查看</span></Link>}

              {/* Branch Specific Routes */}
              {!isHQ && !access?.isSuperAdmin && (
                <>
                  <Link
                    to="/fill"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      location.pathname.startsWith('/fill')
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <FileSpreadsheet className={`w-4 h-4 ${location.pathname.startsWith('/fill') ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span>报表填报</span>
                    </div>
                  </Link>

                  <Link
                    to="/approvals"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      location.pathname.startsWith('/approvals')
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <CheckSquare className={`w-4 h-4 ${location.pathname.startsWith('/approvals') ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span>审批中心</span>
                    </div>
                    {pendingCount > 0 && (
                      <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* Quick Info Footer */}
          <div className="p-4 border-t border-slate-200/80 bg-slate-50/50 text-[11px] text-slate-500 space-y-1">
            <div className="font-semibold text-slate-700">自由报表 FreeReport v0.1.0</div>
            <div className="text-slate-400">系统状态: 本地 MySQL 运行正常</div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
