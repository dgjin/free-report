import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAggregationTargets } from '../server/src/routes/aggregations';

const assignments = [
  { id: 1, template_id: 7, assigned_to_company_id: 10, period_label: '2026-07' },
  { id: 2, template_id: 7, assigned_to_company_id: 20, period_label: '2026-07' },
  { id: 3, template_id: 7, assigned_to_company_id: 30, period_label: '2026-06' },
  { id: 4, template_id: 8, assigned_to_company_id: 40, period_label: '2026-07' },
] as any[];

const companies = [
  { id: 10, name: '北京分公司', level: 'branch', status: 'active' },
  { id: 20, name: '计划财务部', level: 'department', status: 'active' },
  { id: 30, name: '历史分公司', level: 'branch', status: 'inactive' },
  { id: 40, name: '无关分公司', level: 'branch', status: 'active' },
  { id: 50, name: '未下发分公司', level: 'branch', status: 'active' },
] as any[];

test('aggregation targets contain only institutions assigned for the template period', () => {
  const targets = selectAggregationTargets(assignments, companies, 7, '2026-07');
  assert.deepEqual(targets.map(({ company }) => company.id), [10, 20]);
});

test('aggregation targets retain inactive institutions with historical assignments', () => {
  const targets = selectAggregationTargets(assignments, companies, 7, '2026-06');
  assert.deepEqual(targets.map(({ company }) => company.id), [30]);
});
