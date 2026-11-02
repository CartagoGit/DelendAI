/**
 * work-unit-generation.remote.spec.ts — spent generations are read from
 * the remote the integration branch lives on, whatever it is called.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import { endedGenerations } from '@delendai/core/lib/work-units/work-unit-generation.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

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

const policy = fakePartial<IResolvedDevelopmentPolicy>({
	branches: fakePartial<IResolvedDevelopmentPolicy['branches']>({
		integration: 'develop',
		namespacePrefix: 'delendai',
		workRefPrefix: 'delendai/wip/',
	}),
});

const UNIT = 'delendai/wip/agent-a/implement/x00001-S1-g';

describe('endedGenerations', () => {
	it('reads the merges and retired refs of the integration remote, not of origin', () => {
		const base = mkdtempSync(join(tmpdir(), 'generation-remote-'));
		roots.push(base);
		const upstream = join(base, 'upstream.git');
		const origin = join(base, 'origin.git');
		git(base, 'init', '-q', '--bare', upstream);
		git(base, 'init', '-q', '--bare', origin);
		const root = join(base, 'clone');
		git(base, 'init', '-q', '-b', 'develop', root);
		writeFileSync(join(root, 'a.txt'), 'a\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'base');
		// Generation 1 of the unit merged into the integration branch.
		git(root, 'switch', '-q', '-c', `${UNIT}1/topic`);
		writeFileSync(join(root, 'b.txt'), 'b\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'work');
		git(root, 'switch', '-q', 'develop');
		git(
			root,
			'merge',
			'-q',
			'--no-ff',
			'-m',
			`Merge ${UNIT}1/topic`,
			`${UNIT}1/topic`,
		);
		git(root, 'remote', 'add', 'upstream', upstream);
		git(root, 'remote', 'add', 'origin', origin);
		git(root, 'push', '-q', 'upstream', 'develop');
		// Generation 3 kept retired on the integration remote.
		git(
			root,
			'push',
			'-q',
			'upstream',
			`HEAD:refs/delendai/retired/${UNIT}3/topic`,
		);
		git(root, 'fetch', '-q', 'upstream');
		git(
			root,
			'branch',
			'-q',
			'--set-upstream-to=upstream/develop',
			'develop',
		);
		// The local branch forgets the merge: only the remote holds it.
		git(root, 'reset', '-q', '--hard', 'HEAD~1');

		const ended = endedGenerations(
			root,
			policy,
			`refs/heads/${UNIT}4/topic`,
		);

		expect([...ended].sort()).toEqual([1, 3]);
	});
});
