import assert from 'node:assert/strict';
import test from 'node:test';

test('pending receipt and received submissions are read only, returned submissions are editable', async () => {
  const { getSubmissionWorkflowView } = await import('../src/utils/submissionWorkflow');

  assert.equal(getSubmissionWorkflowView('pending_receipt').isReadOnly, true);
  assert.equal(getSubmissionWorkflowView('received').isReadOnly, true);
  assert.equal(getSubmissionWorkflowView('returned').isReadOnly, false);
  assert.equal(getSubmissionWorkflowView('pending_receipt').label, '已提交 · 待发起部门签收');
  assert.equal(getSubmissionWorkflowView('returned').label, '已退回 · 请修改后重新提交');
});

test('only a new, draft, returned, or rejected submission can be written', async () => {
  const { canWriteSubmissionStatus } = await import('../server/src/submission-workflow');

  assert.equal(canWriteSubmissionStatus(undefined), true);
  assert.equal(canWriteSubmissionStatus('draft'), true);
  assert.equal(canWriteSubmissionStatus('returned'), true);
  assert.equal(canWriteSubmissionStatus('rejected'), true);
  assert.equal(canWriteSubmissionStatus('pending_receipt'), false);
  assert.equal(canWriteSubmissionStatus('received'), false);
});

test('missing submission is returned as null without an HTTP error', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  globalThis.fetch = async () => new Response('null', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const { api } = await import('../src/services/api');
    assert.equal(await api.getSubmissionByAssignment(123), null);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});
