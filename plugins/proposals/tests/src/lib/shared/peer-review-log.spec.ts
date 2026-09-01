/**
 * Unit specs for `peer-review-log` (x00154 S6).
 *
 * Covers the typal distinction between:
 *   1. a missing log file (ENOENT) — empty history is a legitimate
 *      "no peer review yet" state and the reader returns `[]`;
 *   2. an empty but present log file — the reader throws
 *      `PeerReviewLogUnreadableError` so callers can map it to
 *      `{ ok: false, error: 'no-log-readable' }`;
 *   3. a real read error (EACCES, EIO, …) — same typed error;
 *   4. a valid log file — the entries round-trip through
 *      `readPeerReviewLog` and `hasIndependentApprovalSinceLastReview`.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	PeerReviewLogUnreadableError,
	appendPeerReviewJsonl,
	hasIndependentApprovalSinceLastReview,
	readPeerReviewLog,
	recordProposalEnteredReview,
	recordProposalReviewAction,
} from '@mcp-vertex/proposals/lib/shared/peer-review-log';

const ENTRY_APPROVE = (overrides: Record<string, unknown> = {}) => ({
	kind: 'review' as const,
	ts: '2026-07-25T10:01:00.000Z',
	proposalId: 'f00999',
	sliceId: 'S1',
	action: 'approve' as const,
	implementer: 'alice',
	reviewer: 'bob',
	verdict: 'approved' as const,
	...overrides,
});

const ENTRY_TRANSITION = (overrides: Record<string, unknown> = {}) => ({
	kind: 'transition' as const,
	ts: '2026-07-25T10:00:00.000Z',
	proposalId: 'f00999',
	from: 'in-progress',
	to: 'review' as const,
	...overrides,
});

describe('peer-review-log (x00154 S6)', () => {
	let workspace = '';
	let logPathAbs = '';

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), 'peer-review-log-'));
		logPathAbs = join(workspace, 'peer-review.jsonl');
	});

	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	describe('readPeerReviewLog', () => {
		it('returns an empty array when the log file is missing (ENOENT)', async () => {
			// The path is intentionally never written to.
			const result = await readPeerReviewLog(logPathAbs);
			expect(result).toEqual([]);
		});

		it('throws PeerReviewLogUnreadableError when the log is empty but present', async () => {
			writeFileSync(logPathAbs, '', 'utf8');
			await expect(readPeerReviewLog(logPathAbs)).rejects.toBeInstanceOf(
				PeerReviewLogUnreadableError,
			);
		});

		it('throws PeerReviewLogUnreadableError when the log contains only whitespace', async () => {
			writeFileSync(logPathAbs, '   \n\t\n', 'utf8');
			await expect(readPeerReviewLog(logPathAbs)).rejects.toBeInstanceOf(
				PeerReviewLogUnreadableError,
			);
		});

		it('throws PeerReviewLogUnreadableError on a non-ENOENT read failure', async () => {
			// The peer-review-log implementation does not import a
			// dependency-injection seam for the file reader, so the
			// most reliable cross-platform way to provoke a non-ENOENT
			// error is to point the reader at a path whose parent
			// directory exists as a *file* (not a directory). On every
			// supported platform this surfaces as ENOTDIR, which the
			// reader treats as a hard failure (not a missing file).
			const blocker = join(workspace, 'blocker');
			writeFileSync(blocker, 'not-a-directory', 'utf8');
			const bogusPath = join(blocker, 'peer-review.jsonl');
			await expect(readPeerReviewLog(bogusPath)).rejects.toBeInstanceOf(
				PeerReviewLogUnreadableError,
			);
		});

		it('appendPeerReviewJsonl writes a durable line that readPeerReviewLog can parse', async () => {
			await appendPeerReviewJsonl(logPathAbs, ENTRY_TRANSITION());
			const entries = await readPeerReviewLog(logPathAbs);
			expect(entries).toHaveLength(1);
			expect(entries[0]?.kind).toBe('transition');
		});

		it('returns parsed entries for a valid JSONL log', async () => {
			writeFileSync(
				logPathAbs,
				`${JSON.stringify(ENTRY_TRANSITION())}\n${JSON.stringify(ENTRY_APPROVE())}\n`,
				'utf8',
			);
			const entries = await readPeerReviewLog(logPathAbs);
			expect(entries).toHaveLength(2);
			expect(entries[0]?.kind).toBe('transition');
			expect(entries[1]?.kind).toBe('review');
		});
	});

	describe('recordProposal* + hasIndependentApprovalSinceLastReview', () => {
		it('returns false on a missing log (ENOENT) — empty history is a legitimate state', async () => {
			const approved = await hasIndependentApprovalSinceLastReview(
				logPathAbs,
				'f00999',
			);
			expect(approved).toBe(false);
		});

		it('propagates PeerReviewLogUnreadableError on an empty log so callers can refuse the decision', async () => {
			writeFileSync(logPathAbs, '', 'utf8');
			await expect(
				hasIndependentApprovalSinceLastReview(logPathAbs, 'f00999'),
			).rejects.toBeInstanceOf(PeerReviewLogUnreadableError);
		});

		it('returns true after an independent approve is appended', async () => {
			await recordProposalEnteredReview({
				logPathAbs,
				proposalId: 'f00999',
				from: 'in-progress',
				ts: '2026-07-25T10:00:00.000Z',
			});
			await recordProposalReviewAction({
				logPathAbs,
				proposalId: 'f00999',
				sliceId: 'S1',
				action: 'approve',
				implementer: 'alice',
				reviewer: 'bob',
				verdict: 'approved',
				ts: '2026-07-25T10:01:00.000Z',
			});
			const approved = await hasIndependentApprovalSinceLastReview(
				logPathAbs,
				'f00999',
			);
			expect(approved).toBe(true);
			// The writer produced a non-empty file, so `readPeerReviewLog`
			// on the same path returns entries without throwing.
			const entries = await readPeerReviewLog(logPathAbs);
			expect(entries).toHaveLength(2);
			// Sanity check the on-disk shape — protects against
			// accidental regressions that drop the trailing newline
			// and trip the new "empty file" error.
			const onDisk = readFileSync(logPathAbs, 'utf8');
			expect(onDisk.endsWith('\n')).toBe(true);
			expect(onDisk.trim().length).toBeGreaterThan(0);
		});

		it('accepts slice approvals earned BEFORE the first entry into review', async () => {
			// This is the normal shape of a first closure: slices are
			// reviewed while the proposal is still `in-progress`, and only
			// once every slice is approved does it become closure-ready and
			// move to review. Rejecting those approvals left no reachable
			// path to `done` — `proposal_review` refuses to re-approve an
			// already-approved slice — and stranded 128 proposals.
			await recordProposalReviewAction({
				logPathAbs,
				proposalId: 'f00999',
				sliceId: 'S1',
				action: 'approve',
				implementer: 'alice',
				reviewer: 'bob',
				verdict: 'approved',
				ts: '2026-07-25T09:00:00.000Z',
			});
			await recordProposalEnteredReview({
				logPathAbs,
				proposalId: 'f00999',
				from: 'in-progress',
				ts: '2026-07-25T10:00:00.000Z',
			});

			expect(
				await hasIndependentApprovalSinceLastReview(
					logPathAbs,
					'f00999',
				),
			).toBe(true);
		});

		it('still rejects a stale approval once the proposal was RE-OPENED', async () => {
			// Two entries into review can only happen by leaving review in
			// between, i.e. the work was re-opened and changed. The old
			// approval must not carry over to the new round.
			await recordProposalEnteredReview({
				logPathAbs,
				proposalId: 'f00999',
				from: 'in-progress',
				ts: '2026-07-25T10:00:00.000Z',
			});
			await recordProposalReviewAction({
				logPathAbs,
				proposalId: 'f00999',
				sliceId: 'S1',
				action: 'approve',
				implementer: 'alice',
				reviewer: 'bob',
				verdict: 'approved',
				ts: '2026-07-25T10:01:00.000Z',
			});
			await recordProposalEnteredReview({
				logPathAbs,
				proposalId: 'f00999',
				from: 'in-progress',
				ts: '2026-07-25T12:00:00.000Z',
			});

			expect(
				await hasIndependentApprovalSinceLastReview(
					logPathAbs,
					'f00999',
				),
			).toBe(false);
		});

		it('accepts a fresh approval after the re-opening', async () => {
			for (const ts of [
				'2026-07-25T10:00:00.000Z',
				'2026-07-25T12:00:00.000Z',
			]) {
				await recordProposalEnteredReview({
					logPathAbs,
					proposalId: 'f00999',
					from: 'in-progress',
					ts,
				});
			}
			await recordProposalReviewAction({
				logPathAbs,
				proposalId: 'f00999',
				sliceId: 'S1',
				action: 'approve',
				implementer: 'alice',
				reviewer: 'bob',
				verdict: 'approved',
				ts: '2026-07-25T12:30:00.000Z',
			});

			expect(
				await hasIndependentApprovalSinceLastReview(
					logPathAbs,
					'f00999',
				),
			).toBe(true);
		});

		it('never accepts a self-approval, whatever the timing', async () => {
			await recordProposalReviewAction({
				logPathAbs,
				proposalId: 'f00999',
				sliceId: 'S1',
				action: 'approve',
				implementer: 'alice',
				reviewer: 'alice',
				verdict: 'approved',
				ts: '2026-07-25T09:00:00.000Z',
			});
			await recordProposalEnteredReview({
				logPathAbs,
				proposalId: 'f00999',
				from: 'in-progress',
				ts: '2026-07-25T10:00:00.000Z',
			});

			expect(
				await hasIndependentApprovalSinceLastReview(
					logPathAbs,
					'f00999',
				),
			).toBe(false);
		});
	});
});
