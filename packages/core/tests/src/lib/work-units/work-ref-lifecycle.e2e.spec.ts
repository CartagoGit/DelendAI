/**
 * work-ref-lifecycle.e2e.spec.ts — the one reading of a work ref that is
 * worth a real clone: what git itself says of a tip's age and of the
 * proposal's folder at two refs. The rule's other cases are answered from
 * a table in work-ref-lifecycle.service.spec.ts.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { landedForgeRefKept } from '@delendai/core/lib/work-units/work-ref-lifecycle.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const ref = 'delendai/wip/glm-5.3-flash/implement/x00001-all-g1/thing';

/** A clone whose `refs/remotes/origin/*` stand where a fetch put them. */
const clone = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-ref-lifecycle-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'p@example.com');
	git(root, 'config', 'user.name', 'P');
	git(root, 'config', 'commit.gpgsign', 'false');
	mkdirSync(join(root, 'docs/delendai/proposals/in-progress'), {
		recursive: true,
	});
	writeFileSync(
		join(root, 'docs/delendai/proposals/in-progress/x00001-thing.md'),
		'---\nid: x00001\n---\n',
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'docs: in-progress');
	git(root, 'update-ref', 'refs/remotes/origin/develop', 'HEAD');
	return root;
};

describe('reading a clone', () => {
	it('[<401ms] lets a landed ref of an open proposal go once its unit is abandoned', () => {
		const root = clone();
		const old = execFileSync(
			'git',
			[
				'commit-tree',
				'refs/remotes/origin/develop^{tree}',
				'-p',
				'refs/remotes/origin/develop',
				'-m',
				'review done',
			],
			{
				cwd: root,
				encoding: 'utf8',
				env: {
					...process.env,
					GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
					GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
				},
			},
		).trim();
		git(root, 'update-ref', `refs/remotes/origin/${ref}`, old);
		expect(landedForgeRefKept(root, policy, 'origin', 'develop', ref)).toBe(
			false,
		);
	});
});
