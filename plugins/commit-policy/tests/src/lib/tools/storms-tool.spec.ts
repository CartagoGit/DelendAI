import { describe, expect, it, vi } from 'vitest';

import { runCommitPolicyStorms } from '@delendai/commit-policy/lib/tools/storms-tool';

describe('commit_policy_storms', () => {
	it('returns a toolOk payload with inferred suggestedFix and RFC3339 timestamps', async () => {
		const now = Date.now();

		const result = await runCommitPolicyStorms({
			namespacePrefix: 'delendai',
			observedEvents: [
				{
					timestamp: now,
					code: 'WORKSPACE_HAS_NO_FILES',
					trigger: 'slice',
					proposalId: 'x00419',
				},
			],
		});

		expect(result.isError).toBeUndefined();
		const body = result.structuredContent as {
			ok: boolean;
			storms: Array<{
				code: string;
				trigger: string;
				count: number;
				windowSeconds: number;
				sampleProposalIds: string[];
				firstSeenAt: string;
				windowStartedAt: string;
				lastSeenAt: string;
				suggestedFix?: string;
				exceedsThreshold: boolean;
			}>;
			totalEventsInWindow: number;
			windowSeconds: number;
			threshold: number;
		};

		expect(body).toEqual({
			ok: true,
			storms: [
				{
					code: 'WORKSPACE_HAS_NO_FILES',
					trigger: 'slice',
					count: 1,
					windowSeconds: 30,
					sampleProposalIds: ['x00419'],
					firstSeenAt: new Date(now).toISOString(),
					windowStartedAt: new Date(now).toISOString(),
					lastSeenAt: new Date(now).toISOString(),
					suggestedFix:
						'resolve-scope.ts: files is empty after the stage step. Check whether the resolver is filtering by workspaceDirty.',
					exceedsThreshold: false,
				},
			],
			totalEventsInWindow: 1,
			windowSeconds: 30,
			threshold: 5,
		});
		expect(result.content).toEqual([
			{ type: 'text', text: JSON.stringify(body) },
		]);
	});

	it('returns an empty success snapshot and does not invoke onSnapshot', async () => {
		const onSnapshot = vi.fn();

		const result = await runCommitPolicyStorms({
			namespacePrefix: 'delendai',
			onSnapshot,
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toEqual({
			ok: true,
			storms: [],
			totalEventsInWindow: 0,
			windowSeconds: 30,
			threshold: 5,
		});
		expect(onSnapshot).not.toHaveBeenCalled();
	});
});
