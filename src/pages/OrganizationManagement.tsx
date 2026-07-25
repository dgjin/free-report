import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { toast, confirmDialog, promptDialog } from '../utils/toast';
import type { Company } from '../types';

export const OrganizationManagement: React.FC = () => {
  const [targets, setTargets] = useState<Company[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const load = () => Promise.all([api.getAssignmentTargets(), api.getUsers()]).then(([c, u]) => { setTargets(c); setUsers(u); });
  useEffect(() => { load(); }, []);
  const createDepartment = async () => {
    const name = (await promptDialog('请输入总部部门名称'))?.trim(); if (!name) return;
    const code = (await promptDialog('请输入唯一部门编码（例如 HQ-AUDIT）'))?.trim(); if (!code) return;
    const parent_id = targets.find(item => item.level === 'department')?.parent_id;
    if (!parent_id) return toast('未找到总部根机构', 'error');
    await api.createCompany({ name, code, parent_id, level: 'department' }); await load();
  };
  const updateUser = async (user: any, companyId: number, role: string) => {
    await api.updateUserOrganizationRole(user.id, companyId, role); await load();
  };

  return (
    <div className="max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[#1d1d1f]">机构与部门管理员</h1>
        <p className="text-[13px] text-[#6e6e73] mt-1.5 leading-relaxed">维护机构层级与部门用户角色配置。</p>
      </div>

      {/* Organizations panel — unified list with hairline dividers */}
      <section className="bg-white rounded-[22px] p-6" style={{ boxShadow: 'var(--sh-panel)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#1d1d1f]">机构列表</h2>
          <button onClick={createDepartment}
            className="h-11 px-5 bg-[#0071e3] hover:bg-[#0066cc] text-white text-[13px] font-semibold rounded-full transition-colors">
            新增部门
          </button>
        </div>
        <div>
          {targets.map(c => (
            <div key={c.id} className="apple-row py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-[13px] min-w-0">
                <span className="font-semibold text-[#1d1d1f] truncate">{c.name}</span>
                <span className="text-[12px] text-[#86868b] shrink-0 tabular-nums">· {c.level}</span>
              </div>
              <button
                disabled={c.status !== 'active'}
                onClick={async () => { if (await confirmDialog(`确认停用 ${c.name}？`)) { await api.disableCompany(c.id); await load(); } }}
                className={`text-[12px] font-semibold px-3 h-8 rounded-full transition-colors ${c.status === 'active' ? 'text-[#ff6b00] hover:bg-[rgba(255,107,0,0.1)]' : 'text-[#aeaeb2] cursor-not-allowed'}`}>
                {c.status === 'active' ? '停用' : '已停用'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Users panel — unified list with hairline dividers */}
      <section className="bg-white rounded-[22px] p-6" style={{ boxShadow: 'var(--sh-panel)' }}>
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#1d1d1f] mb-4">用户配置</h2>
        <div>
          {users.map(u => (
            <div key={u.id} className="apple-row py-3.5 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <span className="text-[13px] font-semibold text-[#1d1d1f] truncate">{u.display_name}</span>
              <select value={u.company_id} onChange={e => updateUser(u, Number(e.target.value), u.role)}
                className="h-11 px-4 bg-[#f5f5f7] rounded-[12px] text-[13px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white">
                {targets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={u.role} onChange={e => updateUser(u, u.company_id, e.target.value)}
                className="h-11 px-4 bg-[#f5f5f7] rounded-[12px] text-[13px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white">
                <option value="handler">经办人</option>
                <option value="department_report_admin">部门报表管理员</option>
                <option value="branch_admin">分公司管理员</option>
              </select>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
