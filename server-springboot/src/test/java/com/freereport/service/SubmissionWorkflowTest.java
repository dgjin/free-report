package com.freereport.service;

import com.freereport.entity.ReportSubmission;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 填报状态机单元测试：流转规则集中在 {@link SubmissionWorkflow}，可脱离 Spring/DB 独立验证。
 */
class SubmissionWorkflowTest {

    private final SubmissionWorkflow workflow = new SubmissionWorkflow();

    private ReportSubmission submission(String status, Integer version) {
        ReportSubmission s = new ReportSubmission();
        s.setStatus(status);
        s.setVersion(version);
        return s;
    }

    @Test
    void canWriteAllowsNullAndWritableStatuses() {
        assertTrue(workflow.canWrite(null));
        assertTrue(workflow.canWrite(submission("draft", 1)));
        assertTrue(workflow.canWrite(submission("returned", 1)));
        assertTrue(workflow.canWrite(submission("rejected", 1)));
    }

    @Test
    void canWriteRejectsInFlightStatuses() {
        assertFalse(workflow.canWrite(submission("pending_review", 1)));
        assertFalse(workflow.canWrite(submission("pending_approval", 1)));
        assertFalse(workflow.canWrite(submission("pending_receipt", 1)));
        assertFalse(workflow.canWrite(submission("received", 1)));
    }

    @Test
    void onSaveDraftKeepsEditableRegardlessOfReviewer() {
        SubmissionWorkflow.SaveTransition t1 = workflow.onSave(false, true);
        assertEquals("draft", t1.submissionStatus());
        assertEquals("filling", t1.assignmentStatus());
        SubmissionWorkflow.SaveTransition t2 = workflow.onSave(false, false);
        assertEquals("draft", t2.submissionStatus());
        assertEquals("filling", t2.assignmentStatus());
    }

    @Test
    void onSaveSubmitWithReviewerEntersReview() {
        SubmissionWorkflow.SaveTransition t = workflow.onSave(true, true);
        assertEquals("pending_review", t.submissionStatus());
        assertEquals("submitted", t.assignmentStatus());
    }

    @Test
    void onSaveSubmitWithoutReviewerGoesStraightToReceipt() {
        SubmissionWorkflow.SaveTransition t = workflow.onSave(true, false);
        assertEquals("pending_receipt", t.submissionStatus());
        assertEquals("pending_receipt", t.assignmentStatus());
    }

    @Test
    void shouldUpdateInPlaceOnlyForDraft() {
        assertFalse(workflow.shouldUpdateInPlace(null));
        assertTrue(workflow.shouldUpdateInPlace(submission("draft", 1)));
        assertFalse(workflow.shouldUpdateInPlace(submission("rejected", 1)));
        assertFalse(workflow.shouldUpdateInPlace(submission("returned", 1)));
    }

    @Test
    void shouldClosePendingApprovalsOnlyForRejectedOrReturned() {
        assertFalse(workflow.shouldClosePendingApprovals(null));
        assertTrue(workflow.shouldClosePendingApprovals(submission("rejected", 1)));
        assertTrue(workflow.shouldClosePendingApprovals(submission("returned", 1)));
        assertFalse(workflow.shouldClosePendingApprovals(submission("draft", 1)));
    }

    @Test
    void nextVersionIncrementsWithFallbacks() {
        assertEquals(1, workflow.nextVersion(null));
        assertEquals(1, workflow.nextVersion(submission("rejected", null)));
        assertEquals(4, workflow.nextVersion(submission("rejected", 3)));
    }
}
