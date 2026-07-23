import { SubmissionStatus } from './types';

export function canWriteSubmissionStatus(status?: SubmissionStatus): boolean {
  return status === undefined || status === 'draft' || status === 'returned' || status === 'rejected';
}
