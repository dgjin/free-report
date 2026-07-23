import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Company } from '../types';

export const OrganizationManagement: React.FC = () => {
  const [targets, setTargets] = useState<Company[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const load = () => Promise.all([api.getAssignmentTargets(), api.getUsers()]).then(([c, u]) => { setTargets(c); setUsers(u); });
  useEffect(() => { load(); }, []);
  return <div className="space-y-6"><h1 className="text-xl font-bold">机构与部门管理员</h1>
    <section className="bg-white rounded-xl border p-5"><h2 className="font-bold mb-3">机构列表</h2>{targets.map(c => <div key={c.id} className="py-2 border-b text-sm flex justify-between"><span>{c.name} · {c.level}</span><span>{c.status}</span></div>)}</section>
    <section className="bg-white rounded-xl border p-5"><h2 className="font-bold mb-3">用户配置</h2>{users.map(u => <div key={u.id} className="py-2 border-b text-sm">{u.display_name} · {u.role}</div>)}</section>
  </div>;
};
