import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, requireHeadquarter } from '../auth';
import { ReportAssignment } from '../types';

const router = Router();

export function selectAssignmentsForPeriod(
  assignments: ReportAssignment[],
  templateId: number,
  periodLabel: string,
): ReportAssignment[] {
  return assignments.filter(
    (assignment) => assignment.template_id === templateId && assignment.period_label === periodLabel,
  );
}

// GET /api/aggregations/by-template/:templateId - Get aggregation view for template across branches
router.get('/by-template/:templateId', authMiddleware, requireHeadquarter, (req: Request, res: Response) => {
  const templateId = parseInt(req.params.templateId, 10);
  const periodLabel = typeof req.query.period_label === 'string' ? req.query.period_label.trim() : '';
  if (!periodLabel) {
    return res.status(400).json({ error: '请指定汇总周期 period_label' });
  }
  const template = db.getTemplateById(templateId);

  if (!template) {
    return res.status(404).json({ error: '模板不存在' });
  }

  const allFields = db.getTemplateFields(templateId).filter((f) => f.status === 'active');
  const summaryFields = allFields.filter((f) => f.data_type === 'summary');
  const detailFields = allFields.filter((f) => f.data_type === 'detail');

  const branches = db.getCompanies().filter((c) => c.level === 'branch' && c.status === 'active');
  const assignments = selectAssignmentsForPeriod(db.getAssignments(), templateId, periodLabel);

  const companyDataList: any[] = [];
  const mergedDetailRows: any[] = [];

  const summaryStats: Record<string, { total: number; count: number; average: number }> = {};
  summaryFields.forEach((f) => {
    if (f.field_type === 'number') {
      summaryStats[f.field_name] = { total: 0, count: 0, average: 0 };
    }
  });

  const detailStats: Record<string, { total: number; count: number; average: number }> = {};
  detailFields.forEach((f) => {
    if (f.field_type === 'number') {
      detailStats[f.field_name] = { total: 0, count: 0, average: 0 };
    }
  });

  branches.forEach((branch) => {
    const assignment = assignments.find((a) => a.assigned_to_company_id === branch.id);
    const companyItem: any = {
      company_id: branch.id,
      company_name: branch.name,
      company_code: branch.code,
      has_assignment: !!assignment,
      assignment_status: assignment ? assignment.status : 'unassigned',
      has_submitted: false,
      submission_version: 0,
      values: {},
    };

    if (assignment) {
      const latestSub = db.getLatestApprovedSubmissionByAssignment(assignment.id);
      if (latestSub) {
        companyItem.has_submitted = true;
        companyItem.submission_status = latestSub.status;
        companyItem.submission_version = latestSub.version;

        const rawData = db.getSubmissionData(latestSub.id);

        // Parse summary values
        rawData
          .filter((d) => d.row_index === 0)
          .forEach((d) => {
            const field = summaryFields.find((f) => f.id === d.field_id);
            if (field) {
              companyItem.values[field.field_name] = d.value;

              if (field.field_type === 'number' && d.value !== '' && !isNaN(Number(d.value))) {
                const val = Number(d.value);
                summaryStats[field.field_name].total += val;
                summaryStats[field.field_name].count += 1;
              }
            }
          });

        // Group detail rows
        const detailRowsMap: Record<number, Record<string, any>> = {};
        rawData
          .filter((d) => d.row_index > 0)
          .forEach((d) => {
            const field = detailFields.find((f) => f.id === d.field_id);
            if (field) {
              if (!detailRowsMap[d.row_index]) {
                detailRowsMap[d.row_index] = {
                  company_name: branch.name,
                  company_code: branch.code,
                  row_index: d.row_index,
                };
              }
              detailRowsMap[d.row_index][field.field_name] = d.value;

              if (field.field_type === 'number' && d.value !== '' && !isNaN(Number(d.value))) {
                const val = Number(d.value);
                detailStats[field.field_name].total += val;
                detailStats[field.field_name].count += 1;
              }
            }
          });

        Object.values(detailRowsMap).forEach((r) => mergedDetailRows.push(r));
      }
    }

    companyDataList.push(companyItem);
  });

  // Calculate averages
  Object.keys(summaryStats).forEach((key) => {
    const s = summaryStats[key];
    s.average = s.count > 0 ? parseFloat((s.total / s.count).toFixed(2)) : 0;
  });

  Object.keys(detailStats).forEach((key) => {
    const s = detailStats[key];
    s.average = s.count > 0 ? parseFloat((s.total / s.count).toFixed(2)) : 0;
  });

  res.json({
    template,
    summary_fields: summaryFields,
    detail_fields: detailFields,
    company_data: companyDataList,
    summary: summaryStats,
    detail_rows: mergedDetailRows,
    detail_summary: detailStats,
  });
});

// POST /api/aggregations/aggregate/:assignmentId - Manually trigger single assignment aggregation
router.post('/aggregate/:assignmentId', authMiddleware, requireHeadquarter, (req: Request, res: Response) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  try {
    const agg = db.aggregateAssignment(assignmentId);
    res.json({ message: '数据汇总成功', aggregation: agg });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '汇总操作失败' });
  }
});

// GET /api/aggregations/history/:templateId - View report history & submission versions
router.get('/history/:templateId', authMiddleware, requireHeadquarter, (req: Request, res: Response) => {
  const templateId = parseInt(req.params.templateId, 10);
  const assignments = db.getAssignments().filter((a) => a.template_id === templateId);

  const history = assignments.map((a) => {
    const company = db.getCompanyById(a.assigned_to_company_id);
    const submissions = db.getSubmissions().filter((s) => s.assignment_id === a.id);

    return {
      assignment_id: a.id,
      title: a.title,
      period_label: a.period_label,
      company_name: company ? company.name : '',
      company_code: company ? company.code : '',
      deadline: a.deadline,
      status: a.status,
      submissions_history: submissions.map((s) => {
        const submitter = db.getUserById(s.submitted_by);
        return {
          submission_id: s.id,
          version: s.version,
          status: s.status,
          submitted_by_name: submitter ? submitter.display_name : '',
          submitted_at: s.submitted_at || s.created_at,
          comment: s.comment,
        };
      }),
    };
  });

  res.json(history);
});

export default router;
