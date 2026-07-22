import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Lock, User, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const handleLogin = async (e?: React.FormEvent, customUsername?: string) => {
    if (e) e.preventDefault();
    const u = customUsername || username;
    if (!u) {
      setError('请输入用户名');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.login(u, password || '123456');
      navigate('/');
    } catch (err: any) {
      setError(err.message || '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  const presetAccounts = [
    { username: 'admin', role: '超级管理员', company: '总部', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
    { username: 'hq_admin', role: '总部管理员', company: '总部', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { username: 'bj_handler', role: '经办人', company: '北京分公司', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { username: 'bj_reviewer', role: '复核人', company: '北京分公司', color: 'bg-amber-50 border-amber-200 text-amber-700' },
    { username: 'bj_approver', role: '审批人', company: '北京分公司', color: 'bg-rose-50 border-rose-200 text-rose-700' },
    { username: 'sh_handler', role: '经办人', company: '上海分公司', color: 'bg-teal-50 border-teal-200 text-teal-700' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header Branding */}
        <div className="bg-slate-900 p-8 text-center text-white relative">
          <div className="inline-flex p-3 rounded-xl bg-indigo-600 text-white mb-3 shadow-sm">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">自由报表 FreeReport</h1>
          <p className="text-xs text-slate-400 mt-1.5">
            企业级下发填报、三级在线审批与数据多维汇总平台
          </p>
        </div>

        {/* Login Form */}
        <div className="p-8 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                账号 / 用户名
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="例如: admin 或 bj_handler"
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                密码 (默认: 123456)
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密码"
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-xs transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <span>{loading ? '正在验证身份...' : '立即登录'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Preset Account Selector */}
          <div className="pt-6 border-t border-slate-200/80">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-3">
              <span>预设体验账号 (点击一键登录)</span>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {presetAccounts.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => {
                    setUsername(acc.username);
                    handleLogin(undefined, acc.username);
                  }}
                  className={`p-2.5 text-left rounded-xl border text-xs transition-all hover:border-slate-300 ${acc.color}`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{acc.company}</span>
                    <CheckCircle2 className="w-3 h-3 opacity-60" />
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    {acc.username} ({acc.role})
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
