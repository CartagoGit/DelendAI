/**
 * `work rename-namespace` (f00808 S7): never a ref with an open pull
 * request, never through a forge rename, and every tip kept.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	applyNamespaceRename,
	planNamespaceRename,
} from '@delendai/core/lib/work-units/namespace-rename.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

const OLD_WIP = 'delendai/wip/agent-a/implement/x1-S1-g1/t';
const OLD_PR = 'delendai/pr/agent-a/implement/x1-S1-g1/t';
const BRANCHES = [
	{ name: OLD_WIP, sha: 'aaa' },
	{ name: OLD_PR, sha: 'bbb' },
	{ name: 'wip/agent-b/implement/x2-S1-g1/t', sha: 'ccc' },
	{ name: 'develop', sha: 'ddd' },
	{ name: 'feature/mine', sha: 'eee' },
];

describe('planNamespaceRename', () => {
	it('[<20ms] moves only refs under a former namespace, to the same name under the current one', () => {
		const plan = planNamespaceRename({
			policy,
			branches: BRANCHES,
			openHeads: [],
		});
		expect(plan.refusal).toBeUndefined();
		expect(plan.moves).toEqual([
			{
				from: OLD_WIP,
				to: 'wip/agent-a/implement/x1-S1-g1/t',
				sha: 'aaa',
				keptAt: `refs/delendai/retired/${OLD_WIP}`,
			},
			{
				from: OLD_PR,
				to: 'pr/agent-a/implement/x1-S1-g1/t',
				sha: 'bbb',
				keptAt: `refs/delendai/retired/${OLD_PR}`,
			},
		]);
	});

	it('[<20ms] renames nothing while a pull request is open from a former namespace', () => {
		const plan = planNamespaceRename({
			policy,
			branches: BRANCHES,
			openHeads: [OLD_PR],
		});
		expect(plan.moves).toEqual([]);
		expect(plan.refusal).toContain(OLD_PR);
	});

	it('[<20ms] renames nothing when the open pull requests cannot be read', () => {
		const plan = planNamespaceRename({
			policy,
			branches: BRANCHES,
			openHeads: undefined,
		});
		expect(plan.moves).toEqual([]);
		expect(plan.refusal).toContain('could not be read');
	});

	it('[<20ms] leaves a ref whose new name another ref already has', () => {
		const plan = planNamespaceRename({
			policy,
			branches: [
				...BRANCHES,
				{ name: 'wip/agent-a/implement/x1-S1-g1/t', sha: 'fff' },
			],
			openHeads: [],
		});
		expect(plan.moves.map((move) => move.from)).toEqual([OLD_PR]);
	});

	it('[<20ms] has nothing to do without a former namespace', () => {
		const plain = resolveDevelopmentPolicy({
			development: { branches: { namespacePrefix: 'delendai' } },
		});
		expect(
			planNamespaceRename({
				policy: plain,
				branches: BRANCHES,
				openHeads: [],
			}).refusal,
		).toContain('No former namespace');
	});
});

describe('applyNamespaceRename', () => {
	const moves = planNamespaceRename({
		policy,
		branches: BRANCHES,
		openHeads: [],
	}).moves;

	it('[<20ms] pushes the new name at the same tip, keeps the old tip, then deletes the old name', () => {
		const calls: string[] = [];
		const result = applyNamespaceRename({
			git: (args) => {
				calls.push(args.join(' '));
				return { ok: true };
			},
			remote: 'origin',
			moves,
			openHeads: () => [],
		});
		expect(result.stopped).toBeUndefined();
		expect(calls.slice(0, 3)).toEqual([
			'push origin aaa:refs/heads/wip/agent-a/implement/x1-S1-g1/t',
			`push origin aaa:refs/delendai/retired/${OLD_WIP}`,
			`push origin :refs/heads/${OLD_WIP}`,
		]);
		expect(calls.some((call) => call.includes('rename'))).toBe(false);
	});

	it('[<20ms] does not rename a ref with an open pull request, checked just before it moves', () => {
		const calls: string[] = [];
		const result = applyNamespaceRename({
			git: (args) => {
				calls.push(args.join(' '));
				return { ok: true };
			},
			remote: 'origin',
			moves,
			openHeads: () => (calls.length === 0 ? [] : [OLD_PR]),
		});
		expect(result.moved).toEqual([
			`${OLD_WIP} -> wip/agent-a/implement/x1-S1-g1/t`,
		]);
		expect(result.stopped).toContain('a pull request is open');
		expect(calls.some((call) => call.includes(OLD_PR))).toBe(false);
	});

	it('[<20ms] stops at the first failed push and deletes nothing after it', () => {
		const calls: string[] = [];
		const result = applyNamespaceRename({
			git: (args) => {
				calls.push(args.join(' '));
				return { ok: !args.join(' ').includes('retired') };
			},
			remote: 'origin',
			moves,
			openHeads: () => [],
		});
		expect(result.moved).toEqual([]);
		expect(calls.some((call) => call.startsWith('push origin :'))).toBe(
			false,
		);
	});

	it('[<20ms] stops when the open pull requests cannot be read', () => {
		expect(
			applyNamespaceRename({
				git: () => ({ ok: true }),
				remote: 'origin',
				moves,
				openHeads: () => undefined,
			}).stopped,
		).toContain('could not be read');
	});
});
