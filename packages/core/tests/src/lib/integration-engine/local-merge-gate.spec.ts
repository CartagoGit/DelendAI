/**
 * Landing without a review object, without losing what the review
 * object was for.
 *
 * A forge that cannot require a check is a reason to check harder, not
 * a reason to stop. So most of these cases are about what this gate
 * REFUSES, and the two it refuses hardest are the two a "just merge it"
 * implementation gets wrong: a candidate nothing certified, and a
 * candidate certified against an integration head that has since moved.
 */

import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	gateLocalMerge,
	planLocalMerge,
} from '@delendai/core/lib/integration-engine/local-merge-gate';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OLD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const mergePolicy = () =>
	resolveDevelopmentPolicy({
		development: { profile: 'shared-checkout-merge' },
	});

const prPolicy = () =>
	resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			integration: { requiredChecks: ['delendai-validate'] },
		},
	});

const input = (over: Record<string, unknown> = {}) => ({
	workRef: 'refs/delendai/wip/agent-a/f1-s1-g1',
	workSha: 'cccccccccccccccccccccccccccccccccccccccc',
	integrationSha: HEAD,
	builtOnIntegrationHead: true,
	certification: { passed: true, againstIntegrationSha: HEAD },
	...over,
});

describe('gateLocalMerge', () => {
	it('takes the candidate when the project integrates by merge', () => {
		expect(gateLocalMerge(mergePolicy())).toBeUndefined();
	});

	// The counterpart of `policy-gate` declining every non-PR strategy:
	// between them, exactly one engine owns any given policy.
	it('declines when the project integrates by pull request', () => {
		expect(gateLocalMerge(prPolicy())?.decision).toBe('refuse');
	});
});

describe('planLocalMerge — what it refuses', () => {
	it('refuses a candidate nothing certified', () => {
		const verdict = planLocalMerge(
			mergePolicy(),
			input({ certification: undefined }),
		);
		expect(verdict.decision).toBe('refuse');
		expect(verdict.reason).toContain('no certification');
	});

	it('refuses a candidate whose certification failed', () => {
		expect(
			planLocalMerge(
				mergePolicy(),
				input({
					certification: {
						passed: false,
						againstIntegrationSha: HEAD,
					},
				}),
			).decision,
		).toBe('refuse');
	});

	it('refuses to run at all under a pull-request policy', () => {
		expect(planLocalMerge(prPolicy(), input()).decision).toBe('refuse');
	});
});

describe('planLocalMerge — what it sends back to be re-checked', () => {
	// The invariant the pull-request path is built around, kept: a pass
	// is a statement about a PAIR, not about a commit.
	it('re-validates a candidate certified against a head that moved', () => {
		const verdict = planLocalMerge(
			mergePolicy(),
			input({
				certification: { passed: true, againstIntegrationSha: OLD },
			}),
		);
		expect(verdict.decision).toBe('revalidate');
		expect(verdict.reason).toContain('no longer exists');
	});

	it('re-validates a candidate not built on the current head', () => {
		expect(
			planLocalMerge(
				mergePolicy(),
				input({ builtOnIntegrationHead: false }),
			).decision,
		).toBe('revalidate');
	});

	// `revalidate` and `refuse` must not collapse: one is a question
	// nobody has answered yet, the other is somebody's mistake, and an
	// operator reading a queue needs to tell them apart.
	it('keeps a moved base distinct from a failure', () => {
		const moved = planLocalMerge(
			mergePolicy(),
			input({
				certification: { passed: true, againstIntegrationSha: OLD },
			}),
		);
		const failed = planLocalMerge(
			mergePolicy(),
			input({
				certification: { passed: false, againstIntegrationSha: HEAD },
			}),
		);
		expect(moved.decision).not.toBe(failed.decision);
	});
});

describe('planLocalMerge — what it lands', () => {
	it('lands a candidate certified against the current head', () => {
		expect(planLocalMerge(mergePolicy(), input()).decision).toBe('merge');
	});

	it('carries the merge method the policy chose', () => {
		expect(planLocalMerge(mergePolicy(), input()).mergeMethod).toBe(
			mergePolicy().integration.mergeMethod,
		);
	});

	it('names the ref in every verdict it gives', () => {
		for (const over of [
			{},
			{ certification: undefined },
			{ builtOnIntegrationHead: false },
		]) {
			expect(planLocalMerge(mergePolicy(), input(over)).reason).toContain(
				'refs/delendai/wip/agent-a/f1-s1-g1',
			);
		}
	});
});
