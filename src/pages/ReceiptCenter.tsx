import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export const ReceiptCenter: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const load = () => api.getPendingReceipts().then(setItems);
  useEffect(() => { load(); }, []);
  const act = async (id: number, action: 'received' | 'returned') => {
    const comment = action === 'returned' ? prompt('请输入退回原因')?.trim() || '' : '';
    if (action === 'returned' && !comment) return;
    setPendingId(id);
    try { await api.processReceipt(id, action, comment); await load(); } catch (e: any) { alert(e.message); } finally { setPendingId(null); }
  };
  return <div className="space-y-4"><h1 className="text-xl font-bold">签收中心</h1>
    {items.length === 0 ? <div className="bg-white rounded-xl border p-10 text-center text-sm text-slate-500">暂无待签收报表</div> :
      items.map(item => <div key={item.id} className="bg-white rounded-xl border p-5 flex justify-between gap-4">
        <div><div className="font-bold">{item.assignment_title}</div><div className="text-xs text-slate-500 mt-1">{item.template_name} · {item.company_name}</div></div>
        <div className="flex gap-2" aria-busy={pendingId === item.id}>
          <button disabled={pendingId !== null} onClick={() => act(item.id, 'returned')} className="px-3 py-2 border rounded-lg text-xs">退回</button>
          <button disabled={pendingId !== null} onClick={() => act(item.id, 'received')} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs">签收</button>
        </div></div>)}</div>;
};
