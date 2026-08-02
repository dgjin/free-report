import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { toast, confirmDialog, promptDialog } from '../utils/toast';
import type { Company, CompanyTreeNode, User, Role } from '../types';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit,
  Power,
  UserCheck,
  X,
  Save,
} from '../components/icons';

const levelLabels: Record<string, string> = {
  headquarter: '总部',
  department: '部门',
  branch: '分公司',
};

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: 'department_report_admin', label: '部门报表管理员' },
  { value: 'digital_admin', label: '数智化转型办公室' },
  { value: 'branch_admin', label: '分公司管理员' },
  { value: 'handler', label: '经办人' },
  { value: 'reviewer', label: '复核人' },
  { value: 'approver', label: '审批人' },
];

const roleLabels: Record<string, string> = Object.fromEntries(roleOptions.map(r => [r.value, r.label]));

export const OrganizationManagement: React.FC = () => {
  const [tree, setTree] = useState<CompanyTreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [createCompanyParent, setCreateCompanyParent] = useState<Company | null>(null);
  const [createUserCompany, setCreateUserCompany] = useState<Company | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);

  const loadTree = useCallback(async () => {
    try {
      const data = await api.getCompanyTree();
      setTree(data);
      if (data?.id) {
        setSelectedId(data.id);
        setExpanded(prev => new Set([...prev, data.id]));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  const loadUsers = useCallback(async (companyId: number) => {
    setUsersLoading(true);
    try {
      const data = await api.getUsersByCompany(companyId);
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadUsers(selectedId);
    else setUsers([]);
  }, [selectedId, loadUsers]);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedNode = tree ? findNodeById(tree, selectedId) : null;

  const handleDisable = async (c: Company) => {
    if (await confirmDialog(`确认停用 ${c.name}？停用后该机构下用户将无法登录。`)) {
      try {
        await api.disableCompany(c.id);
        toast('机构已停用', 'success');
        await loadTree();
        if (selectedId === c.id) loadUsers(c.id);
      } catch (err: any) {
        toast(err.message || '停用失败', 'error');
      }
    }
  };

  const handleEnable = async (c: Company) => {
    try {
      await api.enableCompany(c.id);
      toast('机构已启用', 'success');
      await loadTree();
    } catch (err: any) {
      toast(err.message || '启用失败', 'error');
    }
  };

  const handleCreateCompany = async (name: string, code: string, level: string) => {
    if (!createCompanyParent) return;
    try {
      await api.createCompany({ name, code, parent_id: createCompanyParent.id, level } as any);
      toast('机构创建成功', 'success');
      setCreateCompanyParent(null);
      await loadTree();
      setExpanded(prev => new Set([...prev, createCompanyParent.id]));
    } catch (err: any) {
      toast(err.message || '创建失败', 'error');
    }
  };

  const handleEditCompany = async (name: string, code: string, address: string, contact: string, phone: string) => {
    if (!editCompany) return;
    try {
      await api.updateCompany(editCompany.id, { name, code, address, contact, phone } as any);
      toast('机构信息已更新', 'success');
      setEditCompany(null);
      await loadTree();
      if (selectedId) loadUsers(selectedId);
    } catch (err: any) {
      toast(err.message || '更新失败', 'error');
    }
  };

  const handleCreateUser = async (username: string, displayName: string, role: string) => {
    if (!createUserCompany) return;
    try {
      await api.createUser({ username, display_name: displayName, company_id: createUserCompany.id, role });
      toast('用户创建成功，默认密码 123456', 'success');
      setCreateUserCompany(null);
      if (selectedId) loadUsers(selectedId);
    } catch (err: any) {
      toast(err.message || '创建失败', 'error');
    }
  };

  const handleResetPassword = async (u: User) => {
    if (await confirmDialog(`确认重置 ${u.display_name} 的密码为默认密码 123456？`)) {
      try {
        await api.resetPassword(u.id);
        toast('密码已重置为 123456', 'success');
      } catch (err: any) {
        toast(err.message || '重置失败', 'error');
      }
    }
  };

  const handleToggleUserStatus = async (u: User) => {
    const action = u.status === 'active' ? '停用' : '启用';
    if (await confirmDialog(`确认${action}用户 ${u.display_name}？`)) {
      try {
        await api.toggleUserStatus(u.id, u.status === 'active' ? 'inactive' : 'active');
        toast(`用户已${action}`, 'success');
        if (selectedId) loadUsers(selectedId);
      } catch (err: any) {
        toast(err.message || `${action}失败`, 'error');
      }
    }
  };

  const handleUpdateUserRole = async (u: User, companyId: number, role: string) => {
    try {
      await api.updateUserOrganizationRole(u.id, companyId, role);
      toast('用户角色已更新', 'success');
      setEditUser(null);
      if (selectedId) loadUsers(selectedId);
    } catch (err: any) {
      toast(err.message || '更新失败', 'error');
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-[13px] text-mute">正在加载机构数据...</div>;
  }

  return (
    <div className="reveal max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-6">
      {/* Page header */}
      <div>
        <h1 className="t-serif text-[32px] text-ink">机构与用户管理</h1>
        <p className="text-[13px] text-mute mt-1.5 leading-relaxed">维护机构树形结构与用户配置。</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-[clamp(20px,3vw,32px)]">
        {/* Left: Organization Tree */}
        <section className="bg-white rounded-[12px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <Building2 className="w-4 h-4 text-ink" />
              <span>机构树</span>
            </h2>
          </div>
          <div className="py-2 max-h-[600px] overflow-y-auto">
            {tree && (
              <CompanyTreeNodeView
                node={tree}
                expanded={expanded}
                selectedId={selectedId}
                level={0}
                onToggle={toggleExpand}
                onSelect={setSelectedId}
                onAdd={setCreateCompanyParent}
                onEdit={setEditCompany}
                onDisable={handleDisable}
                onEnable={handleEnable}
              />
            )}
          </div>
        </section>

        {/* Right: Details + Users */}
        <div className="space-y-[clamp(20px,3vw,32px)]">
          {selectedNode ? (
            <>
              {/* Company Details */}
              <section className="bg-white rounded-[12px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
                <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-bold text-ink">{selectedNode.name}</h2>
                    <div className="flex items-center gap-2">
                      {selectedNode.level !== 'headquarter' && (
                        <button
                          onClick={() => setCreateCompanyParent(selectedNode)}
                          className="h-8 px-3 text-[12px] font-semibold text-ink bg-canvas hover:bg-line rounded-full transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>新增子机构</span>
                        </button>
                      )}
                      <button
                        onClick={() => setEditCompany(selectedNode)}
                        className="h-8 px-3 text-[12px] font-semibold text-ink bg-canvas hover:bg-line rounded-full transition-colors flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>编辑</span>
                      </button>
                      {selectedNode.level !== 'headquarter' && (
                        selectedNode.status === 'active' ? (
                          <button
                            onClick={() => handleDisable(selectedNode)}
                            className="h-8 px-3 text-[12px] font-semibold text-[#9F2F2D] hover:bg-[#FDEBEC] rounded-full transition-colors flex items-center gap-1"
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>停用</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEnable(selectedNode)}
                            className="h-8 px-3 text-[12px] font-semibold text-ink bg-canvas hover:bg-line rounded-full transition-colors flex items-center gap-1"
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>启用</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
                <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <DetailField label="机构编码" value={selectedNode.code} />
                  <DetailField label="层级" value={levelLabels[selectedNode.level] || selectedNode.level} />
                  <DetailField label="状态" value={selectedNode.status === 'active' ? '启用' : '停用'} />
                  <DetailField label="联系人" value={selectedNode.contact || '-'} />
                  <DetailField label="电话" value={selectedNode.phone || '-'} />
                  <DetailField label="地址" value={selectedNode.address || '-'} />
                </div>
              </section>

              {/* User List */}
              <section className="bg-white rounded-[12px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
                <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-ink" />
                    <h2 className="text-[14px] font-semibold text-ink">用户列表</h2>
                    <span className="text-[12px] text-mute tabular-nums">{users.length} 人</span>
                  </div>
                  <button
                    onClick={() => setCreateUserCompany(selectedNode)}
                    className="h-8 px-4 text-[12px] font-semibold text-white bg-ink hover:bg-inkhover rounded-full transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增用户</span>
                  </button>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {usersLoading ? (
                    <div className="py-12 text-center text-[13px] text-mute">加载中...</div>
                  ) : users.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-mute">该机构下暂无用户</div>
                  ) : (
                    users.map(u => (
                      <div key={u.id} className="apple-row px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] text-white shrink-0" style={{ background: 'var(--grad-cta)' }}>
                            {u.display_name?.charAt(0) || 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-ink truncate">{u.display_name}</div>
                            <div className="text-[11px] text-mute">{u.username} · {roleLabels[u.role] || u.role}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${u.status === 'active' ? 'bg-canvas text-ink' : 'bg-[#FDEBEC] text-[#9F2F2D]'}`}>
                            {u.status === 'active' ? '正常' : '停用'}
                          </span>
                          <button
                            onClick={() => setEditUser(u)}
                            className="p-1.5 text-mute hover:text-ink hover:bg-canvas rounded-[6px] transition-colors"
                            title="修改角色"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleResetPassword(u)}
                            className="p-1.5 text-mute hover:text-ink hover:bg-canvas rounded-[6px] transition-colors"
                            title="重置密码"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleUserStatus(u)}
                            className="p-1.5 text-mute hover:text-ink hover:bg-canvas rounded-[6px] transition-colors"
                            title={u.status === 'active' ? '停用' : '启用'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="bg-white rounded-[12px] py-16 text-center" style={{ boxShadow: 'var(--sh-panel)' }}>
              <Building2 className="w-10 h-10 text-line mx-auto mb-3" />
              <div className="text-[14px] font-medium text-ink">请从左侧选择机构</div>
              <p className="text-[12px] text-mute mt-1">选择机构后可查看详情和用户</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Company Modal */}
      {editCompany && (
        <EditCompanyModal
          company={editCompany}
          onSave={handleEditCompany}
          onClose={() => setEditCompany(null)}
        />
      )}

      {/* Create Company Modal */}
      {createCompanyParent && (
        <CreateCompanyModal
          parent={createCompanyParent}
          onSave={handleCreateCompany}
          onClose={() => setCreateCompanyParent(null)}
        />
      )}

      {/* Create User Modal */}
      {createUserCompany && (
        <CreateUserModal
          company={createUserCompany}
          onSave={handleCreateUser}
          onClose={() => setCreateUserCompany(null)}
        />
      )}

      {/* Edit User Role Modal */}
      {editUser && (
        <EditUserModal
          user={editUser}
          companies={tree ? flattenTree(tree) : []}
          onSave={handleUpdateUserRole}
          onClose={() => setEditUser(null)}
        />
      )}
    </div>
  );
};

// --- Tree Node ---

const CompanyTreeNodeView: React.FC<{
  node: CompanyTreeNode;
  expanded: Set<number>;
  selectedId: number | null;
  level: number;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onAdd: (c: Company) => void;
  onEdit: (c: Company) => void;
  onDisable: (c: Company) => void;
  onEnable: (c: Company) => void;
}> = ({ node, expanded, selectedId, level, onToggle, onSelect, onAdd, onEdit, onDisable, onEnable }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isInactive = node.status === 'inactive';

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-colors ${
          isSelected ? 'bg-canvas' : 'hover:bg-canvas'
        }`}
        style={{ paddingLeft: `${12 + level * 20}px` }}
        onClick={() => onSelect(node.id)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
          className="w-4 h-4 flex items-center justify-center shrink-0"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3 h-3 text-mute" /> : <ChevronRight className="w-3 h-3 text-mute" />
          ) : null}
        </button>
        <Building2 className={`w-3.5 h-3.5 shrink-0 ${isInactive ? 'text-faint' : 'text-ink'}`} />
        <span className={`text-[13px] truncate flex-1 ${isInactive ? 'text-faint line-through' : isSelected ? 'text-ink font-semibold' : 'text-body'}`}>
          {node.name}
        </span>
        <span className="text-[10px] text-faint shrink-0">{levelLabels[node.level]}</span>
        {isInactive && <span className="text-[9px] text-[#9F2F2D] bg-[#FDEBEC] px-1.5 py-0.5 rounded-full shrink-0">停用</span>}
      </div>

      {hasChildren && isExpanded && node.children!.map(child => (
        <CompanyTreeNodeView
          key={child.id}
          node={child}
          expanded={expanded}
          selectedId={selectedId}
          level={level + 1}
          onToggle={onToggle}
          onSelect={onSelect}
          onAdd={onAdd}
          onEdit={onEdit}
          onDisable={onDisable}
          onEnable={onEnable}
        />
      ))}
    </div>
  );
};

// --- Helper Components ---

const DetailField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[11px] text-mute font-medium">{label}</div>
    <div className="text-[13px] text-ink mt-0.5">{value}</div>
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.32)' }}>
    <div className="bg-white rounded-[12px] max-w-md w-full" style={{ boxShadow: 'var(--sh-overlay)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full text-mute hover:text-ink hover:bg-canvas transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  </div>
);

const Input: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="text-[12px] font-medium text-mute block mb-1.5">{label}</label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-11 px-4 bg-canvas rounded-[8px] text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white transition-colors"
    />
  </div>
);

const EditCompanyModal: React.FC<{
  company: Company;
  onSave: (name: string, code: string, address: string, contact: string, phone: string) => void;
  onClose: () => void;
}> = ({ company, onSave, onClose }) => {
  const [name, setName] = useState(company.name);
  const [code, setCode] = useState(company.code);
  const [address, setAddress] = useState(company.address || '');
  const [contact, setContact] = useState(company.contact || '');
  const [phone, setPhone] = useState(company.phone || '');

  return (
    <Modal title="编辑机构信息" onClose={onClose}>
      <div className="space-y-4">
        <Input label="机构名称" value={name} onChange={setName} />
        <Input label="机构编码" value={code} onChange={setCode} />
        <Input label="联系人" value={contact} onChange={setContact} />
        <Input label="电话" value={phone} onChange={setPhone} />
        <Input label="地址" value={address} onChange={setAddress} />
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-10 px-5 text-[13px] font-semibold text-mute hover:text-ink transition-colors">取消</button>
          <button
            onClick={() => onSave(name, code, address, contact, phone)}
            disabled={!name.trim() || !code.trim()}
            className="h-10 px-5 bg-ink hover:bg-inkhover text-white text-[13px] font-semibold rounded-[8px] transition-colors disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
};

const CreateCompanyModal: React.FC<{
  parent: Company;
  onSave: (name: string, code: string, level: string) => void;
  onClose: () => void;
}> = ({ parent, onSave, onClose }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [level, setLevel] = useState(parent.level === 'headquarter' ? 'department' : 'branch');

  const levelChoices = parent.level === 'headquarter'
    ? [{ value: 'department', label: '部门' }, { value: 'branch', label: '分公司' }]
    : [{ value: 'branch', label: '分公司' }];

  return (
    <Modal title={`新增子机构 — ${parent.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Input label="机构名称" value={name} onChange={setName} placeholder="请输入机构名称" />
        <Input label="机构编码" value={code} onChange={setCode} placeholder="唯一编码，如 HQ-FINANCE" />
        <div>
          <label className="text-[12px] font-medium text-mute block mb-1.5">机构层级</label>
          <select
            value={level}
            onChange={e => setLevel(e.target.value)}
            className="w-full h-11 px-4 bg-canvas rounded-[8px] text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white"
          >
            {levelChoices.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-10 px-5 text-[13px] font-semibold text-mute hover:text-ink transition-colors">取消</button>
          <button
            onClick={() => onSave(name, code, level)}
            disabled={!name.trim() || !code.trim()}
            className="h-10 px-5 bg-ink hover:bg-inkhover text-white text-[13px] font-semibold rounded-[8px] transition-colors disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </Modal>
  );
};

const CreateUserModal: React.FC<{
  company: Company;
  onSave: (username: string, displayName: string, role: string) => void;
  onClose: () => void;
}> = ({ company, onSave, onClose }) => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState(company.level === 'branch' ? 'handler' : 'department_report_admin');

  // 按机构层级过滤可用角色：总部仅管理类，部门含经办/复核/审批，分公司含分公司管理员+经办/复核/审批
  const availableRoles = company.level === 'branch'
    ? roleOptions.filter(r => ['branch_admin', 'handler', 'reviewer', 'approver'].includes(r.value))
    : company.level === 'department'
      ? roleOptions.filter(r => ['department_report_admin', 'digital_admin', 'handler', 'reviewer', 'approver'].includes(r.value))
      : roleOptions.filter(r => ['department_report_admin', 'digital_admin'].includes(r.value));

  return (
    <Modal title={`新增用户 — ${company.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Input label="用户名" value={username} onChange={setUsername} placeholder="登录用户名" />
        <Input label="姓名" value={displayName} onChange={setDisplayName} placeholder="显示姓名" />
        <div>
          <label className="text-[12px] font-medium text-mute block mb-1.5">角色</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full h-11 px-4 bg-canvas rounded-[8px] text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white"
          >
            {availableRoles.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-mute">默认密码: 123456，用户首次登录后可自行修改。</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-10 px-5 text-[13px] font-semibold text-mute hover:text-ink transition-colors">取消</button>
          <button
            onClick={() => onSave(username, displayName, role)}
            disabled={!username.trim() || !displayName.trim()}
            className="h-10 px-5 bg-ink hover:bg-inkhover text-white text-[13px] font-semibold rounded-[8px] transition-colors disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </Modal>
  );
};

const EditUserModal: React.FC<{
  user: User;
  companies: Company[];
  onSave: (u: User, companyId: number, role: string) => void;
  onClose: () => void;
}> = ({ user, companies, onSave, onClose }) => {
  const [companyId, setCompanyId] = useState(user.company_id);
  const [role, setRole] = useState(user.role);

  const selectedCompany = companies.find(c => c.id === Number(companyId));
  const availableRoles = selectedCompany?.level === 'branch'
    ? roleOptions.filter(r => ['branch_admin', 'handler', 'reviewer', 'approver'].includes(r.value))
    : selectedCompany?.level === 'department'
      ? roleOptions.filter(r => ['department_report_admin', 'digital_admin', 'handler', 'reviewer', 'approver'].includes(r.value))
      : roleOptions.filter(r => ['department_report_admin', 'digital_admin'].includes(r.value));

  return (
    <Modal title="修改用户机构与角色" onClose={onClose}>
      <div className="space-y-4">
        <div className="text-[13px] text-mute">
          用户: <span className="font-semibold text-ink">{user.display_name}</span> ({user.username})
        </div>
        <div>
          <label className="text-[12px] font-medium text-mute block mb-1.5">所属机构</label>
          <select
            value={companyId}
            onChange={e => setCompanyId(Number(e.target.value))}
            className="w-full h-11 px-4 bg-canvas rounded-[8px] text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white"
          >
            {companies.map(c => <option key={c.id} value={c.id}>{c.name} ({levelLabels[c.level]})</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-medium text-mute block mb-1.5">角色</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as Role)}
            className="w-full h-11 px-4 bg-canvas rounded-[8px] text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white"
          >
            {availableRoles.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-10 px-5 text-[13px] font-semibold text-mute hover:text-ink transition-colors">取消</button>
          <button
            onClick={() => onSave(user, Number(companyId), role)}
            className="h-10 px-5 bg-ink hover:bg-inkhover text-white text-[13px] font-semibold rounded-[8px] transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
};

// --- Utils ---

function findNodeById(tree: CompanyTreeNode, id: number | null): CompanyTreeNode | null {
  if (id === null) return null;
  if (tree.id === id) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

function flattenTree(tree: CompanyTreeNode): Company[] {
  const result: Company[] = [tree];
  if (tree.children) {
    for (const child of tree.children) {
      result.push(...flattenTree(child));
    }
  }
  return result;
}
