/**
 * shared-checkout-shell-rescue.service.spec.ts — after a shell command, an
 * agent that holds a unit and left loose edits in the shared checkout has
 * them rescued, and is told the unit worktree; every other case is silent.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { rescueAfterShell } from '@delendai/core/lib/work-units/shared-checkout-shell-rescue.service';

const dirs: string[] = [];
const AGENT = 'claude-opus-5-5';

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

/** A shared checkout on `develop` where `AGENT` holds one unit worktree. */
const project = (): { root: string; unit: string } => {
	const parent = mkdtempSync(join(tmpdir(), 'shell-rescue-'));
	dirs.push(parent);
	const root = join(parent, 'repo');
	git(parent, 'init', '-q', '-b', 'develop', root);
	git(root, 'config', 'user.name', 'spec');
	git(root, 'config', 'user.email', 'spec@example.invalid');
	writeFileSync(join(root, 'a.txt'), 'as it was\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	const unit = join(parent, 'unit');
	git(
		root,
		'worktree',
		'add',
		'-q',
		'-b',
		`delendai/wip/${AGENT}/implement/x1-S1-g1/probe`,
		unit,
	);
	return { root, unit };
};

describe('rescueAfterShell', () => {
	it('says nothing for a clean checkout', () => {
		const { root } = project();
		expect(rescueAfterShell({ cwd: root, agent: AGENT, policy })).toEqual({
			outcome: 'none',
		});
	});

	it('rescues loose edits and names the unit worktree', () => {
		const { root, unit } = project();
		writeFileSync(join(root, 'a.txt'), 'edited by a heredoc\n');
		const verdict = rescueAfterShell({ cwd: root, agent: AGENT, policy });
		expect(verdict.outcome).toBe('rescued');
		expect(verdict.message).toContain(unit);
		expect(git(root, 'status', '--porcelain')).toBe('');
	});

	it('leaves the edits of an agent that holds no unit, and of an unidentified one', () => {
		const { root } = project();
		writeFileSync(join(root, 'a.txt'), 'a person edits\n');
		for (const agent of ['claude-opus-5-6', '']) {
			expect(rescueAfterShell({ cwd: root, agent, policy }).outcome).toBe(
				'none',
			);
		}
		expect(git(root, 'status', '--porcelain')).toBe('M a.txt');
	});
});
