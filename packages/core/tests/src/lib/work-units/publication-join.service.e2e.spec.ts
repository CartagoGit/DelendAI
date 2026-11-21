/**
 * publication-join.service.e2e.spec.ts — two slices of one proposal that
 * share a publication: the second joins it instead of failing
 * non-fast-forward, and a conflicting one is refused with the files named.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';
import { cleanUnitRepos, commitOnRef, unitRepo } from './unit-repo.helper';

const bares: string[] = [];

afterEach(() => {
	cleanUnitRepos();
	for (const bare of bares.splice(0)) {
		rmSync(bare, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const context = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: root, json: true, remote: 'origin' }),
	});

/** A small proposal of two slices: the policy publishes it as one pull request. */
const PROPOSAL = {
	'docs/proposals/ready/x00001-probe.md':
		'# x00001\n\n### S1 — a\n\n### S2 — b\n',
};

const refOf = (slice: string): string =>
	`delendai/wip/claude-opus-5/implement/x00001-${slice}-g1/probe`;

const publish = (root: string, slice: string) =>
	runWorkUnit(
		[
			'publish',
			'--proposal=x00001',
			`--slice=${slice}`,
			'--agent=claude-opus-5',
			'--topic=probe',
			'--no-pull-request',
			'--keep-work-ref',
		],
		context(root),
	);

const setup = (): { root: string; bare: string } => {
	const { root } = unitRepo();
	const bare = mkdtempSync(join(tmpdir(), 'join-remote-'));
	bares.push(bare);
	git(bare, 'init', '-q', '--bare');
	git(root, 'remote', 'add', 'origin', bare);
	git(root, 'push', '-q', 'origin', 'develop');
	return { root, bare };
};

describe('slices of one proposal publishing into one publication', () => {
	it('[<15000ms] joins the open publication without an agent-side merge', async () => {
		const { root, bare } = setup();
		const first = commitOnRef(root, refOf('S1'), {
			...PROPOSAL,
			'a.ts': 'export const a = 1;\n',
		});
		const second = commitOnRef(root, refOf('S2'), {
			...PROPOSAL,
			'b.ts': 'export const b = 2;\n',
		});

		const one = await publish(root, 'S1');
		expect(one.code).toBe(0);
		const two = await publish(root, 'S2');

		expect(two.code).toBe(0);
		expect(JSON.stringify(two.data)).not.toContain(
			'merge it into this work',
		);
		const heads = git(
			bare,
			'for-each-ref',
			'--format=%(refname)',
			'refs/heads/delendai/pr',
		);
		const [publication] = heads.split('\n');
		expect(publication).toBeDefined();
		for (const commit of [first, second]) {
			expect(() =>
				git(
					bare,
					'merge-base',
					'--is-ancestor',
					commit,
					publication as string,
				),
			).not.toThrow();
		}
	});

	it('[<15000ms] refuses a conflicting unit with the files named and leaves it unchanged', async () => {
		const { root } = setup();
		commitOnRef(root, refOf('S1'), {
			...PROPOSAL,
			'same.ts': 'export const v = 1;\n',
		});
		const unit = commitOnRef(root, refOf('S2'), {
			...PROPOSAL,
			'same.ts': 'export const v = 2;\n',
		});

		expect((await publish(root, 'S1')).code).toBe(0);
		const two = await publish(root, 'S2');

		expect(two.code).not.toBe(0);
		expect(two.error).toContain('same.ts');
		expect(git(root, 'rev-parse', `refs/heads/${refOf('S2')}`)).toBe(unit);
	});
});
