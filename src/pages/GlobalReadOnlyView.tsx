import React from 'react';
import { AssignmentList } from './AssignmentList';
export const GlobalReadOnlyView: React.FC = () => <div className="space-y-3"><div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">超级管理员全局只读视图：可以查看全部业务数据，但不能修改、下发、填报或签收。</div><AssignmentList /></div>;
