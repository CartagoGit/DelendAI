/**
 * reviewer-move-guard.service.spec.ts — a reviewer does not move a
 * proposal it holds a verdict on, and is told what the verdict did.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	reviewerMoveRefusal,
	reviewerMoveRefusalFor,
	verdictsHeldBy,
} from '@delendai/proposals/lib/services/reviewer-move-guard.service';
import { runProposalForceTransition } from '@delendai/proposals/lib/tools/recovery-tools';

const SENT_BACK = `---
id: x00001
status: review
---

### S1 — work
- **Status**: pending
- review-state: changes_requested
- review-implementer: agent-a
- review-reviewer: agent-b
- review-log: requested_changes by agent-b — fix it

### S2 — more
- **Status**: done
- review-state: done
- review-implementer: agent-a
- review-reviewer: agent-b
- review-log: approved by agent-b — fine
`;

describe('reviewerMoveRefusal', () => {
	it('lists the verdicts an agent holds, the last one per slice', () => {
		expect(verdictsHeldBy(SENT_BACK, 'AGENT-B')).toEqual([
			{ sliceId: 'S1', verdict: 'requested_changes' },
			{ sliceId: 'S2', verdict: 'approved' },
		]);
		expect(verdictsHeldBy(SENT_BACK, 'agent-c')).toEqual([]);
	});

	it('refuses the reviewer, naming what its verdict already did', () => {
		const refusal = reviewerMoveRefusal({
			proposalId: 'x00001',
			markdown: SENT_BACK,
			reviewer: 'agent-b',
			inReviewUnit: false,
			to: 'in-progress',
		});
		expect(refusal?.reason).toContain(
			'agent-b holds verdicts on x00001 (S1 requested_changes, S2 approved)',
		);
		expect(refusal?.nextAction).toContain(
			'stays in review/ with review-state changes_requested',
		);
	});

	it('lets the implementer and an agent with no verdict move it', () => {
		for (const reviewer of ['agent-a', 'agent-c', undefined]) {
			expect(
				reviewerMoveRefusal({
					proposalId: 'x00001',
					markdown: SENT_BACK,
					reviewer,
					inReviewUnit: false,
					to: 'in-progress',
				}),
			).toBeUndefined();
		}
	});

	it('refuses from a review unit even an agent that also delivered a slice', () => {
		const both = SENT_BACK.replace(
			'- review-implementer: agent-a\n- review-reviewer: agent-b\n- review-log: approved by agent-b — fine',
			'- review-implementer: agent-b\n- review-reviewer: agent-a\n- review-log: approved by agent-a — fine',
		);
		expect(both).toContain('review-implementer: agent-b');
		const call = {
			proposalId: 'x00001',
			markdown: both,
			reviewer: 'agent-b',
			to: 'ready',
		};
		expect(
			reviewerMoveRefusal({ ...call, inReviewUnit: false }),
		).toBeUndefined();
		expect(
			reviewerMoveRefusal({ ...call, inReviewUnit: true })?.reason,
		).toContain('the move to ready was not made');
	});
});

describe('reviewerMoveRefusalFor', () => {
	const withProposal = async (
		run: (root: string) => Promise<void>,
	): Promise<void> => {
		const root = mkdtempSync(join(tmpdir(), 'reviewer-move-'));
		try {
			mkdirSync(join(root, 'review'), { recursive: true });
			writeFileSync(join(root, 'review', 'x00001-work.md'), SENT_BACK);
			await run(root);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	};
	// Not a review unit: the caller is who it names.
	const noUnit = async () => ({ ok: false, output: '', reason: 'detached' });

	it('refuses the agent the call names when it holds a verdict', async () => {
		await withProposal(async (root) => {
			const refusal = await reviewerMoveRefusalFor({
				id: 'x00001',
				to: 'in-progress',
				agent: 'agent-b',
				workspaceRoot: root,
				proposalsDirAbs: root,
				indexPathAbs: undefined,
				shape: undefined,
				run: noUnit,
			});
			expect(refusal?.reason).toContain(
				'agent-b holds verdicts on x00001',
			);
		});
	});

	it('refuses a reviewer forcing the proposal it sent back', async () => {
		await withProposal(async (root) => {
			const forced = await runProposalForceTransition(
				{
					id: 'x00001',
					to: 'in-progress',
					reason: 'changes requested recorded; returning to implementer queue',
					agent: 'agent-b',
				},
				{
					namespacePrefix: 'proposals',
					indexPathAbs: join(root, 'index.json'),
					proposalsDirAbs: root,
					lockPathAbs: join(root, 'locks.json'),
					agentRegistryPathAbs: join(root, 'registry.json'),
					workspaceRoot: root,
					gitRunner: noUnit,
				},
			);
			expect(forced.isError).toBe(true);
			expect(JSON.stringify(forced)).toContain(
				'holds verdicts on x00001',
			);
		});
	});
});
