import type { AssignmentStatus, ReportAssignment } from '../types';

export type OperationBucket = 'abnormal' | 'pending_fill' | 'pending_receipt' | 'completed';

export interface OperationFilters {
  query: string;
  bucket: OperationBucket | 'actionable' | 'all';
  templateId?: number | 'all';
  periodLabel?: string | 'all';
}

export interface ReportProgressGroup {
  key: string;
  templateId: number;
  templateName: string;
  periodLabel: string;
  total: number;
  completed: number;
  abnormal: number;
}

/** Normalize a Date to local midnight. */
function toLocalMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse an ISO date string and normalize to local midnight for comparison. */
function parseDeadlineForComparison(deadline: string): Date {
  // If it has timezone info (T or Z), use it as-is then normalize to local midnight
  if (deadline.includes('T') || deadline.includes('Z')) {
    return toLocalMidnight(new Date(deadline));
  }
  // Naive date: parse as UTC and convert to a consistent representation
  const parts = deadline.split('-');
  const d = new Date(Date.UTC(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10),
    0, 0, 0, 0,
  ));
  return toLocalMidnight(d);
}

/** Classify an assignment into one of four mutually exclusive buckets. */
export function classifyAssignment(
  assignment: { status: AssignmentStatus; deadline: string },
  today: Date,
): OperationBucket {
  const { status, deadline } = assignment;
  const deadlineMidnight = parseDeadlineForComparison(deadline);
  const todayMidnight = toLocalMidnight(today);

  // 1. completed: received, aggregated
  if (status === 'received' || status === 'aggregated') {
    return 'completed';
  }

  // 2. abnormal: returned, rejected, recalled, or any uncompleted + overdue
  if (status === 'returned' || status === 'rejected' || status === 'recalled') {
    return 'abnormal';
  }
  if (deadlineMidnight < todayMidnight) {
    return 'abnormal';
  }

  // 3. pending_receipt: submitted (in review/approval pipeline) or pending_receipt
  if (status === 'pending_receipt' || status === 'submitted') {
    return 'pending_receipt';
  }

  // 4. remaining uncompleted → pending_fill
  return 'pending_fill';
}

/** Compute counts for each bucket across a list of assignments. */
export function getAssignmentOverview(
  assignments: { status: AssignmentStatus; deadline: string }[],
  today: Date,
): Record<OperationBucket, number> {
  const overview: Record<OperationBucket, number> = {
    abnormal: 0,
    pending_fill: 0,
    pending_receipt: 0,
    completed: 0,
  };
  for (const a of assignments) {
    const bucket = classifyAssignment(a, today);
    overview[bucket] += 1;
  }
  return overview;
}

/** Sort key for operation bucket (abnormal first). */
function bucketSortKey(bucket: OperationBucket): number {
  switch (bucket) {
    case 'abnormal': return 0;
    case 'pending_receipt': return 1;
    case 'pending_fill': return 2;
    case 'completed': return 3;
  }
}

/** Filter assignments by query, bucket, template, and period. */
export function filterOperationAssignments(
  assignments: ReportAssignment[],
  filters: OperationFilters,
  today?: Date,
): ReportAssignment[] {
  const todayDate = today ? toLocalMidnight(today) : null;
  const templateId = filters.templateId ?? 'all';
  const periodLabel = filters.periodLabel ?? 'all';

  let result = [...assignments];

  // bucket filter
  if (filters.bucket !== 'all') {
    if (filters.bucket === 'actionable' && todayDate) {
      // actionable = abnormal + pending_fill due within 3 days
      const threeDaysFromNow = new Date(todayDate.getTime());
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      result = result.filter((a) => {
        const bucket = classifyAssignment(a, today!);
        if (bucket === 'abnormal') return true;
        if (bucket === 'pending_fill') {
          const dl = parseDeadlineForComparison(a.deadline);
          return dl >= todayDate && dl <= threeDaysFromNow;
        }
        return false;
      });
    } else {
      result = result.filter((a) => classifyAssignment(a, today!) === filters.bucket);
    }
  }

  // text search
  if (filters.query.trim()) {
    const q = filters.query.trim().toLowerCase();
    result = result.filter(
      (a) =>
        (a.template_name && a.template_name.toLowerCase().includes(q)) ||
        (a.company_name && a.company_name.toLowerCase().includes(q)) ||
        (a.company_code && a.company_code.toLowerCase().includes(q)) ||
        (a.title && a.title.toLowerCase().includes(q)),
    );
  }

  // template filter
  if (templateId !== 'all') {
    result = result.filter((a) => a.template_id === templateId);
  }

  // period filter
  if (periodLabel !== 'all') {
    result = result.filter((a) => a.period_label === periodLabel);
  }

  // sort: abnormal priority → deadline asc → id desc
  result.sort((a, b) => {
    const bucketA = classifyAssignment(a, today!);
    const bucketB = classifyAssignment(b, today!);
    const ba = bucketSortKey(bucketA);
    const bb = bucketSortKey(bucketB);
    if (ba !== bb) return ba - bb;

    const da = parseDeadlineForComparison(a.deadline);
    const db = parseDeadlineForComparison(b.deadline);
    if (da.getTime() !== db.getTime()) return da.getTime() - db.getTime();

    return b.id - a.id;
  });

  return result;
}

/** Group assignments by template_id + period_label for progress cards. */
export function groupAssignmentProgress(
  assignments: {
    id: number;
    template_id: number;
    template_name?: string;
    period_label: string;
    status: AssignmentStatus;
    deadline: string;
  }[],
): ReportProgressGroup[] {
  const map = new Map<string, ReportProgressGroup>();

  for (const a of assignments) {
    const key = `${a.template_id}|${a.period_label}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        templateId: a.template_id,
        templateName: a.template_name || '',
        periodLabel: a.period_label,
        total: 0,
        completed: 0,
        abnormal: 0,
      };
      map.set(key, g);
    }
    g.total += 1;
    const bucket = classifyAssignment(a, new Date());
    if (bucket === 'completed') g.completed += 1;
    if (bucket === 'abnormal') g.abnormal += 1;
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}
