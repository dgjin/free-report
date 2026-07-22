import {
  UserInfo,
  Company,
  ReportTemplate,
  ReportTemplateField,
  ReportAssignment,
  ReportSubmissionDetail,
  PendingApprovalTask,
  AggregationResponse,
} from '../types';

const TOKEN_KEY = 'free_report_token';
const USER_KEY = 'free_report_user';

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
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      removeToken();
      window.location.href = '/login';
    }
    throw new Error(data.error || '请求服务出现异常');
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
  async getCompanies(): Promise<Company> {
    return request<Company>('/api/companies');
  },

  async getBranches(): Promise<Company[]> {
    return request<Company[]>('/api/companies/branches');
  },

  // Templates
  async getTemplates(): Promise<ReportTemplate[]> {
    return request<ReportTemplate[]>('/api/templates');
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

  async updateTemplate(id: number, data: Partial<ReportTemplate>): Promise<ReportTemplate> {
    return request<ReportTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
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

  async assignTemplate(
    templateId: number,
    company_ids: number[],
    title: string,
    period_label: string,
    deadline: string
  ): Promise<{ message: string; assignments: ReportAssignment[] }> {
    return request(`/api/templates/${templateId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ company_ids, title, period_label, deadline }),
    });
  },

  // Assignments
  async getAssignments(): Promise<ReportAssignment[]> {
    return request<ReportAssignment[]>('/api/assignments');
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

  async getSubmissionByAssignment(assignmentId: number): Promise<ReportSubmissionDetail> {
    return request<ReportSubmissionDetail>(`/api/submissions/by-assignment/${assignmentId}`);
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
  async getAggregationByTemplate(templateId: number): Promise<AggregationResponse> {
    return request<AggregationResponse>(`/api/aggregations/by-template/${templateId}`);
  },

  async triggerAssignmentAggregation(assignmentId: number): Promise<{ message: string; aggregation: any }> {
    return request(`/api/aggregations/aggregate/${assignmentId}`, {
      method: 'POST',
    });
  },

  async getAggregationHistory(templateId: number): Promise<any[]> {
    return request<any[]>(`/api/aggregations/history/${templateId}`);
  },
};
