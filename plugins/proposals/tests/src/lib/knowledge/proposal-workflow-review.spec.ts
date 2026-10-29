/**
 * proposal-workflow-review.spec.ts — every host receives the same review
 * procedure from the server, and nothing in it depends on this
 * repository's own scripts or on one machine's cache (x00646 S4).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProposalWorkflow } from '@delendai/proposals/lib/knowledge/proposal-workflow';
import { checkApproveIdentity } from '@delendai/proposals/lib/services/review-identity';

const approver = (agent: string) => ({ host: 'elsewhere', pid: 1, agent });

describe('the review procedure the server hands out', () => {
	const rules = buildProposalWorkflow('docs/proposals', 'index.json').rules;

	it('starts a reviewer at the queue and keeps it to verdicts', () => {
		const review = rules.find((rule) =>
			rule.startsWith('Reviewing proposals'),
		);
		expect(review).toContain('review_queue');
		expect(review).toContain('request_changes');
		expect(review).toContain('Never edit code');
		expect(review).toContain('never submit for the implementer');
	});

	it('tells the implementer how to hand work to review', () => {
		expect(
			rules.some(
				(rule) =>
					rule.includes('to=review') &&
					rule.includes('agent=<implementer>'),
			),
		).toBe(true);
	});
});

describe('checkApproveIdentity without the local journal', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'identity-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('trusts the implementer the document records, and still refuses a self-approval', async () => {
		const base = {
			workspaceRoot: root,
			proposalId: 'x00001',
			sliceId: 'S1',
			recordedImplementer: 'agent-a',
		};

		await expect(
			checkApproveIdentity({ ...base, approver: approver('agent-b') }),
		).resolves.toEqual({ ok: true, submitter: null });
		await expect(
			checkApproveIdentity({ ...base, approver: approver('Agent-A') }),
		).resolves.toMatchObject({ ok: false, reason: 'self-approve' });
	});

	it('names only product commands when no round is known at all', async () => {
		const result = await checkApproveIdentity({
			workspaceRoot: root,
			proposalId: 'x00001',
			sliceId: 'S1',
			approver: approver('agent-b'),
		});

		expect(result.ok).toBe(false);
		const nextAction = result.ok ? '' : result.nextAction;
		expect(nextAction).toContain('commitHash');
		expect(nextAction).toContain('delendai proposals review x00001 S1');
		expect(nextAction).not.toContain('tools/scripts');
	});
});
