import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
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
  Shield,
  HelpCircle,
} from './icons';
import { api, getStoredUser, removeToken } from '../services/api';
import { toast } from '../utils/toast';
import { useRevealObserver } from '../utils/reveal';
import { ThemeSwitcher } from './ThemeSwitcher';
import { HelpDrawer } from './HelpDrawer';
import { UserInfo } from '../types';
import { getClientAccess } from '../utils/access';
import { mutate } from 'swr';

export const Layout: React.FC = () => {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [accountSwitchOpen, setAccountSwitchOpen] = useState<boolean>(false);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);

  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  useRevealObserver();

  useEffect(() => {
    fetchMe();
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  const fetchMe = async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
      if (res.user.role === 'digital_admin') {
        const pendingTemplates = await api.getPendingTemplateApprovals();
        setPendingCount(pendingTemplates.length);
      } else if (res.user.company_level === 'branch') {
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
      // 清除所有 SWR 缓存，确保切换用户后各页面按新权限重新获取数据
      await mutate(() => true, undefined, { revalidate: false });
      // 更新待审批计数
      if (data.user.company_level === 'branch') {
        try {
          const pending = await api.getPendingApprovals();
          setPendingCount(pending.length);
        } catch { setPendingCount(0); }
      } else {
        setPendingCount(0);
      }
      navigate('/');
    } catch (err: any) {
      toast(err.message || '切换账号失败', 'error');
    }
  };

  const access = user ? getClientAccess(user) : null;
  const isHQ = access?.isDepartmentAdmin === true;

  const roleLabels: Record<string, string> = {
    super_admin: '超级管理员',
    department_report_admin: '部门报表管理员',
    branch_admin: '分公司管理员',
    handler: '经办人',
    reviewer: '复核人',
    approver: '审批人',
    digital_admin: '数智化转型办公室',
  };

  const quickAccounts = import.meta.env.DEV ? [
    { username: 'admin', label: '超级管理员', company: '总部' },
    { username: 'hq_admin', label: '报表管理员', company: '业务综合管理部' },
    { username: 'office_admin', label: '报表管理员', company: '办公室' },
    { username: 'risk_admin', label: '报表管理员', company: '风险管理部' },
    { username: 'digital_admin', label: '模板审批', company: '数智化转型办公室' },
    { username: 'bj_handler', label: '经办人', company: '北京分公司' },
    { username: 'bj_reviewer', label: '复核人', company: '北京分公司' },
    { username: 'bj_approver', label: '审批人', company: '北京分公司' },
    { username: 'sh_handler', label: '经办人', company: '上海分公司' },
    { username: 'sh_reviewer', label: '复核人', company: '上海分公司' },
    { username: 'sh_approver', label: '审批人', company: '上海分公司' },
  ] : [];

  const navLinkClass = (active: boolean) =>
    `flex items-center justify-between px-3.5 py-2.5 rounded-[10px] text-[13px] font-medium transition-colors ${
      active
        ? 'bg-canvas text-ink font-semibold'
        : 'text-mute hover:bg-canvas hover:text-ink'
    }`;

  const navIconClass = (active: boolean) =>
    `w-4 h-4 ${active ? 'text-ink' : 'text-mute'}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Sticky top bar — solid surface, hairline on scroll */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'var(--surface)',
          borderBottom: scrolled ? '1px solid var(--hairline)' : '1px solid transparent',
          transition: 'border-color .3s',
        }}
      >
        <div className="max-w-[1080px] mx-auto px-[22px] h-[54px] flex items-center justify-between gap-4">
          {/* Logo & Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-[8px] text-mute hover:text-ink hover:bg-canvas focus:outline-none"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-7 h-7 rounded-[8px] flex items-center justify-center" style={{ background: 'var(--grad-cta)' }}>
                <FileSpreadsheet className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-[15px] text-ink tracking-[-0.01em]">随手报</span>
              <span className="px-1.5 py-0.5 bg-line text-mute rounded-[4px] text-[9px] font-bold uppercase tracking-wider">
                v0.1
              </span>
            </div>
          </div>

          {/* Right Profile & Quick Switcher */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setHelpOpen(true)}
              className="p-2 rounded-full text-mute hover:text-ink hover:bg-canvas transition-colors"
              title="使用帮助"
            >
              <HelpCircle className="w-[18px] h-[18px]" />
            </button>
            <ThemeSwitcher />
            {/* Quick Switch Demo Button */}
            {import.meta.env.DEV && (
              <div className="relative">
                <button
                  onClick={() => setAccountSwitchOpen(!accountSwitchOpen)}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-body bg-white hover:bg-hoverbg border border-line rounded-full transition-colors"
                  title="快速切换测试账号"
                >
                  <RefreshCw className="w-3 h-3 text-ink" />
                  <span className="hidden sm:inline">切换视角</span>
                  <ChevronDown className="w-3 h-3 text-faint" />
                </button>

                {accountSwitchOpen && (
                  <div
                    className="absolute right-0 mt-2 w-64 bg-white rounded-[12px] py-2 z-50"
                    style={{ boxShadow: 'var(--sh-overlay)', border: '1px solid var(--hairline)' }}
                  >
                    <div className="px-3 py-1.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--hairline)' }}>
                      <span className="text-[11px] font-semibold text-mute uppercase tracking-wider">快捷切换多身份</span>
                      <Shield className="w-3.5 h-3.5 text-ink" />
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {quickAccounts.map((acc) => {
                        const isCurrent = user?.username === acc.username;
                        return (
                          <button
                            key={acc.username}
                            onClick={() => handleQuickSwitch(acc.username)}
                            className={`w-full text-left px-3 py-2 text-[12px] flex items-center justify-between hover:bg-canvas transition-colors ${
                              isCurrent ? 'bg-canvas text-ink font-semibold' : 'text-body'
                            }`}
                          >
                            <div>
                              <div>{acc.label}</div>
                              <div className="text-[10px] text-faint">{acc.company}</div>
                            </div>
                            {isCurrent && <UserCheck className="w-4 h-4 text-ink" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Current User Info */}
            {user && (
              <div className="flex items-center gap-2.5 pl-3" style={{ borderLeft: '1px solid var(--hairline)' }}>
                <div className="hidden sm:block text-right">
                  <div className="text-[12px] font-semibold text-ink flex items-center justify-end gap-1">
                    <Building2 className="w-3 h-3 text-faint" />
                    <span>{user.company_name}</span>
                  </div>
                  <div className="text-[11px] text-mute">
                    {user.display_name} ({roleLabels[user.role] || user.role})
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px] text-white" style={{ background: 'var(--grad-cta)' }}>
                  {user.display_name ? user.display_name.charAt(0) : 'U'}
                </div>

                <button
                  onClick={handleLogout}
                  className="p-1.5 text-faint hover:text-[#9F2F2D] hover:bg-canvas rounded-[8px] transition-colors"
                  title="退出登录"
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-[1080px] w-full mx-auto flex-1 flex">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-y-0 left-0 transform ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          } md:relative md:translate-x-0 transition duration-200 ease-in-out z-30 w-60 bg-white flex flex-col justify-between shrink-0 top-[54px] md:top-0`}
          style={{ borderRight: '1px solid var(--hairline)' }}
        >
          <div className="p-4 space-y-5">
            {/* View Context Badge */}
            <div className="p-3 bg-canvas rounded-[12px] flex items-center gap-2.5">
              <div className="p-1.5 rounded-[8px] text-white shrink-0" style={{ background: 'var(--grad-cta)' }}>
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-mute font-medium">当前控制视角</div>
                <div className="text-[13px] font-semibold text-ink truncate">
                  {isHQ ? `${user?.company_name || '总部'}` : `${user?.company_name || '分公司'}`}
                </div>
              </div>
            </div>

            {/* Navigation Menu */}
            <nav className="space-y-0.5">
              <div className="px-3.5 pb-2 text-[10px] font-bold text-faint uppercase tracking-wider">
                功能导航
              </div>

              {/* Common Dashboard */}
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname === '/')}>
                <div className="flex items-center gap-3">
                  <LayoutDashboard className={navIconClass(location.pathname === '/')} />
                  <span>工作台</span>
                </div>
              </Link>

              {/* Headquarters Specific Routes */}
              {isHQ && (
                <>
                  <Link to="/templates" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/templates'))}>
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className={navIconClass(location.pathname.startsWith('/templates'))} />
                      <span>模板管理</span>
                    </div>
                  </Link>

                  <Link to="/assignments" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/assignments'))}>
                    <div className="flex items-center gap-3">
                      <Send className={navIconClass(location.pathname.startsWith('/assignments'))} />
                      <span>下发管理</span>
                    </div>
                  </Link>

                  <Link to="/aggregation" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/aggregation'))}>
                    <div className="flex items-center gap-3">
                      <BarChart3 className={navIconClass(location.pathname.startsWith('/aggregation'))} />
                      <span>汇总报表</span>
                    </div>
                  </Link>
                </>
              )}

              {/* Digital Admin Routes */}
              {access?.isDigitalAdmin && (
                <>
                  <Link to="/approvals" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/approvals') || location.pathname.startsWith('/template-approvals'))}>
                    <div className="flex items-center gap-3">
                      <CheckSquare className={navIconClass(location.pathname.startsWith('/approvals') || location.pathname.startsWith('/template-approvals'))} />
                      <span>审批中心</span>
                    </div>
                    {pendingCount > 0 && (
                      <span className="text-[#9F2F2D] bg-[#FDEBEC] text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums">
                        {pendingCount}
                      </span>
                    )}
                  </Link>

                  <Link to="/templates" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/templates'))}>
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className={navIconClass(location.pathname.startsWith('/templates'))} />
                      <span>模板管理</span>
                    </div>
                  </Link>
                </>
              )}

              {access?.canManageOrganizations && (
                <Link to="/organizations" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/organizations'))}>
                  <div className="flex items-center gap-3">
                    <Building2 className={navIconClass(location.pathname.startsWith('/organizations'))} />
                    <span>机构管理</span>
                  </div>
                </Link>
              )}

              {access?.isSuperAdmin && (
                <Link to="/global-view" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/global-view'))}>
                  <div className="flex items-center gap-3">
                    <Shield className={navIconClass(location.pathname.startsWith('/global-view'))} />
                    <span>全局查看</span>
                  </div>
                </Link>
              )}

              {/* Branch Specific Routes */}
              {!isHQ && !access?.isSuperAdmin && !access?.isDigitalAdmin && (
                <>
                  <Link to="/fill" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/fill'))}>
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className={navIconClass(location.pathname.startsWith('/fill'))} />
                      <span>报表填报</span>
                    </div>
                  </Link>

                  <Link to="/approvals" onClick={() => setMobileMenuOpen(false)} className={navLinkClass(location.pathname.startsWith('/approvals'))}>
                    <div className="flex items-center gap-3">
                      <CheckSquare className={navIconClass(location.pathname.startsWith('/approvals'))} />
                      <span>审批中心</span>
                    </div>
                    {pendingCount > 0 && (
                      <span className="text-[#9F2F2D] bg-[#FDEBEC] text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* Quick Info Footer */}
          <div className="p-4 space-y-1" style={{ borderTop: '1px solid var(--hairline)' }}>
            <div className="text-[11px] font-semibold text-ink">随手报 ReportNow v0.1.0</div>
            <div className="text-[10px] text-faint">系统状态: 本地 MySQL 运行正常</div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          {outlet ? React.cloneElement(outlet, { key: user?.username || 'guest' }) : <Outlet />}
        </main>
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ background: 'rgba(0,0,0,0.2)' }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Help drawer — 顶部栏固定入口，全页面可用 */}
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} user={user} />
    </div>
  );
};
