/**
 * A unit entered for a proposal that did not exist yet takes its id.
 *
 * Driven against real git repositories: the rename is about refs, a
 * worktree's HEAD and a remote, and git is the only authority on them.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import {
	adoptProposalId,
	carryUnitRecords,
} from '@delendai/core/lib/work-units/unit-adoption.service';
import {
	gitCommonDirOf,
	recordUnitEntered,
} from '@delendai/core/lib/work-units/unit-lease.service';
import { readUnitLease } from '@delendai/core/lib/work-units/unit-lease.store';
import { parseWorkSubject } from '@delendai/core/lib/work-units/work-ref-shape.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const TEMPLATE =
	'delendai/wip/${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}';

const policy = fakePartial<IResolvedDevelopmentPolicy>({
	branches: fakePartial<IResolvedDevelopmentPolicy['branches']>({
		integration: 'develop',
		workRefPrefix: 'delendai/wip/',
		workRefTemplate: TEMPLATE,
	}),
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
		{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
	).trim();

const exists = (cwd: string, ref: string): boolean => {
	try {
		git(cwd, 'rev-parse', '--verify', '--quiet', ref);
		return true;
	} catch {
		return false;
	}
};

const OLD = 'delendai/wip/agent-a/create/new-all-g1/the-topic';
const NEW = 'delendai/wip/agent-a/create/x00001-all-g1/the-topic';

/** A clone with a remote, and a worktree standing on `branch`. */
const unitOn = (
	branch: string,
): {
	readonly main: string;
	readonly tree: string;
	readonly remote: string;
} => {
	const base = mkdtempSync(join(tmpdir(), 'unit-adoption-'));
	roots.push(base);
	const remote = join(base, 'remote.git');
	const main = join(base, 'main');
	const tree = join(base, 'tree');
	execFileSync('git', ['init', '-q', '--bare', remote]);
	execFileSync('git', ['init', '-q', '-b', 'develop', main]);
	writeFileSync(join(main, 'a.ts'), 'export const a = 1;\n');
	git(main, 'add', '-A');
	git(main, 'commit', '-q', '-m', 'base');
	git(main, 'remote', 'add', 'origin', remote);
	git(main, 'branch', branch);
	git(main, 'push', '-q', 'origin', 'develop', branch);
	git(main, 'worktree', 'add', '-q', tree, branch);
	return { main, tree, remote };
};

const enter = (tree: string, branch: string) =>
	recordUnitEntered({
		cwd: tree,
		ref: branch,
		owner: { agent: 'agent-a', session: 'session-1' },
		worktree: tree,
		now: 1000,
	});

describe('adoptProposalId', () => {
	it('names the unit after the proposal: branch, worktree, lease and remote', async () => {
		const { main, tree, remote } = unitOn(OLD);
		await enter(tree, OLD);
		const sha = git(tree, 'rev-parse', 'HEAD');

		const adopted = await adoptProposalId({
			cwd: tree,
			proposal: 'x00001',
			policy,
		});

		expect(adopted).toEqual({
			status: 'renamed',
			from: OLD,
			to: NEW,
			leaseMoved: true,
			forge: 'removed',
		});
		expect(git(tree, 'symbolic-ref', 'HEAD')).toBe(`refs/heads/${NEW}`);
		expect(git(main, 'rev-parse', NEW)).toBe(sha);
		expect(exists(main, `refs/heads/${OLD}`)).toBe(false);
		const common = gitCommonDirOf(tree) ?? '';
		expect((await readUnitLease(common, NEW))?.ref).toBe(NEW);
		expect(await readUnitLease(common, OLD)).toBeUndefined();
		expect(git(remote, 'branch', '--list', OLD)).toBe('');
		// `work publish --proposal=<id> --kind=create` reads the unit back
		// from its name.
		expect(
			parseWorkSubject(
				TEMPLATE,
				NEW.replace('delendai/wip/agent-a/', ''),
			),
		).toMatchObject({ kind: 'create', proposal: 'x00001', slice: 'all' });
	});

	it('renames a unit the forge never had, and one with no lease', async () => {
		const { main, tree, remote } = unitOn(OLD);
		git(remote, 'branch', '-D', OLD);

		const adopted = await adoptProposalId({
			cwd: tree,
			proposal: 'x00002',
			policy,
		});

		expect(adopted).toMatchObject({
			status: 'renamed',
			leaseMoved: false,
			forge: 'absent',
		});
		expect(
			exists(
				main,
				'refs/heads/delendai/wip/agent-a/create/x00002-all-g1/the-topic',
			),
		).toBe(true);
	});

	it('renames nothing in a unit that already carries an id', async () => {
		const { tree } = unitOn(NEW);
		await enter(tree, NEW);

		const adopted = await adoptProposalId({
			cwd: tree,
			proposal: 'x00009',
			policy,
		});

		expect(adopted).toEqual({ status: 'kept', branch: NEW });
		expect(git(tree, 'symbolic-ref', 'HEAD')).toBe(`refs/heads/${NEW}`);
	});

	it('renames nothing outside a unit', async () => {
		const { main } = unitOn(OLD);
		expect(
			await adoptProposalId({ cwd: main, proposal: 'x00001', policy }),
		).toEqual({ status: 'kept' });
		expect(exists(main, `refs/heads/${OLD}`)).toBe(true);
	});

	it('refuses, leaving the unit as it is, when the new name is taken', async () => {
		const { main, tree } = unitOn(OLD);
		git(main, 'branch', NEW);

		const adopted = await adoptProposalId({
			cwd: tree,
			proposal: 'x00001',
			policy,
		});

		expect(adopted.status).toBe('refused');
		expect(git(tree, 'symbolic-ref', 'HEAD')).toBe(`refs/heads/${OLD}`);
	});
});

describe('carryUnitRecords', () => {
	const TAKEN = 'delendai/wip/agent-b/create/new-all-g2/the-topic';

	it("moves the lease and drops the forge's copy when a unit changes hands", async () => {
		const { main, tree, remote } = unitOn(OLD);
		await enter(tree, OLD);
		// The claim itself renamed the branch; this is what follows it.
		git(main, 'branch', '-m', OLD, TAKEN);

		const carried = await carryUnitRecords({
			cwd: main,
			policy,
			from: OLD,
			to: TAKEN,
		});

		expect(carried).toEqual({ lease: true, forge: 'removed' });
		const common = gitCommonDirOf(tree) ?? '';
		expect((await readUnitLease(common, TAKEN))?.ref).toBe(TAKEN);
		expect(await readUnitLease(common, OLD)).toBeUndefined();
		expect(git(remote, 'branch', '--list', OLD)).toBe('');
	});

	it('has nothing to carry for a unit with no lease that the forge never had', async () => {
		const { main } = unitOn(OLD);
		expect(
			await carryUnitRecords({
				cwd: main,
				policy,
				from: 'delendai/wip/agent-a/create/new-all-g9/never',
				to: TAKEN,
			}),
		).toEqual({ lease: false, forge: 'absent' });
	});
});
