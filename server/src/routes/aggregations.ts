import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware } from '../auth';
import { canManageTemplate, canReadTemplate } from '../department-policy';
import { Company, ReportAssignment } from '../types';

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

export function selectAggregationTargets(
  assignments: ReportAssignment[],
  companies: Company[],
  templateId: number,
  periodLabel: string,
): Array<{ assignment: ReportAssignment; company: Company }> {
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  return selectAssignmentsForPeriod(assignments, templateId, periodLabel)
    .map((assignment) => ({
      assignment,
      company: companiesById.get(assignment.assigned_to_company_id),
    }))
    .filter(
      (target): target is { assignment: ReportAssignment; company: Company } =>
        target.company !== undefined,
    );
}

// GET /api/aggregations/by-template/:templateId - Get aggregation view for template across branches
router.get('/by-template/:templateId', authMiddleware, async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.templateId, 10);
  const periodLabel = typeof req.query.period_label === 'string' ? req.query.period_label.trim() : '';
  if (!periodLabel) {
    return res.status(400).json({ error: '请指定汇总周期 period_label' });
  }
  const template = await db.getTemplateById(templateId);

  if (!template) {
    return res.status(404).json({ error: '模板不存在' });
  }
  if (!canReadTemplate(req.user!, { owner_department_id: template.owner_department_id! })) return res.status(404).json({ error: '模板不存在' });

  const allFields = (await db.getTemplateFields(templateId)).filter((f) => f.status === 'active');
  const summaryFields = allFields.filter((f) => f.data_type === 'summary');
  const detailFields = allFields.filter((f) => f.data_type === 'detail' || f.data_type === 'matrix');

  // Filter assignments and companies at SQL level instead of loading all rows
  const periodAssignments = await db.getAssignmentsByTemplateAndPeriod(templateId, periodLabel);
  const companyIds = [...new Set(periodAssignments.map((a) => a.assigned_to_company_id))];
  const periodCompanies = await db.getCompaniesByIds(companyIds);

  const targets = selectAggregationTargets(
    periodAssignments,
    periodCompanies,
    templateId,
    periodLabel,
  );

  // Batch fetch latest approved submissions and their data (2 queries instead of 2N)
  const assignmentIds = targets.map((t) => t.assignment.id);
  const latestApprovedSubs = await db.getLatestApprovedSubmissionsByAssignmentIds(assignmentIds);
  const latestSubByAssignmentId = new Map(latestApprovedSubs.map((s) => [s.assignment_id, s]));
  const submissionIds = latestApprovedSubs.map((s) => s.id);
  const allSubmissionData = await db.getSubmissionDataBySubmissionIds(submissionIds);
  const submissionDataBySubmissionId = new Map<number, typeof allSubmissionData>();
  for (const data of allSubmissionData) {
    if (!submissionDataBySubmissionId.has(data.submission_id)) {
      submissionDataBySubmissionId.set(data.submission_id, []);
    }
    submissionDataBySubmissionId.get(data.submission_id)!.push(data);
  }

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

  const APPROVED_STATUSES = ['pending_receipt', 'received'];

  for (const { assignment, company } of targets) {
    const companyItem: any = {
      company_id: company.id,
      company_name: company.name,
      company_code: company.code,
      has_assignment: true,
      assignment_status: assignment.status,
      has_submitted: false,
      submission_version: 0,
      values: {},
    };

    const latestSub = latestSubByAssignmentId.get(assignment.id);
    if (latestSub) {
      companyItem.has_submitted = true;
      companyItem.submission_status = latestSub.status;
      companyItem.submission_version = latestSub.version;

      // Only approved submissions contribute to numeric statistics
      const isApproved = APPROVED_STATUSES.includes(latestSub.status);
      const rawData = submissionDataBySubmissionId.get(latestSub.id) || [];

      // Parse summary values
      rawData
        .filter((d) => d.row_index === 0)
        .forEach((d) => {
          const field = summaryFields.find((f) => f.id === d.field_id);
          if (field) {
            companyItem.values[field.field_name] = d.value;

            if (isApproved && field.field_type === 'number' && d.value !== '' && !isNaN(Number(d.value))) {
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
                company_name: company.name,
                company_code: company.code,
                row_index: d.row_index,
                submission_status: latestSub.status,
              };
            }
            detailRowsMap[d.row_index][field.field_name] = d.value;

            if (isApproved && field.field_type === 'number' && d.value !== '' && !isNaN(Number(d.value))) {
              const val = Number(d.value);
              detailStats[field.field_name].total += val;
              detailStats[field.field_name].count += 1;
            }
          }
        });

      Object.values(detailRowsMap).forEach((r) => mergedDetailRows.push(r));
    }

    companyDataList.push(companyItem);
  }

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
router.post('/aggregate/:assignmentId', authMiddleware, async (req: Request, res: Response) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  try {
    const assignment = await db.getAssignmentById(assignmentId);
    const template = assignment ? await db.getTemplateById(assignment.template_id) : undefined;
    if (!assignment || !template) return res.status(404).json({ error: '任务不存在' });
    if (!canManageTemplate(req.user!, { owner_department_id: template.owner_department_id! })) return res.status(403).json({ error: '无权汇总该任务' });
    const agg = await db.aggregateAssignment(assignmentId);
    res.json({ message: '数据汇总成功', aggregation: agg });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '汇总操作失败' });
  }
});

// GET /api/aggregations/history/:templateId - View report history & submission versions
router.get('/history/:templateId', authMiddleware, async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.templateId, 10);
  const template = await db.getTemplateById(templateId);
  if (!template || !canReadTemplate(req.user!, { owner_department_id: template.owner_department_id! })) return res.status(404).json({ error: '模板不存在' });

  // Filter at SQL level instead of loading all assignments + all submissions
  const assignments = await db.getAssignmentsByTemplateId(templateId);
  const assignmentIds = assignments.map((a) => a.id);
  const companyIds = [...new Set(assignments.map((a) => a.assigned_to_company_id))];
  const allSubmissions = await db.getSubmissionsByAssignmentIds(assignmentIds);

  // Batch fetch companies and submitters (2 queries instead of N+M)
  const submitterIds = [...new Set(allSubmissions.map((s) => s.submitted_by))];
  const [companies, submitters] = await Promise.all([
    db.getCompaniesByIds(companyIds),
    db.getUsersByIds(submitterIds),
  ]);
  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const submitterMap = new Map(submitters.map((u) => [u.id, u]));

  const history = assignments.map((a) => {
    const company = companyMap.get(a.assigned_to_company_id);
    const submissions = allSubmissions.filter((s) => s.assignment_id === a.id);

    return {
      assignment_id: a.id,
      title: a.title,
      period_label: a.period_label,
      company_name: company ? company.name : '',
      company_code: company ? company.code : '',
      deadline: a.deadline,
      status: a.status,
      submissions_history: submissions.map((s) => {
        const submitter = submitterMap.get(s.submitted_by);
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
