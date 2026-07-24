import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyAssignment, getAssignmentOverview, filterOperationAssignments, groupAssignmentProgress } from '../src/utils/reportOperations';

function mk(a: TestAssignment) {
  return a as unknown as ReportAssignment;
}

import type { ReportAssignment } from '../src/types';

// --- helpers ---

type AssignmentStatus =
  | 'pending'
  | 'filling'
  | 'submitted'
  | 'pending_receipt'
  | 'received'
  | 'returned'
  | 'aggregated'
  | 'rejected';

interface TestAssignment {
  id: number;
  template_id: number;
  template_name: string;
  company_name: string;
  company_code: string;
  period_label: string;
  deadline: string;
  status: AssignmentStatus;
}

function assignment(
  status: AssignmentStatus,
  deadline: string,
  extra?: Partial<TestAssignment>
): TestAssignment {
  return {
    id: 1,
    template_id: 1,
    template_name: 'test-template',
    company_name: '测试机构',
    company_code: 'TEST001',
    period_label: '2026-07',
    deadline,
    status,
    ...extra,
  };
}

// --- tests ---

test('classifyAssignment: received + not overdue → completed', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  assert.equal(classifyAssignment(assignment('received', '2026-07-20'), today), 'completed');
});

test('classifyAssignment: returned → abnormal', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  assert.equal(classifyAssignment(assignment('returned', '2026-07-30'), today), 'abnormal');
});

test('classifyAssignment: rejected → abnormal', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  assert.equal(classifyAssignment(assignment('rejected', '2026-07-30'), today), 'abnormal');
});

test('classifyAssignment: pending + overdue → abnormal', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  assert.equal(classifyAssignment(assignment('pending', '2026-07-20'), today), 'abnormal');
});

test('classifyAssignment: pending_receipt + future deadline → pending_receipt', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  assert.equal(classifyAssignment(assignment('pending_receipt', '2026-07-30'), today), 'pending_receipt');
});

test('classifyAssignment: filling + future deadline → pending_fill', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  assert.equal(classifyAssignment(assignment('filling', '2026-07-30'), today), 'pending_fill');
});

test('classifyAssignment: pending_receipt + overdue → abnormal', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  assert.equal(classifyAssignment(assignment('pending_receipt', '2026-07-20'), today), 'abnormal');
});

test('classifyAssignment: filling + overdue → abnormal', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  assert.equal(classifyAssignment(assignment('filling', '2026-07-20'), today), 'abnormal');
});

test('getAssignmentOverview: four buckets sum to total count', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  const list = [
    assignment('received', '2026-07-25'),
    assignment('returned', '2026-07-25'),
    assignment('pending_receipt', '2026-07-30'),
    assignment('filling', '2026-07-30'),
  ];
  const overview = getAssignmentOverview(list, today);
  assert.equal(
    Object.values(overview).reduce((s: number, n: number) => s + n, 0),
    list.length,
  );
});

test('getAssignmentOverview: no double-counting when status changes', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  const list = [
    assignment('received', '2026-07-25'),
    assignment('aggregated', '2026-07-25'),
    assignment('pending', '2026-07-20'),
    assignment('filling', '2026-07-30'),
  ];
  const overview = getAssignmentOverview(list, today);
  assert.equal(overview.completed, 2);
  assert.equal(overview.abnormal, 1);
  assert.equal(overview.pending_receipt, 0);
  assert.equal(overview.pending_fill, 1);
});

test('filterOperationAssignments: default bucket "actionable" includes abnormal + near-deadline pending_fill', () => {
  const today = new Date('2026-07-23T00:00:00+08:00');
  const list = [
    assignment('pending', '2026-07-20'),         // abnormal (overdue)
    assignment('filling', '2026-07-25'),          // pending_fill, within 3 days
    assignment('filling', '2026-08-10'),          // pending_fill, far future
    assignment('received', '2026-07-25'),         // completed
    assignment('returned', '2026-07-25'),         // abnormal
  ];
  const filtered = filterOperationAssignments(list as unknown as ReportAssignment[], { query: '', bucket: 'actionable' }, today);
  assert.equal(filtered.length, 3); // overdue pending + near filling + returned
});

test('filterOperationAssignments: text search matches multiple fields', () => {
  const list = [
    assignment('pending', '2026-08-01', { template_name: '财务汇总', company_name: '北京分公司', company_code: 'BJ001' }),
    assignment('filling', '2026-08-01', { template_name: '人事汇总', company_name: '上海分公司', company_code: 'SH002' }),
  ];
  const byTemplate = filterOperationAssignments(list as unknown as ReportAssignment[], { query: '财务', bucket: 'all' });
  assert.equal(byTemplate.length, 1);

  const byCode = filterOperationAssignments(list as unknown as ReportAssignment[], { query: 'SH002', bucket: 'all' });
  assert.equal(byCode.length, 1);
});

test('filterOperationAssignments: template + period + status combination works', () => {
  const list = [
    assignment('pending', '2026-08-01', { template_id: 1, period_label: '2026-07' }),
    assignment('filling', '2026-08-01', { template_id: 1, period_label: '2026-07' }),
    assignment('received', '2026-08-01', { template_id: 2, period_label: '2026-07' }),
    assignment('filling', '2026-08-01', { template_id: 2, period_label: '2026-08' }),
  ];
  const filtered = filterOperationAssignments(list as unknown as ReportAssignment[], {
    query: '',
    bucket: 'all',
    templateId: 1,
    periodLabel: '2026-07',
  });
  assert.equal(filtered.length, 2);
});

test('groupAssignmentProgress: groups by template_id + period_label, completed count only counts completed tasks', () => {
  const list = [
    assignment('received', '2026-08-01', { template_id: 1, period_label: '2026-07' }),
    assignment('pending', '2026-08-01', { template_id: 1, period_label: '2026-07' }),
    assignment('returned', '2026-08-01', { template_id: 1, period_label: '2026-07' }),
    assignment('filling', '2026-08-01', { template_id: 2, period_label: '2026-07' }),
  ];
  const groups = groupAssignmentProgress(list);
  assert.equal(groups.length, 2);

  const g1 = groups.find((g) => g.key === '1|2026-07')!;
  assert.equal(g1.total, 3);
  assert.equal(g1.completed, 1);
  assert.equal(g1.abnormal, 1);

  const g2 = groups.find((g) => g.key === '2|2026-07')!;
  assert.equal(g2.total, 1);
  assert.equal(g2.completed, 0);
  assert.equal(g2.abnormal, 0);
});
