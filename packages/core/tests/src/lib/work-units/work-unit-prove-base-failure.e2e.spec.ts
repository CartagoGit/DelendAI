/**
 * work-unit-prove-base-failure.e2e.spec.ts — on a real throwaway
 * repository, a failing spec that the integration branch's note names as
 * known-failing is reported as a base failure when the unit did not touch
 * it, and the proof fails without the note.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { knownFailingNoteOf } from '@delendai/core/lib/integration/land/known-failing-note.helper';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const UNIT_REF = 'delendai/wip/agent-a/implement/x00001-S1-g1/probe';

/** A repository whose proof fails on `a/old.spec.ts`, and a unit that touches `b.ts` only. */
const repo = (): { root: string; unit: string; base: string } => {
	const root = mkdtempSync(join(tmpdir(), 'prove-base-'));
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
			scripts: { prove: 'echo FAIL a/old.spec.ts; exit 1' },
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
	const base = git(root, 'rev-parse', 'HEAD');
	const unit = `${root}-unit`;
	roots.push(unit);
	git(root, 'worktree', 'add', '-q', '-b', UNIT_REF, unit);
	writeFileSync(join(unit, 'b.ts'), 'export {};\n');
	git(unit, 'add', '-A');
	git(unit, 'commit', '-q', '-m', 'unit');
	return { root, unit, base };
};

const contextFor = (cwd: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: cwd, json: true, remote: 'nowhere' }),
	});

const args = ['prove', '--proposal=x00001', '--slice=S1', '--agent=agent-a'];

describe('work prove with develop known failures', () => {
	it('[<5000ms] fails the proof when no note names the failing spec', async () => {
		const { unit } = repo();
		const result = await runWorkUnit(args, contextFor(unit));
		expect(result.code).not.toBe(0);
	});

	it('[<5000ms] reports the noted failing spec as base and passes the proof', async () => {
		const { root, unit, base } = repo();
		const note = knownFailingNoteOf({
			namespace: 'delendai',
			commit: base,
			failingSpecs: ['a/old.spec.ts'],
		});
		git(
			root,
			'notes',
			`--ref=${note.ref}`,
			'add',
			'-m',
			note.content,
			note.commit,
		);
		const result = await runWorkUnit(args, contextFor(unit));
		expect(result.error).toBeUndefined();
		expect(result.data).toMatchObject({ baseFailures: ['a/old.spec.ts'] });
	});
});
