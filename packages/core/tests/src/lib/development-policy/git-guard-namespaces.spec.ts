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
	it('reads the prefix from the policy', () => {
		expect(policyNamespaces(policy).prefixes).toEqual(
			expect.arrayContaining([
				'wip/',
				'pr/',
				'delendai/wip/',
				'delendai/pr/',
			]),
		);
	});

	it('recognises both prefixes', () => {
		expect(insideNamespaces(policy, OLD)).toBe(true);
		expect(insideNamespaces(policy, NEW)).toBe(true);
		expect(insideNamespaces(policy, `delendai/pr/${NEW.slice(4)}`)).toBe(
			true,
		);
		expect(insideNamespaces(policy, 'feature/mine')).toBe(false);
	});

	it('keeps a live unit under the former prefix pushable', () => {
		expect(
			refuseUnshapedWorkRef(policy, `refs/heads/${OLD}`, OLD, false),
		).toBeUndefined();
		expect(
			refuseUnshapedWorkRef(policy, `refs/heads/${NEW}`, NEW),
		).toBeUndefined();
	});

	it('still refuses a hand-typed name under the former prefix', () => {
		const typed = 'delendai/wip/claude-opus-5-5/my-branch';
		expect(
			refuseUnshapedWorkRef(policy, `refs/heads/${typed}`, typed)
				?.refused,
		).toBe(true);
	});

	it('accepts a publication of either namespace', () => {
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

describe("the merge queue's train refs", () => {
	const AGENT = { agentMarker: 'GITHUB_ACTIONS' } as const;
	const push = (branch: string) => ({
		kind: 'push' as const,
		remoteRef: `refs/heads/${branch}`,
		deleting: false,
	});

	it('admits a train and a culprit marker under either namespace', () => {
		for (const branch of [
			'train/3328521623df/1778-1808',
			'train/culprit/1802',
			'delendai/train/3328521623df/1778-1808',
			'delendai/train/culprit/1802',
		]) {
			expect(insideNamespaces(policy, branch)).toBe(true);
			expect(judgeGitOperation(policy, push(branch), AGENT).refused).toBe(
				false,
			);
		}
	});

	it('still refuses a branch outside every namespace', () => {
		expect(judgeGitOperation(policy, push('trains/x'), AGENT).refused).toBe(
			true,
		);
	});
});
