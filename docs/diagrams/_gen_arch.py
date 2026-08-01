#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""随手报 ReportNow · 系统功能架构图 (Style 1 Flat Icon, 1200x840)"""

OUT = '/Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/docs/diagrams/system-architecture.svg'

lines = []
A = lines.append

A('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 840" width="1200" height="840">')
A('  <style>')
A("    text { font-family: 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif; }")
A('  </style>')
A('  <defs>')
A('    <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">')
A('      <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb"/>')
A('    </marker>')
A('    <marker id="arrow-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">')
A('      <polygon points="0 0, 10 3.5, 0 7" fill="#16a34a"/>')
A('    </marker>')
A('    <marker id="arrow-purple" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">')
A('      <polygon points="0 0, 10 3.5, 0 7" fill="#9333ea"/>')
A('    </marker>')
A('  </defs>')

# background
A('  <rect width="1200" height="840" fill="#ffffff"/>')

# title
A('  <text x="600" y="34" text-anchor="middle" font-size="18" font-weight="600" fill="#111827">随手报 ReportNow · 系统功能架构图</text>')
A('  <text x="600" y="54" text-anchor="middle" font-size="12" fill="#6b7280">覆盖 模板设计 → 任务下发 → 填报审批 → 签收汇总 → 智能分析 的报表全生命周期管理平台</text>')

# ---------- layer containers (drawn before arrows) ----------
A('  <rect x="40" y="72" width="1120" height="78" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="6,4"/>')
A('  <text x="56" y="92" font-size="12.5" font-weight="600" fill="#475569">用户层 · 角色</text>')

A('  <rect x="40" y="190" width="1120" height="234" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="6,4"/>')
A('  <text x="56" y="210" font-size="12.5" font-weight="600" fill="#475569">前端功能层 · React 18 SPA（TypeScript + Vite + Tailwind + Recharts）</text>')

A('  <rect x="40" y="468" width="1120" height="194" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="6,4"/>')
A('  <text x="56" y="488" font-size="12.5" font-weight="600" fill="#475569">后端服务层 · Spring Boot 3 + MyBatis（REST API · JWT 认证鉴权 · 部门数据隔离）</text>')

# ---------- arrows (below nodes, above containers) ----------
# user -> frontend
A('  <line x1="600" y1="150" x2="600" y2="190" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
A('  <text x="612" y="174" font-size="12" fill="#2563eb">HTTPS</text>')
# frontend -> backend
A('  <line x1="600" y1="424" x2="600" y2="468" stroke="#2563eb" stroke-width="2.5" marker-end="url(#arrow-blue)"/>')
A('  <text x="612" y="450" font-size="12" fill="#2563eb">REST API · JWT Bearer</text>')
# backend -> MySQL
A('  <line x1="400" y1="662" x2="400" y2="706" stroke="#16a34a" stroke-width="2" marker-end="url(#arrow-green)"/>')
A('  <text x="388" y="688" text-anchor="end" font-size="12" fill="#16a34a">MyBatis · JDBC</text>')
# ai-query service -> AI model
A('  <path d="M 508 646 V 684 H 800 V 706" stroke="#9333ea" stroke-width="1.5" fill="none" stroke-dasharray="5,3" marker-end="url(#arrow-purple)"/>')
A('  <text x="654" y="676" text-anchor="middle" font-size="12" fill="#9333ea">OpenAI 兼容 API</text>')

# ---------- user layer nodes ----------
roles = ['分公司用户（填报）', '部门报表管理员', '数智化转型办公室', '超级管理员']
for i, name in enumerate(roles):
    x = 64 + i * 274
    A(f'  <rect x="{x}" y="102" width="250" height="36" rx="8" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1.5"/>')
    A(f'  <text x="{x + 125}" y="125" text-anchor="middle" font-size="13" font-weight="600" fill="#1e40af">{name}</text>')

# ---------- frontend modules ----------
fe_row1 = [
    ('工作台', '待办任务 · 退回提醒', '填报进度统计总览'),
    ('模板管理', '字段设计 · Excel导入', '提交审批 · 周期计划'),
    ('任务下发', '周期任务 · 一次性', '自动调度 · 强制收回'),
    ('报表填报', '汇总区 · 明细表', '交叉表 · 全屏展示'),
    ('审批中心', '填报三级审批', '模板发布审批'),
]
fe_row2 = [
    ('签收管理', '报表签收 · 退回', '签收进度跟踪'),
    ('汇总报表', '多机构数据对比', 'Excel 导出'),
    ('智能问数', '自然语言查询', '图表生成 · 结果下载'),
    ('机构与用户管理', '机构树维护', '用户与角色分配'),
    ('全局只读视图', '超管全域数据', '只读查阅'),
]
for row, items in enumerate([fe_row1, fe_row2]):
    y = 222 + row * 100
    for i, (t, s1, s2) in enumerate(items):
        x = 60 + i * 220
        A(f'  <rect x="{x}" y="{y}" width="200" height="86" rx="8" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="1.5"/>')
        A(f'  <text x="{x + 100}" y="{y + 26}" text-anchor="middle" font-size="13" font-weight="600" fill="#111827">{t}</text>')
        A(f'  <text x="{x + 100}" y="{y + 48}" text-anchor="middle" font-size="11" fill="#6b7280">{s1}</text>')
        A(f'  <text x="{x + 100}" y="{y + 66}" text-anchor="middle" font-size="11" fill="#6b7280">{s2}</text>')

# ---------- backend services ----------
be_row1 = [
    ('认证服务', 'AuthController'),
    ('模板服务', 'TemplateController'),
    ('任务服务', 'AssignmentController'),
    ('填报服务', 'SubmissionController'),
    ('审批服务', 'ApprovalController'),
    ('签收服务', 'ReceiptController'),
]
be_row2 = [
    ('数据导入', 'DataImportController'),
    ('汇总服务', 'AggregationController'),
    ('智能问数', 'AiQueryController'),
    ('机构管理', 'CompanyController'),
    ('用户管理', 'UserController'),
    ('提醒服务', 'ReminderController'),
]
for row, items in enumerate([be_row1, be_row2]):
    y = 502 + row * 80
    for i, (t, c) in enumerate(items):
        x = 60 + i * 183
        A(f'  <rect x="{x}" y="{y}" width="165" height="64" rx="8" fill="#faf5ff" stroke="#e9d5ff" stroke-width="1.5"/>')
        A(f'  <text x="{x + 82}" y="{y + 26}" text-anchor="middle" font-size="13" font-weight="600" fill="#111827">{t}</text>')
        A(f'  <text x="{x + 82}" y="{y + 46}" text-anchor="middle" font-size="11" fill="#6b7280">{c}</text>')

# ---------- data layer ----------
A('  <rect x="250" y="706" width="300" height="48" rx="8" fill="#f0fdfa" stroke="#99f6e4" stroke-width="1.5"/>')
A('  <text x="400" y="728" text-anchor="middle" font-size="13" font-weight="600" fill="#0f766e">MySQL 8.0 数据库</text>')
A('  <text x="400" y="746" text-anchor="middle" font-size="11" fill="#6b7280">18 张表 · 模板 / 任务 / 填报 / 审批 / 机构</text>')

A('  <rect x="650" y="706" width="300" height="48" rx="8" fill="#fff7ed" stroke="#fed7aa" stroke-width="1.5"/>')
A('  <text x="800" y="728" text-anchor="middle" font-size="13" font-weight="600" fill="#9a3412">AI 大模型服务</text>')
A('  <text x="800" y="746" text-anchor="middle" font-size="11" fill="#6b7280">OpenAI 兼容 API（智能问数）</text>')

# ---------- legend ----------
A('  <line x1="40" y1="806" x2="76" y2="806" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
A('  <text x="84" y="810" font-size="12" fill="#6b7280">HTTPS / REST API 主链路</text>')
A('  <line x1="300" y1="806" x2="336" y2="806" stroke="#16a34a" stroke-width="2" marker-end="url(#arrow-green)"/>')
A('  <text x="344" y="810" font-size="12" fill="#6b7280">数据持久化（MyBatis）</text>')
A('  <line x1="580" y1="806" x2="616" y2="806" stroke="#9333ea" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arrow-purple)"/>')
A('  <text x="624" y="810" font-size="12" fill="#6b7280">外部 AI 服务调用</text>')

A('</svg>')

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')
print('SVG generated:', OUT)
