/**
 * unit-push.service.spec.ts — a commit on a unit's branch reaches the
 * same branch on the forge, and a refused push says how to reconcile.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { pushUnitTip } from '@delendai/core/lib/work-units/unit-push.service';
import { dropForgeCopy } from '@delendai/core/lib/work-units/unit-removal.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const BRANCH = 'delendai/wip/agent/x1/topic';

describe('pushUnitTip', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const setup = () => {
		const top = mkdtempSync(join(tmpdir(), 'unit-push-'));
		dirs.push(top);
		const run = (cwd: string, ...args: string[]): string =>
			execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
		const remote = join(top, 'remote.git');
		run(top, 'init', '-q', '--bare', '-b', 'develop', remote);
		const root = join(top, 'clone');
		run(top, 'init', '-q', '-b', 'develop', root);
		run(root, 'config', 'user.name', 'spec');
		run(root, 'config', 'user.email', 'spec@example.invalid');
		run(root, 'remote', 'add', 'origin', remote);
		writeFileSync(join(root, 'a.txt'), 'a\n');
		run(root, 'add', '-A');
		run(root, 'commit', '-q', '-m', 'base');
		run(root, 'push', '-q', 'origin', 'develop');
		const unit = join(top, 'unit');
		run(root, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		writeFileSync(join(unit, 'b.txt'), 'b\n');
		run(unit, 'add', '-A');
		run(unit, 'commit', '-q', '-m', 'work');
		return { run, remote, root, unit };
	};

	it('pushes the unit branch, and skips the shared checkout and other branches', () => {
		const { run, remote, root, unit } = setup();
		expect(
			pushUnitTip({
				cwd: unit,
				branch: BRANCH,
				inMainWorktree: false,
				policy,
			}),
		).toEqual({ status: 'pushed', branch: BRANCH, remote: 'origin' });
		expect(run(remote, 'rev-parse', BRANCH)).toBe(
			run(unit, 'rev-parse', 'HEAD'),
		);
		expect(
			pushUnitTip({
				cwd: root,
				branch: 'develop',
				inMainWorktree: true,
				policy,
			}).status,
		).toBe('skipped');
		expect(
			pushUnitTip({
				cwd: unit,
				branch: 'feature/x',
				inMainWorktree: false,
				policy,
			}).status,
		).toBe('skipped');
	});

	it('reports a branch that moved on the forge, with the reconciling command, and never forces', () => {
		const { run, remote, unit } = setup();
		pushUnitTip({
			cwd: unit,
			branch: BRANCH,
			inMainWorktree: false,
			policy,
		});
		const pushedTip = run(remote, 'rev-parse', BRANCH);
		run(unit, 'commit', '-q', '--amend', '-m', 'rewritten');
		const refused = pushUnitTip({
			cwd: unit,
			branch: BRANCH,
			inMainWorktree: false,
			policy,
		});
		expect(refused).toMatchObject({ status: 'refused', branch: BRANCH });
		expect(refused.status === 'refused' && refused.repair).toContain(
			`git fetch origin ${BRANCH}`,
		);
		expect(run(remote, 'rev-parse', BRANCH)).toBe(pushedTip);
	});

	it("drops the forge's copy of a spent unit only while it is at the tip removed", () => {
		const { run, remote, root, unit } = setup();
		pushUnitTip({
			cwd: unit,
			branch: BRANCH,
			inMainWorktree: false,
			policy,
		});
		const tip = run(unit, 'rev-parse', 'HEAD');
		// Moved on another machine: somebody's work, kept.
		expect(dropForgeCopy(root, 'origin', BRANCH, 'f'.repeat(40))).toBe(
			false,
		);
		expect(run(remote, 'rev-parse', BRANCH)).toBe(tip);
		expect(dropForgeCopy(root, 'origin', BRANCH, tip)).toBe(true);
		expect(run(remote, 'branch', '--list', BRANCH)).toBe('');
	});

	it("says it is a durability push, so a project's publication checks can let it through", () => {
		const { run, remote, root, unit } = setup();
		const hook = join(root, '.git', 'hooks', 'pre-push');
		writeFileSync(
			hook,
			'#!/bin/sh\ntest "$DELENDAI_DURABILITY_PUSH" = 1\n',
		);
		chmodSync(hook, 0o755);
		expect(
			pushUnitTip({
				cwd: unit,
				branch: BRANCH,
				inMainWorktree: false,
				policy,
			}).status,
		).toBe('pushed');
		expect(run(remote, 'rev-parse', BRANCH)).toBe(
			run(unit, 'rev-parse', 'HEAD'),
		);
	});
});
