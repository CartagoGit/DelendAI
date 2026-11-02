/**
 * unit-removal.service.spec.ts — a unit's branch is removed only at the
 * tip it was judged spent at.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { removeUnitCheckout } from '@delendai/core/lib/work-units/unit-removal.service';

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

const UNIT = 'delendai/wip/agent-a/implement/x00001-S1-g1/topic';

describe('removeUnitCheckout', () => {
	it('keeps a branch that moved on after it was judged, and removes one still at its tip', async () => {
		const root = mkdtempSync(join(tmpdir(), 'unit-removal-'));
		roots.push(root);
		git(root, 'init', '-q', '-b', 'develop');
		writeFileSync(join(root, 'a.txt'), 'a\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'base');
		git(root, 'branch', UNIT);
		const judged = git(root, 'rev-parse', UNIT);
		git(root, 'switch', '-q', UNIT);
		writeFileSync(join(root, 'b.txt'), 'b\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'committed after the judgement');
		git(root, 'switch', '-q', 'develop');

		const moved = await removeUnitCheckout(root, UNIT, { tip: judged });
		expect(moved.deletedBranch).toBe(false);
		expect(git(root, 'branch', '--list', UNIT)).toContain(UNIT);

		const atTip = await removeUnitCheckout(root, UNIT, {
			tip: git(root, 'rev-parse', UNIT),
		});
		expect(atTip.deletedBranch).toBe(true);
		expect(git(root, 'branch', '--list', UNIT)).toBe('');
	});
});
