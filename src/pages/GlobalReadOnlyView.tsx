import React from 'react';
import { AssignmentList } from './AssignmentList';

export const GlobalReadOnlyView: React.FC = () => (
  <div className="reveal max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-5">
    <div className="bg-[rgba(17,17,17,0.06)] border border-[rgba(17,17,17,0.12)] rounded-[12px] px-5 py-4">
      <p className="text-[13px] text-body leading-relaxed">
        <span className="font-semibold text-ink">超级管理员全局只读视图：</span>
        可以查看全部业务数据，但不能修改、下发、填报或签收。
      </p>
    </div>
    <AssignmentList readOnly />
  </div>
);
