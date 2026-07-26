import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Lock, User, ArrowRight, ShieldCheck } from '../components/icons';
import { api } from '../services/api';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(import.meta.env.DEV ? '123456' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const handleLogin = async (e?: React.FormEvent, customUsername?: string) => {
    if (e) e.preventDefault();
    const u = customUsername || username;
    if (!u || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.login(u, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  const presetAccounts = import.meta.env.DEV ? [
    { username: 'admin', role: '超级管理员', company: '总部' },
    { username: 'hq_admin', role: '总部管理员', company: '业务综合管理部' },
    { username: 'office_admin', role: '总部管理员', company: '办公室' },
    { username: 'risk_admin', role: '总部管理员', company: '风险管理部' },
    { username: 'bj_handler', role: '经办人', company: '北京分公司' },
    { username: 'bj_reviewer', role: '复核人', company: '北京分公司' },
    { username: 'bj_approver', role: '审批人', company: '北京分公司' },
    { username: 'sh_handler', role: '经办人', company: '上海分公司' },
  ] : [];

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      {/* Ambient warm light spots — whisper-quiet depth */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(640px 420px at 72% 8%, rgba(149,100,0,0.035), transparent 70%), radial-gradient(560px 400px at 12% 88%, rgba(31,108,159,0.03), transparent 70%)',
        }}
      />
      <div className="max-w-[420px] w-full relative">
        {/* Brand hero — editorial centered type */}
        <div className="mount-rise text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-[12px] mb-5"
            style={{ background: 'var(--grad-cta)', boxShadow: 'var(--sh-cta)' }}
          >
            <FileSpreadsheet className="w-7 h-7 text-white" />
          </div>
          <h1 className="t-serif text-[36px] text-ink leading-[1.1]">随手报</h1>
          <p className="text-[13px] text-mute mt-2.5 leading-[1.7]">
            企业级下发填报、三级在线审批与数据多维汇总平台
          </p>
        </div>

        {/* Login card — single white surface */}
        <div
          className="mount-rise bg-white rounded-[12px] p-8"
          style={{ boxShadow: 'var(--sh-panel)', animationDelay: '90ms' }}
        >
          {error && (
            <div
              className="px-3.5 py-2.5 rounded-[8px] text-[12px] font-medium text-[#9F2F2D] mb-5"
              style={{ background: '#FDEBEC' }}
            >
              {error}
            </div>
          )}

          <form onSubmit={(e) => handleLogin(e)} className="space-y-5">
            <div>
              <label className="block text-[13px] font-semibold text-ink mb-2">
                账号
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="例如: admin 或 bj_handler"
                  className="w-full h-11 pl-10 pr-4 bg-canvas rounded-[12px] text-[14px] text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-ink mb-2">
                密码{import.meta.env.DEV ? ' (开发环境默认: 123456)' : ''}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密码"
                  className="w-full h-11 pl-10 pr-4 bg-canvas rounded-[12px] text-[14px] text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-ink hover:bg-inkhover text-white font-semibold rounded-md text-[14px] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? '正在验证身份...' : '立即登录'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Preset accounts — unified panel list with hairlines */}
          {import.meta.env.DEV && (
            <div className="mt-7 pt-6" style={{ borderTop: '1px solid var(--hairline)' }}>
              <div className="flex items-center justify-between text-[12px] font-semibold text-mute mb-3">
                <span>预设体验账号 (点击一键登录)</span>
                <ShieldCheck className="w-3.5 h-3.5 text-ink" />
              </div>

              <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
                {presetAccounts.map((acc, idx) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => {
                      setUsername(acc.username);
                      handleLogin(undefined, acc.username);
                    }}
                    className="apple-row w-full text-left px-3.5 py-2.5 hover:bg-canvas transition-colors flex items-center justify-between"
                    style={idx > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-ink">{acc.company}</div>
                      <div className="text-[11px] text-faint tabular-nums">
                        {acc.username} · {acc.role}
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-line" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="t-mono text-center text-[10px] uppercase tracking-[0.08em] text-faint mt-6">
          随手报 ReportNow v0.1.0 · 安全连接
        </p>
      </div>
    </div>
  );
};
