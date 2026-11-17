/**
 * work-unit-prove-only.e2e.spec.ts — `work prove --only=<gate>` runs the
 * project's prove script with the gate, in the unit's worktree, on a real
 * repository, and leaves the unit unproved.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository whose `prove` script ends with `exit <code>`, and a unit worktree of it. */
const repo = (code: number): { root: string; unit: string } => {
	const root = mkdtempSync(join(tmpdir(), 'prove-only-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({
			name: 'probe',
			private: true,
			scripts: {
				prove: `echo gate-ran-$npm_config_argv; exit ${String(code)}`,
			},
		}),
	);
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	const unit = `${root}-unit`;
	roots.push(unit);
	git(root, 'worktree', 'add', '-q', '-b', 'unit', unit);
	return { root, unit };
};

const contextFor = (cwd: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: cwd, json: true, remote: 'nowhere' }),
	});

describe('work prove --only', () => {
	it('[<1000ms] runs the prove script from the unit worktree and does not prove the unit', async () => {
		const { root, unit } = repo(0);
		const result = await runWorkUnit(
			['prove', '--only=typecheck'],
			contextFor(unit),
		);
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({
			only: 'typecheck',
			partial: true,
			proved: false,
		});
		expect(existsSync(join(root, '.git', 'delendai-proofs'))).toBe(false);
	});

	it('[<1000ms] a failing gate is a refusal that says the unit is not proved', async () => {
		const { unit } = repo(1);
		const result = await runWorkUnit(
			['prove', '--only=typecheck'],
			contextFor(unit),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('partial: the unit is not proved');
	});

	it('[<1000ms] an unknown gate that the script rejects with 2 exits 2', async () => {
		const { unit } = repo(2);
		const result = await runWorkUnit(
			['prove', '--only=nope'],
			contextFor(unit),
		);
		expect(result.code).toBe(2);
	});

	it('[<1000ms] refuses to run in the shared checkout, and a malformed gate list', async () => {
		const { root, unit } = repo(0);
		expect(
			(await runWorkUnit(['prove', '--only=a'], contextFor(root))).code,
		).not.toBe(0);
		expect(
			(
				await runWorkUnit(
					['prove', '--only=a;rm -rf /'],
					contextFor(unit),
				)
			).code,
		).toBe(2);
	});
});
