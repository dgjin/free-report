import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Company } from '../types';

export const OrganizationManagement: React.FC = () => {
  const [targets, setTargets] = useState<Company[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const load = () => Promise.all([api.getAssignmentTargets(), api.getUsers()]).then(([c, u]) => { setTargets(c); setUsers(u); });
  useEffect(() => { load(); }, []);
  const createDepartment = async () => {
    const name = prompt('请输入总部部门名称')?.trim(); if (!name) return;
    const code = prompt('请输入唯一部门编码（例如 HQ-AUDIT）')?.trim(); if (!code) return;
    const parent_id = targets.find(item => item.level === 'department')?.parent_id;
    if (!parent_id) return alert('未找到总部根机构');
    await api.createCompany({ name, code, parent_id, level: 'department' }); await load();
  };
  const updateUser = async (user: any, companyId: number, role: string) => {
    await api.updateUserOrganizationRole(user.id, companyId, role); await load();
  };
  return <div className="space-y-6"><h1 className="text-xl font-bold">机构与部门管理员</h1>
    <section className="bg-white rounded-xl border p-5"><div className="flex justify-between mb-3"><h2 className="font-bold">机构列表</h2><button onClick={createDepartment} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs">新增部门</button></div>{targets.map(c => <div key={c.id} className="py-2 border-b text-sm flex justify-between"><span>{c.name} · {c.level}</span><button disabled={c.status !== 'active'} onClick={async()=>{if(confirm(`确认停用${c.name}？`)){await api.disableCompany(c.id);await load();}}} className="text-rose-600 disabled:text-slate-400">{c.status==='active'?'停用':'已停用'}</button></div>)}</section>
    <section className="bg-white rounded-xl border p-5"><h2 className="font-bold mb-3">用户配置</h2>{users.map(u => <div key={u.id} className="py-2 border-b text-sm grid grid-cols-3 gap-2 items-center"><span>{u.display_name}</span><select value={u.company_id} onChange={e=>updateUser(u,Number(e.target.value),u.role)} className="border rounded p-1">{targets.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={u.role} onChange={e=>updateUser(u,u.company_id,e.target.value)} className="border rounded p-1"><option value="handler">经办人</option><option value="department_report_admin">部门报表管理员</option><option value="branch_admin">分公司管理员</option></select></div>)}</section>
  </div>;
};
