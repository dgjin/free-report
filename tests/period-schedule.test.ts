import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSchedulablePeriodType,
  currentPeriodLabel,
  computeIssueDate,
  describeIssueRule,
} from '../src/utils/periodSchedule';

// --- isSchedulablePeriodType ---

test('isSchedulablePeriodType: monthly/quarterly/yearly 可调度，其余不可', () => {
  assert.equal(isSchedulablePeriodType('monthly'), true);
  assert.equal(isSchedulablePeriodType('quarterly'), true);
  assert.equal(isSchedulablePeriodType('yearly'), true);
  assert.equal(isSchedulablePeriodType('daily'), false);
  assert.equal(isSchedulablePeriodType('weekly'), false);
  assert.equal(isSchedulablePeriodType('custom'), false);
});

// --- currentPeriodLabel ---

test('currentPeriodLabel: monthly → yyyy年MM月（补零）', () => {
  assert.equal(currentPeriodLabel('monthly', new Date('2026-07-15T08:00:00')), '2026年07月');
  assert.equal(currentPeriodLabel('monthly', new Date('2026-12-15T08:00:00')), '2026年12月');
});

test('currentPeriodLabel: quarterly → yyyy年Qn', () => {
  assert.equal(currentPeriodLabel('quarterly', new Date('2026-01-15T08:00:00')), '2026年Q1');
  assert.equal(currentPeriodLabel('quarterly', new Date('2026-04-15T08:00:00')), '2026年Q2');
  assert.equal(currentPeriodLabel('quarterly', new Date('2026-07-15T08:00:00')), '2026年Q3');
  assert.equal(currentPeriodLabel('quarterly', new Date('2026-11-15T08:00:00')), '2026年Q4');
});

test('currentPeriodLabel: yearly → yyyy年；custom 回退月度标签', () => {
  assert.equal(currentPeriodLabel('yearly', new Date('2026-07-15T08:00:00')), '2026年');
  assert.equal(currentPeriodLabel('custom', new Date('2026-07-15T08:00:00')), '2026年07月');
});

// --- computeIssueDate ---

const fmt = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : null;

test('computeIssueDate: monthly 取当月 issue_day', () => {
  assert.equal(fmt(computeIssueDate('monthly', 5, null, new Date('2026-07-20T08:00:00'))), '2026-07-05');
});

test('computeIssueDate: issue_day 钳制到 1-28', () => {
  assert.equal(fmt(computeIssueDate('monthly', 31, null, new Date('2026-02-20T08:00:00'))), '2026-02-28');
  assert.equal(fmt(computeIssueDate('monthly', 0, null, new Date('2026-02-20T08:00:00'))), '2026-02-01');
});

test('computeIssueDate: quarterly 取季度首月 issue_day', () => {
  assert.equal(fmt(computeIssueDate('quarterly', 10, null, new Date('2026-08-20T08:00:00'))), '2026-07-10');
  assert.equal(fmt(computeIssueDate('quarterly', 10, null, new Date('2026-12-20T08:00:00'))), '2026-10-10');
});

test('computeIssueDate: yearly 取 issue_month 月 issue_day；月份缺失默认 1 月、越界钳制', () => {
  assert.equal(fmt(computeIssueDate('yearly', 15, 3, new Date('2026-07-20T08:00:00'))), '2026-03-15');
  assert.equal(fmt(computeIssueDate('yearly', 15, null, new Date('2026-07-20T08:00:00'))), '2026-01-15');
  assert.equal(fmt(computeIssueDate('yearly', 15, 13, new Date('2026-07-20T08:00:00'))), '2026-12-15');
});

test('computeIssueDate: daily/weekly/custom 不支持返回 null', () => {
  assert.equal(computeIssueDate('daily', 5, null, new Date()), null);
  assert.equal(computeIssueDate('weekly', 5, null, new Date()), null);
  assert.equal(computeIssueDate('custom', 5, null, new Date()), null);
});

// --- describeIssueRule ---

test('describeIssueRule: 按类型生成可读规则', () => {
  assert.equal(describeIssueRule('monthly', 5), '每月 5 日');
  assert.equal(describeIssueRule('quarterly', 5), '每季首月 5 日');
  assert.equal(describeIssueRule('yearly', 5, 3), '每年 3 月 5 日');
  assert.equal(describeIssueRule('custom', 5), '不支持自动下发');
});
