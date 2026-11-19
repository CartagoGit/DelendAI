/**
 * The refs of one unit, whatever their kind and topic, under every owned
 * namespace (f00808).
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { READABLE_WORK_REF_SHAPE } from '@delendai/core/lib/development-policy/profiles.constant';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { unitRefsAnyName } from '@delendai/core/lib/work-units/unit-refs-any-name.service';

const template = createGitRepoTemplate({ trunk: 'develop' });

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
		{
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	).trim();

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

describe('unitRefsAnyName', () => {
	it('[<200ms] finds a unit under both namespaces, whatever its topic', () => {
		const root = template.copy().root;
		const old =
			'refs/heads/delendai/wip/agent-a/implement/x00001-S1-g1/one';
		const fresh = 'refs/heads/wip/agent-a/implement/x00001-S1-g2/two';
		git(root, 'update-ref', old, 'HEAD');
		git(root, 'update-ref', fresh, 'HEAD');
		git(
			root,
			'update-ref',
			'refs/heads/wip/agent-b/implement/x00001-S1-g1/one',
			'HEAD',
		);
		expect(
			[
				...unitRefsAnyName(
					root,
					['--kind=implement'],
					policy,
					'agent-a',
					'x00001',
					'S1',
				),
			].sort(),
		).toEqual([old, fresh].sort());
	});

	it('[<200ms] looks for nothing when the arguments name every part', () => {
		expect(
			unitRefsAnyName(
				'/nonexistent',
				['--kind=implement', '--topic=t', '--generation=1'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toEqual([]);
	});
});

describe('unitRefsAnyName under the scope grammar (f00808)', () => {
	const readable = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: {
				namespacePrefix: '',
				workRefTemplate: `heads/wip/${READABLE_WORK_REF_SHAPE}`,
			},
		},
	});
	const find = (root: string, of: typeof policy): readonly string[] =>
		unitRefsAnyName(
			root,
			['--kind=implement'],
			of,
			'agent-a',
			'x00001',
			'S1',
		);

	it('[<200ms] finds a generation-1 unit under the new shape, which spells no -G1', () => {
		const root = template.copy().root;
		const first = 'refs/heads/wip/implement/agent-a/x00001-S1/one';
		const second = 'refs/heads/wip/implement/agent-a/x00001-S1-G2/two';
		git(root, 'update-ref', first, 'HEAD');
		git(root, 'update-ref', second, 'HEAD');
		git(
			root,
			'update-ref',
			'refs/heads/wip/implement/agent-b/x00001-S1/one',
			'HEAD',
		);
		expect([...find(root, readable)].sort()).toEqual([second, first]);
	});

	it('[<200ms] finds a generation-1 unit under the old shape too', () => {
		const root = template.copy().root;
		const old = 'refs/heads/wip/agent-a/implement/x00001-S1-g1/one';
		git(root, 'update-ref', old, 'HEAD');
		expect([...find(root, policy)]).toEqual([old]);
	});
});
