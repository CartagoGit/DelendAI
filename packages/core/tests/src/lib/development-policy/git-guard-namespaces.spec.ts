/**
 * The guard's namespaces include every owned prefix: a live unit or a
 * publication under a former namespace keeps being delendai's (f00808).
 */
import { describe, expect, it } from 'vitest';

import {
	insideNamespaces,
	policyNamespaces,
} from '@delendai/core/lib/integration/decisions/namespaces.helper';
import { judgeGitOperation } from '@delendai/core/lib/development-policy/git-guard';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	refuseUnshapedPublication,
	refuseUnshapedWorkRef,
} from '@delendai/core/lib/development-policy/git-guard-shape';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

const OLD = 'delendai/wip/claude-opus-5-5/implement/f00808-S2-g1/guards';
const NEW = 'wip/claude-opus-5-5/implement/f00808-S2-g1/guards';

describe('guard namespaces in a transition', () => {
	it('[<5ms] reads the prefix from the policy', () => {
		expect(policyNamespaces(policy).prefixes).toEqual(
			expect.arrayContaining([
				'wip/',
				'pr/',
				'delendai/wip/',
				'delendai/pr/',
			]),
		);
	});

	it('[<5ms] recognises both prefixes', () => {
		expect(insideNamespaces(policy, OLD)).toBe(true);
		expect(insideNamespaces(policy, NEW)).toBe(true);
		expect(insideNamespaces(policy, `delendai/pr/${NEW.slice(4)}`)).toBe(
			true,
		);
		expect(insideNamespaces(policy, 'feature/mine')).toBe(false);
	});

	it('[<7ms] keeps a live unit under the former prefix pushable', () => {
		expect(
			refuseUnshapedWorkRef(policy, `refs/heads/${OLD}`, OLD, false),
		).toBeUndefined();
		expect(
			refuseUnshapedWorkRef(policy, `refs/heads/${NEW}`, NEW),
		).toBeUndefined();
	});

	it('[<5ms] still refuses a hand-typed name under the former prefix', () => {
		const typed = 'delendai/wip/claude-opus-5-5/my-branch';
		expect(
			refuseUnshapedWorkRef(policy, `refs/heads/${typed}`, typed)
				?.refused,
		).toBe(true);
	});

	it('[<6ms] accepts a publication of either namespace', () => {
		const oldPublication = OLD.replace('delendai/wip/', 'delendai/pr/');
		const newPublication = NEW.replace('wip/', 'pr/');
		expect(
			refuseUnshapedPublication(policy, oldPublication),
		).toBeUndefined();
		expect(
			refuseUnshapedPublication(policy, newPublication),
		).toBeUndefined();
		expect(
			refuseUnshapedPublication(policy, 'pr/proposal-f00643')?.refused,
		).toBe(true);
	});
});

describe("land's batch refs", () => {
	const AGENT = { agentMarker: 'GITHUB_ACTIONS' } as const;
	const push = (branch: string) => ({
		kind: 'push' as const,
		remoteRef: `refs/heads/${branch}`,
		deleting: false,
	});

	it('[<7ms] admits a batch under either namespace, and no retired train', () => {
		expect(
			judgeGitOperation(
				policy,
				push('delendai/train/culprit/1802'),
				AGENT,
			).refused,
		).toBe(true);
		for (const branch of [
			'queue/batch-1778+1808',
			'delendai/queue/batch-1778+1808',
		]) {
			expect(insideNamespaces(policy, branch)).toBe(true);
			expect(judgeGitOperation(policy, push(branch), AGENT).refused).toBe(
				false,
			);
		}
	});

	it('[<6ms] still refuses a branch outside every namespace', () => {
		expect(judgeGitOperation(policy, push('queues/x'), AGENT).refused).toBe(
			true,
		);
	});
});
