import useSWR from 'swr';
import {
  UserInfo,
  Company,
  CompanyTreeNode,
  User,
  ReportTemplate,
  ReportTemplateField,
  ReportAssignment,
  ReportSubmissionDetail,
  PendingApprovalTask,
  PendingReceipt,
  AggregationResponse,
  TemplateApproval,
  RejectedReminder,
  TemplateSchedule,
  TemplateScheduleSaveBody,
  ScheduleRunResult,
  DataImportRowPayload,
  DataImportResult,
} from '../types';
import type { AiQueryResponse } from '../utils/aiQuery';

const TOKEN_KEY = 'free_report_token';
const USER_KEY = 'free_report_user';

export type TemplateMetadataUpdate = Partial<Pick<ReportTemplate, 'name' | 'description' | 'period_type'>>;

/** 分页接口统一响应封装（后端 ?page=&size= 参数启用） */
export interface PagedResponse<T> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): UserInfo | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserInfo) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  // 滑动过期：后端在 token 临近过期时通过响应头下发新 token，无感替换避免使用中掉线
  const refreshedToken = res.headers.get('X-Refreshed-Token');
  if (refreshedToken) {
    setToken(refreshedToken);
  }
  // 兼容空响应体（void/204/null 返回），避免 res.json() 抛出 Unexpected end of JSON input
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) throw new Error(`服务返回异常 (HTTP ${res.status})`);
      return text as unknown as T;
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      removeToken();
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    throw new Error(data?.error || '请求服务出现异常');
  }

  return data as T;
}

export const api = {
  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: UserInfo }> {
    const data = await request<{ token: string; user: UserInfo }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    setStoredUser(data.user);
    return data;
  },

  async getMe(): Promise<{ user: UserInfo }> {
    return request<{ user: UserInfo }>('/api/auth/me');
  },

  // Companies
  async getCompanyTree(): Promise<CompanyTreeNode> {
    return request<CompanyTreeNode>('/api/companies');
  },

  async getBranches(): Promise<Company[]> {
    return request<Company[]>('/api/companies/branches');
  },

  async getAssignmentTargets(): Promise<Company[]> { return request('/api/companies/targets'); },
  async createCompany(data: Partial<Company>): Promise<Company> {
    return request('/api/companies', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateCompany(id: number, data: Partial<Company>): Promise<Company> {
    return request(`/api/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async disableCompany(id: number): Promise<Company> { return request(`/api/companies/${id}/disable`, { method: 'PUT' }); },
  async enableCompany(id: number): Promise<Company> { return request(`/api/companies/${id}/enable`, { method: 'PUT' }); },
  async getUsers(): Promise<User[]> { return request('/api/users'); },
  async getUsersByCompany(companyId: number): Promise<User[]> { return request(`/api/users/by-company/${companyId}`); },
  async createUser(data: { username: string; display_name: string; company_id: number; role: string }): Promise<User> {
    return request('/api/users', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateUserOrganizationRole(id: number, company_id: number, role: string): Promise<User> {
    return request(`/api/users/${id}/organization-role`, { method: 'PUT', body: JSON.stringify({ company_id, role }) });
  },
  async resetPassword(id: number): Promise<{ message: string }> {
    return request(`/api/users/${id}/password`, { method: 'PUT' });
  },
  async toggleUserStatus(id: number, status: string): Promise<User> {
    return request(`/api/users/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  },
  async getPendingReceipts(): Promise<PendingReceipt[]> { return request('/api/receipts/pending'); },

  // Reminders
  async getRejectedReminders(): Promise<RejectedReminder[]> { return request('/api/reminders/rejected'); },
  async processReceipt(id: number, action: 'received' | 'returned', comment = ''): Promise<any> {
    return request(`/api/receipts/${id}/action`, { method: 'POST', body: JSON.stringify({ action, comment }) });
  },

  // Templates
  async getTemplates(): Promise<ReportTemplate[]> {
    return request<ReportTemplate[]>('/api/templates');
  },

  async getTemplatesPaged(page = 1, size = 20): Promise<PagedResponse<ReportTemplate>> {
    return request<PagedResponse<ReportTemplate>>(`/api/templates?page=${page}&size=${size}`);
  },

  async getTemplateDetail(id: number): Promise<ReportTemplate> {
    return request<ReportTemplate>(`/api/templates/${id}`);
  },

  async createTemplate(data: {
    name: string;
    description?: string;
    period_type: string;
    fields: Partial<ReportTemplateField>[];
  }): Promise<{ template: ReportTemplate; fields: ReportTemplateField[] }> {
    return request('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTemplate(id: number, data: TemplateMetadataUpdate): Promise<ReportTemplate> {
    return request<ReportTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async disableTemplate(id: number): Promise<{ message: string; template: ReportTemplate }> {
    return request(`/api/templates/${id}/disable`, {
      method: 'PUT',
    });
  },

  async enableTemplate(id: number): Promise<{ message: string; template: ReportTemplate }> {
    return request(`/api/templates/${id}/enable`, {
      method: 'PUT',
    });
  },

  async addField(templateId: number, field: Partial<ReportTemplateField>): Promise<ReportTemplateField> {
    return request<ReportTemplateField>(`/api/templates/${templateId}/fields`, {
      method: 'POST',
      body: JSON.stringify(field),
    });
  },

  async disableField(templateId: number, fieldId: number): Promise<{ message: string; field: ReportTemplateField }> {
    return request(`/api/templates/${templateId}/fields/${fieldId}/disable`, {
      method: 'PUT',
    });
  },

  /** 更新字段（仅设计阶段未下发前允许，后端守卫） */
  async updateField(
    templateId: number,
    fieldId: number,
    field: Partial<ReportTemplateField>,
  ): Promise<{ message: string; field: ReportTemplateField }> {
    return request(`/api/templates/${templateId}/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify(field),
    });
  },

  /** 物理删除字段（仅设计阶段未下发前允许，后端守卫） */
  async deleteField(templateId: number, fieldId: number): Promise<{ message: string; field: ReportTemplateField }> {
    return request(`/api/templates/${templateId}/fields/${fieldId}`, {
      method: 'DELETE',
    });
  },

  async addMatrixFields(
    templateId: number,
    data: { row_label: string; row_options: string[]; columns: Array<{ field_name: string; field_label: string; field_type: string }> },
  ): Promise<{ message: string; fields: ReportTemplateField[] }> {
    return request(`/api/templates/${templateId}/matrix-fields`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async assignTemplate(
    templateId: number,
    company_ids: number[],
    title: string,
    period_label: string,
    deadline: string,
    is_one_time = false,
  ): Promise<{ message: string; assignments: ReportAssignment[] }> {
    return request(`/api/templates/${templateId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ company_ids, title, period_label, deadline, is_one_time }),
    });
  },

  async recallAssignment(id: number, reason: string): Promise<{ message: string; assignment: ReportAssignment }> {
    return request(`/api/assignments/${id}/recall`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Template Schedules（周期自动下发计划）
  async getTemplateSchedule(id: number): Promise<TemplateSchedule> {
    return request<TemplateSchedule>(`/api/templates/${id}/schedule`);
  },
  async saveTemplateSchedule(
    id: number,
    body: TemplateScheduleSaveBody,
  ): Promise<{ message: string; schedule: TemplateSchedule }> {
    return request(`/api/templates/${id}/schedule`, { method: 'PUT', body: JSON.stringify(body) });
  },
  async runTemplateSchedule(id: number): Promise<ScheduleRunResult> {
    return request(`/api/templates/${id}/schedule/run`, { method: 'POST' });
  },

  // Data Import（数据初始化导入）
  async importTemplateData(
    id: number,
    body: { mode: 'archive' | 'prefill'; period_label: string; rows: DataImportRowPayload[] },
  ): Promise<DataImportResult> {
    return request(`/api/templates/${id}/data-import`, { method: 'POST', body: JSON.stringify(body) });
  },

  // Template Approvals
  async submitTemplateForApproval(templateId: number): Promise<{ message: string; template: ReportTemplate }> {
    return request(`/api/templates/${templateId}/submit-approval`, { method: 'POST' });
  },
  async getPendingTemplateApprovals(): Promise<TemplateApproval[]> {
    return request('/api/templates/pending-approvals');
  },
  async approveTemplate(templateId: number, comment?: string): Promise<{ message: string; template: ReportTemplate }> {
    return request(`/api/templates/${templateId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },
  async rejectTemplate(templateId: number, comment?: string): Promise<{ message: string; template: ReportTemplate }> {
    return request(`/api/templates/${templateId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  // Assignments
  async getAssignments(): Promise<ReportAssignment[]> {
    return request<ReportAssignment[]>('/api/assignments');
  },

  async getAssignmentsPaged(page = 1, size = 20): Promise<PagedResponse<ReportAssignment>> {
    return request<PagedResponse<ReportAssignment>>(`/api/assignments?page=${page}&size=${size}`);
  },

  async getAssignmentDetail(id: number): Promise<ReportAssignment> {
    return request<ReportAssignment>(`/api/assignments/${id}`);
  },

  // Submissions
  async saveOrSubmitReport(data: {
    assignment_id: number;
    summary: Record<string, string>;
    details: Array<Record<string, string>>;
    comment?: string;
    action: 'draft' | 'submit';
  }): Promise<{ message: string; submission: any; approvals: any }> {
    return request('/api/submissions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async submitDraft(
    submissionId: number,
    comment?: string
  ): Promise<{ message: string; submission: any }> {
    return request(`/api/submissions/${submissionId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  async getSubmissionDetail(id: number): Promise<ReportSubmissionDetail> {
    return request<ReportSubmissionDetail>(`/api/submissions/${id}`);
  },

  async getSubmissionByAssignment(assignmentId: number): Promise<ReportSubmissionDetail | null> {
    return request<ReportSubmissionDetail | null>(`/api/submissions/by-assignment/${assignmentId}`);
  },

  // Approvals
  async getPendingApprovals(): Promise<PendingApprovalTask[]> {
    return request<PendingApprovalTask[]>('/api/approvals/pending');
  },

  async processApprovalAction(
    submissionId: number,
    action: 'approved' | 'rejected',
    comment?: string
  ): Promise<{ message: string; submission: any; approval: any }> {
    return request(`/api/approvals/${submissionId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, comment }),
    });
  },

  // Aggregations
  async getAggregationByTemplate(templateId: number, periodLabel: string): Promise<AggregationResponse> {
    return request<AggregationResponse>(
      `/api/aggregations/by-template/${templateId}?period_label=${encodeURIComponent(periodLabel)}`,
    );
  },

  async triggerAssignmentAggregation(assignmentId: number): Promise<{ message: string; aggregation: any }> {
    return request(`/api/aggregations/aggregate/${assignmentId}`, {
      method: 'POST',
    });
  },

  async getAggregationHistory(templateId: number): Promise<any[]> {
    return request<any[]>(`/api/aggregations/history/${templateId}`);
  },

  // AI 智能问数
  async getAiConfig(): Promise<{ enabled: boolean }> {
    return request<{ enabled: boolean }>('/api/ai/config');
  },

  async aiQuery(
    question: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<AiQueryResponse> {
    return request<AiQueryResponse>('/api/ai/query', {
      method: 'POST',
      body: JSON.stringify({ question, history: history || [] }),
    });
  },

  /** 帮助知识库 AI 问答：基于系统帮助文档回答用户咨询 */
  async helpAiAsk(
    question: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ answer: string }> {
    return request<{ answer: string }>('/api/ai/help', {
      method: 'POST',
      body: JSON.stringify({ question, history: history || [] }),
    });
  },
};

// --- SWR hooks: client-side caching, avoids refetch on route changes ---

export const swrFetcher = <T>(url: string) => request<T>(url);

export const swrKeys = {
  templates: '/api/templates',
  assignments: '/api/assignments',
  branches: '/api/companies/branches',
  targets: '/api/companies/targets',
  pendingApprovals: '/api/approvals/pending',
  pendingTemplateApprovals: '/api/templates/pending-approvals',
  pendingReceipts: '/api/receipts/pending',
  rejectedReminders: '/api/reminders/rejected',
};

export function useTemplates() {
  return useSWR<ReportTemplate[]>(swrKeys.templates, swrFetcher, { revalidateOnFocus: false });
}

/** 分页模板列表 hook：page 变化触发重新请求 */
export function useTemplatesPaged(page: number, size = 20) {
  return useSWR<PagedResponse<ReportTemplate>>(`/api/templates?page=${page}&size=${size}`, swrFetcher, { revalidateOnFocus: false });
}

/** 分页下发任务列表 hook：page 变化触发重新请求（注意：概览统计/筛选需全量数据时请用 useAssignments） */
export function useAssignmentsPaged(page: number, size = 20) {
  return useSWR<PagedResponse<ReportAssignment>>(`/api/assignments?page=${page}&size=${size}`, swrFetcher, { revalidateOnFocus: false });
}

export function useAssignments() {
  return useSWR<ReportAssignment[]>(swrKeys.assignments, swrFetcher, { revalidateOnFocus: false });
}

export function useBranches() {
  return useSWR<Company[]>(swrKeys.branches, swrFetcher, { revalidateOnFocus: false });
}

export function useAssignmentTargets() {
  return useSWR<Company[]>(swrKeys.targets, swrFetcher, { revalidateOnFocus: false });
}

export function usePendingApprovals() {
  return useSWR<PendingApprovalTask[]>(swrKeys.pendingApprovals, swrFetcher, { revalidateOnFocus: false });
}

export function usePendingReceipts() {
  return useSWR<PendingReceipt[]>(swrKeys.pendingReceipts, swrFetcher, { revalidateOnFocus: false });
}

export function useRejectedReminders(enabled = true) {
  return useSWR<RejectedReminder[]>(enabled ? swrKeys.rejectedReminders : null, swrFetcher, { revalidateOnFocus: false });
}
