/**
 * work-unit-abandon.service.spec.ts — a unit ends in publish or abandon;
 * abandoning keeps the tip and needs the abandoned verdict, or the owner
 * with --force. Driven through the same engine the CLI runs.
 */
import { existsSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { EXIT_CODE } from '@delendai/core/lib/contracts/constants/exit-code.constant';
import type { IWorkUnitResult } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

import { cleanUnitRepos, git, unitRef, unitRepo } from './unit-repo.helper';

afterEach(cleanUnitRepos);

const MINUTE = 60;
const wall = (): number => Math.floor(Date.now() / 1000);

const abandonWith = (
	root: string,
	...args: string[]
): Promise<IWorkUnitResult> =>
	runWorkUnit(['abandon', ...args], {
		cwd: root,
		globals: { workspace: root, json: true, format: 'json' },
	});

const unitHeldBy = async (
	agent: string,
	session: string,
	ageMinutes: number,
) => {
	const repo = unitRepo();
	const ref = unitRef(agent);
	const worktree = repo.enter(ref);
	repo.commit(worktree, 'wip.ts');
	await recordUnitEntered({
		cwd: repo.root,
		ref,
		owner: { agent, session },
		worktree,
		now: wall() - ageMinutes * MINUTE,
	});
	return { repo, ref, worktree };
};

describe('work abandon', () => {
	it('refuses a live unit', async () => {
		const { repo, ref } = await unitHeldBy('busy', 's1', 1);
		const result = await abandonWith(repo.root, `--ref=${ref}`);
		expect(result.code).not.toBe(EXIT_CODE.OK);
		expect(result.error).toContain('live');
		expect(git(repo.root, 'branch', '--list', ref)).toContain(ref);
	});

	it('refuses --force from someone who is not the owner', async () => {
		const { repo, ref } = await unitHeldBy('busy', 's1', 1);
		const result = await abandonWith(
			repo.root,
			`--ref=${ref}`,
			'--force',
			'--agent=other',
			'--session=s9',
		);
		expect(result.code).not.toBe(EXIT_CODE.OK);
		expect(git(repo.root, 'branch', '--list', ref)).toContain(ref);
	});

	it('lets the owner end its own live unit with --force, keeping the tip', async () => {
		const { repo, ref, worktree } = await unitHeldBy('busy', 's1', 1);
		const tip = git(repo.root, 'rev-parse', ref);
		const result = await abandonWith(
			repo.root,
			`--ref=${ref}`,
			'--force',
			'--agent=busy',
			'--session=s1',
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(existsSync(worktree)).toBe(false);
		expect(git(repo.root, 'branch', '--list', ref)).toBe('');
		const tag = (result.data as { keptAs: string }).keptAs;
		expect(git(repo.root, 'rev-parse', `refs/tags/${tag}`)).toBe(tip);
	});

	it('ends an abandoned unit without --force and keeps its tip', async () => {
		const { repo, ref } = await unitHeldBy('gone', 's1', 600);
		const tip = git(repo.root, 'rev-parse', ref);
		const result = await abandonWith(repo.root, `--ref=${ref}`);
		expect(result.code).toBe(EXIT_CODE.OK);
		const data = result.data as { keptAs: string; restore: string };
		expect(git(repo.root, 'rev-parse', `refs/tags/${data.keptAs}`)).toBe(
			tip,
		);
		expect(data.restore).toContain(data.keptAs);
	});

	it('keeps everything when the worktree holds an edit no commit has', async () => {
		const { repo, ref, worktree } = await unitHeldBy('gone', 's1', 600);
		const { writeFileSync } = await import('node:fs');
		writeFileSync(`${worktree}/wip.ts`, 'export const typed = 2;\n');
		const result = await abandonWith(repo.root, `--ref=${ref}`);
		expect(result.code).not.toBe(EXIT_CODE.OK);
		expect(result.error).toContain('wip.ts');
		expect(existsSync(worktree)).toBe(true);
	});
});

describe('the lease through the work engine', () => {
	it('is recorded by enter and shows in status', async () => {
		const repo = unitRepo();
		const entered = await runWorkUnit(
			[
				'enter',
				'--proposal=x1',
				'--slice=S1',
				'--kind=implement',
				'--agent=lease-agent',
				'--session=host-7',
				'--topic=lease-test',
			],
			{
				cwd: repo.root,
				globals: { workspace: repo.root, json: true, format: 'json' },
			},
		);
		expect(entered.code).toBe(EXIT_CODE.OK);
		const status = await runWorkUnit(['status'], {
			cwd: repo.root,
			globals: { workspace: repo.root, json: true, format: 'json' },
		});
		expect((status.data as { units: { live: number } }).units.live).toBe(1);
	});
});
