#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""随手报 ReportNow · 核心业务流程图（角色泳道式, Style 1 Flat Icon, 1200x720）"""

OUT = '/Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/docs/diagrams/core-business-flow.svg'

lines = []
A = lines.append

A('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" width="1200" height="720">')
A('  <style>')
A("    text { font-family: 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif; }")
A('  </style>')
A('  <defs>')
A('    <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">')
A('      <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb"/>')
A('    </marker>')
A('    <marker id="arrow-red" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">')
A('      <polygon points="0 0, 10 3.5, 0 7" fill="#dc2626"/>')
A('    </marker>')
A('  </defs>')

# background
A('  <rect width="1200" height="720" fill="#ffffff"/>')

# title
A('  <text x="600" y="34" text-anchor="middle" font-size="18" font-weight="600" fill="#111827">随手报 ReportNow · 核心业务流程图</text>')
A('  <text x="600" y="54" text-anchor="middle" font-size="12" fill="#6b7280">报表全生命周期：模板设计 → 模板审批 → 任务下发 → 数据填报 → 三级审批 → 签收 → 汇总分析</text>')

# ---------- swimlanes ----------
lanes = [
    (76,  '#f8fafc', ['部门报表管理员']),
    (216, '#ffffff', ['数智化转型', '办公室']),
    (356, '#f8fafc', ['分公司用户']),
    (496, '#ffffff', ['填报审批人']),
]
for y0, fill, label_lines in lanes:
    A(f'  <rect x="40" y="{y0}" width="1120" height="140" fill="{fill}" stroke="none" data-graph-role="decoration"/>')
    A(f'  <rect x="40" y="{y0}" width="110" height="140" fill="#f1f5f9" stroke="none" data-graph-role="decoration"/>')
    mid = y0 + 70
    if len(label_lines) == 1:
        A(f'  <text x="95" y="{mid + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="#475569">{label_lines[0]}</text>')
    else:
        A(f'  <text x="95" y="{mid - 6}" text-anchor="middle" font-size="13" font-weight="600" fill="#475569">{label_lines[0]}</text>')
        A(f'  <text x="95" y="{mid + 12}" text-anchor="middle" font-size="13" font-weight="600" fill="#475569">{label_lines[1]}</text>')

# lane borders + separators
A('  <rect x="40" y="76" width="1120" height="560" fill="none" stroke="#cbd5e1" stroke-width="1.2" data-graph-role="decoration"/>')
for yy in (216, 356, 496):
    A(f'  <line x1="40" y1="{yy}" x2="1160" y2="{yy}" stroke="#e2e8f0" stroke-width="1"/>')
    A(f'  <line x1="150" y1="{yy}" x2="150" y2="{yy}" stroke="#cbd5e1" stroke-width="1"/>')
A('  <line x1="150" y1="76" x2="150" y2="636" stroke="#cbd5e1" stroke-width="1"/>')

# ---------- arrows ----------
# E1: A1 -> A2
A('  <line x1="350" y1="146" x2="400" y2="146" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
# E2: A2 -> B1
A('  <line x1="470" y1="170" x2="470" y2="246" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
# E3: B1 reject -> A1 (red dashed)
A('  <path d="M 385 286 H 300 V 170" stroke="#dc2626" stroke-width="1.5" fill="none" stroke-dasharray="5,3" marker-end="url(#arrow-red)"/>')
A('  <text x="292" y="228" text-anchor="end" font-size="12" fill="#dc2626">驳回·修改重报</text>')
# E4: B1 approve -> A5 (blue)
A('  <path d="M 555 286 H 580 V 146 H 610" stroke="#2563eb" stroke-width="2" fill="none" marker-end="url(#arrow-blue)"/>')
A('  <text x="588" y="228" font-size="12" fill="#2563eb">通过·模板发布</text>')
# E5: A5 -> C1
A('  <line x1="670" y1="170" x2="670" y2="412" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
A('  <text x="678" y="290" font-size="12" fill="#2563eb">下发任务·自动调度</text>')
# E6: C1 -> C2
A('  <line x1="730" y1="436" x2="760" y2="436" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
# E7: C2 -> C3
A('  <line x1="900" y1="436" x2="930" y2="436" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
# E8: C3 -> D1
A('  <line x1="990" y1="460" x2="990" y2="531" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
# E9: D1 reject -> C2 (red dashed)
A('  <path d="M 895 576 H 830 V 460" stroke="#dc2626" stroke-width="1.5" fill="none" stroke-dasharray="5,3" marker-end="url(#arrow-red)"/>')
A('  <text x="822" y="520" text-anchor="end" font-size="12" fill="#dc2626">驳回·退回重填</text>')
# E10: D1 approve -> A8 (blue, long route)
A('  <path d="M 1085 576 H 1140 V 190 H 850 V 170" stroke="#2563eb" stroke-width="2" fill="none" marker-end="url(#arrow-blue)"/>')
A('  <text x="995" y="182" text-anchor="middle" font-size="12" fill="#2563eb">通过·待签收</text>')
# E11: A8 -> A9
A('  <line x1="910" y1="146" x2="950" y2="146" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')

# ---------- nodes ----------
def node(x, y, w, title, sub=None, fill='#ffffff', stroke='#d1d5db', tfill='#111827'):
    A(f'  <rect x="{x}" y="{y}" width="{w}" height="48" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
    if sub:
        A(f'  <text x="{x + w / 2}" y="{y + 21}" text-anchor="middle" font-size="13" font-weight="600" fill="{tfill}">{title}</text>')
        A(f'  <text x="{x + w / 2}" y="{y + 38}" text-anchor="middle" font-size="11" fill="#6b7280">{sub}</text>')
    else:
        A(f'  <text x="{x + w / 2}" y="{y + 29}" text-anchor="middle" font-size="13" font-weight="600" fill="{tfill}">{title}</text>')

def diamond(cx, cy, hw, hh, title, sub):
    pts = f'{cx},{cy - hh} {cx + hw},{cy} {cx},{cy + hh} {cx - hw},{cy}'
    A(f'  <polygon points="{pts}" fill="#fffbeb" stroke="#fcd34d" stroke-width="1.5"/>')
    A(f'  <text x="{cx}" y="{cy - 4}" text-anchor="middle" font-size="13" font-weight="600" fill="#92400e">{title}</text>')
    A(f'  <text x="{cx}" y="{cy + 14}" text-anchor="middle" font-size="11" fill="#6b7280">{sub}</text>')

# lane 1 (y node=122): dept admin
node(180, 122, 170, '创建模板·设计字段')
node(400, 122, 140, '提交模板审批')
node(610, 122, 120, '下发任务')
node(790, 122, 120, '签收报表')
node(950, 122, 170, '汇总分析·智能问数', fill='#f0fdf4', stroke='#bbf7d0', tfill='#166534')

# lane 2: template approval diamond
diamond(470, 286, 85, 40, '模板审批', '通过 / 驳回')

# lane 3 (y node=412): branch users
node(610, 412, 120, '接收任务')
node(760, 412, 140, '填报数据', '汇总区·明细·交叉表')
node(930, 412, 120, '提交填报')

# lane 4: submission approval diamond
diamond(990, 576, 95, 45, '三级审批', '分公司 → 部门')

# ---------- legend ----------
A('  <line x1="40" y1="668" x2="76" y2="668" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>')
A('  <text x="84" y="672" font-size="12" fill="#6b7280">主流程（任务 / 数据流转）</text>')
A('  <line x1="320" y1="668" x2="356" y2="668" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arrow-red)"/>')
A('  <text x="364" y="672" font-size="12" fill="#6b7280">驳回 / 退回路径</text>')

A('</svg>')

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')
print('SVG generated:', OUT)
