/**
 * pull-request-urgency.service.e2e.spec.ts — the reason a delivery is urgent
 * is noted in the unit's own git directory, so the transition that
 * publishes it carries it onto the pull request (x01051).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	noteUnitUrgency,
	unitUrgencyNote,
	urgencyOfUnit,
} from '@delendai/core/lib/work-units/pull-request-urgency.service';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const REF = 'delendai/wip/a/implement/x1-all-g1/t';

const unit = () => {
	const top = mkdtempSync(join(tmpdir(), 'urgency-'));
	dirs.push(top);
	const root = join(top, 'root');
	execFileSync('mkdir', [root]);
	git(root, 'init', '-q', '--initial-branch', 'develop');
	git(root, 'config', 'user.email', 'u@example.com');
	git(root, 'config', 'user.name', 'U');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	const worktree = join(top, 'unit');
	git(root, 'worktree', 'add', '-q', '-b', REF, worktree);
	return { top, root, worktree };
};

describe('the urgent note of a unit', () => {
	it('is written once and read back by the publication', async () => {
		const { root, worktree } = unit();
		expect(await unitUrgencyNote(worktree)).toBeUndefined();
		expect(await urgencyOfUnit([], root, REF)).toBeUndefined();

		expect(await noteUnitUrgency(worktree, 'the queue loops')).toBe(true);
		expect(await unitUrgencyNote(worktree)).toBe('the queue loops');
		expect(await urgencyOfUnit([], root, `refs/heads/${REF}`)).toBe(
			'the queue loops',
		);
	});

	it('gives way to what the publishing command was told', async () => {
		const { root, worktree } = unit();
		await noteUnitUrgency(worktree, 'noted');
		expect(await urgencyOfUnit(['--urgent=said'], root, REF)).toBe('said');
	});

	it('notes nothing for an empty reason or a place that is no worktree', async () => {
		const { top, worktree } = unit();
		expect(await noteUnitUrgency(worktree, '   ')).toBe(false);
		expect(await noteUnitUrgency(join(top, 'nowhere'), 'x')).toBe(false);
		expect(await unitUrgencyNote(join(top, 'nowhere'))).toBeUndefined();
	});
});
