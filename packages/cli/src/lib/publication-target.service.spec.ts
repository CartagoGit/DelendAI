/**
 * publication-target.service.spec.ts — a slice's work goes to its own
 * pull request or to its proposal's, as the policy decides, and the answer
 * stays the same for every slice of one proposal.
 *
 * Exercised against a real repository and a bare remote, because the
 * decision reads both: the proposal's file and what is already published.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	resolveDevelopmentPolicy,
	resolveWorkRef,
	type IResolvedDevelopmentPolicy,
} from '@delendai/core/public';

import {
	changedLines,
	choosePublicationTarget,
	proposalSliceCount,
	publicationPattern,
} from './publication-target.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const policyWith = (
	publication?: Record<string, unknown>,
): IResolvedDevelopmentPolicy =>
	resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
			...(publication === undefined
				? {}
				: { integration: { publication } }),
		},
	});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const proposalText = (slices: number): string =>
	[
		'---',
		'id: x00001',
		'---',
		'# x00001',
		'## Slices',
		...Array.from(
			{ length: slices },
			(_unused, i) => `### S${String(i + 1)} — part`,
		),
		'',
	].join('\n');

/** A repository whose proposal declares `slices` slices, and a bare remote. */
const setup = (slices: number) => {
	const root = mkdtempSync(join(tmpdir(), 'publication-target-'));
	const remote = mkdtempSync(join(tmpdir(), 'publication-target-remote-'));
	roots.push(root, remote);
	git(remote, 'init', '-q', '--bare');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'p@example.com');
	git(root, 'config', 'user.name', 'P');
	git(root, 'config', 'commit.gpgsign', 'false');
	mkdirSync(join(root, 'docs/delendai/proposals/ready/fixes'), {
		recursive: true,
	});
	writeFileSync(
		join(root, 'docs/delendai/proposals/ready/fixes/x00001-a-change.md'),
		proposalText(slices),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');
	const base = git(root, 'rev-parse', 'HEAD');
	return { root, base };
};

const workRefFor = (
	policy: IResolvedDevelopmentPolicy,
	slice: string,
	topic = 'topic',
): string =>
	resolveWorkRef(policy.branches.workRefTemplate, {
		agent: 'agent-a',
		proposal: 'x00001',
		slice,
		generation: 1,
		topic,
	});

/** Commit `lines` lines onto `ref`, from `from`, without moving HEAD. */
const commitWork = (
	root: string,
	ref: string,
	from: string,
	lines: number,
): void => {
	const dir = mkdtempSync(join(tmpdir(), 'publication-target-work-'));
	roots.push(dir);
	rmSync(dir, { recursive: true, force: true });
	git(root, 'worktree', 'add', '-q', '--detach', dir, from);
	writeFileSync(
		join(dir, 'work.ts'),
		Array.from({ length: lines }, (_unused, i) => `// ${String(i)}`).join(
			'\n',
		),
	);
	git(dir, 'add', '-A');
	git(dir, 'commit', '-q', '-m', 'work');
	git(root, 'update-ref', ref, git(dir, 'rev-parse', 'HEAD'));
	git(root, 'worktree', 'remove', '--force', dir);
};

const choose = (
	root: string,
	base: string,
	policy: IResolvedDevelopmentPolicy,
	slice: string,
	topic?: string,
) =>
	choosePublicationTarget({
		root,
		policy,
		remote: 'origin',
		agent: 'agent-a',
		proposal: 'x00001',
		slice,
		generation: 1,
		topic,
		base,
		workRef: workRefFor(policy, slice, topic),
	});

describe('which pull request a slice goes to', () => {
	it('puts a small proposal into one pull request, named for the whole of it', () => {
		const policy = policyWith();
		const { root, base } = setup(2);
		commitWork(root, workRefFor(policy, 'S1'), base, 10);
		const target = choose(root, base, policy, 'S1');
		expect(target).toMatchObject({ unit: 'proposal' });
		expect('publicationRef' in target && target.publicationRef).toContain(
			'x00001-all-g1',
		);
	});

	it('publishes a large proposal slice by slice', () => {
		const policy = policyWith();
		const { root, base } = setup(5);
		commitWork(root, workRefFor(policy, 'S1'), base, 10);
		const target = choose(root, base, policy, 'S1');
		expect(target).toMatchObject({ unit: 'slice' });
		expect('reason' in target && target.reason).toContain('over 3 slices');
	});

	it('counts changed lines against the limit too', () => {
		const policy = policyWith();
		const { root, base } = setup(2);
		commitWork(root, workRefFor(policy, 'S1'), base, 500);
		expect(choose(root, base, policy, 'S1')).toMatchObject({
			unit: 'slice',
		});
	});

	it('follows a declared granularity without measuring', () => {
		const { root, base } = setup(9);
		const bySlice = policyWith({ granularity: 'slice' });
		commitWork(root, workRefFor(bySlice, 'S1'), base, 1);
		expect(choose(root, base, bySlice, 'S1')).toMatchObject({
			unit: 'slice',
		});
		const byProposal = policyWith({ granularity: 'proposal' });
		expect(choose(root, base, byProposal, 'S1')).toMatchObject({
			unit: 'proposal',
		});
	});

	it('keeps a later slice in the proposal pull request, whatever its topic', () => {
		const policy = policyWith();
		const { root, base } = setup(2);
		commitWork(root, workRefFor(policy, 'S1', 'first'), base, 5);
		const first = choose(root, base, policy, 'S1', 'first');
		if (!('publicationRef' in first)) throw new Error(first.refusal);
		git(
			root,
			'push',
			'-q',
			'origin',
			`${workRefFor(policy, 'S1', 'first')}:${first.publicationRef}`,
		);

		commitWork(root, workRefFor(policy, 'S2', 'second'), base, 5);
		const second = choose(root, base, policy, 'S2', 'second');
		expect(second).toMatchObject({
			unit: 'proposal',
			publicationRef: first.publicationRef,
		});
	});

	it('keeps publishing slice by slice once a slice went alone', () => {
		const policy = policyWith();
		const { root, base } = setup(2);
		commitWork(root, workRefFor(policy, 'S1'), base, 5);
		const alone = choose(
			root,
			base,
			policyWith({ granularity: 'slice' }),
			'S1',
		);
		if (!('publicationRef' in alone)) throw new Error(alone.refusal);
		git(
			root,
			'push',
			'-q',
			'origin',
			`${workRefFor(policy, 'S1')}:${alone.publicationRef}`,
		);

		commitWork(root, workRefFor(policy, 'S2'), base, 5);
		const target = choose(root, base, policy, 'S2');
		expect(target).toMatchObject({ unit: 'slice' });
		expect('reason' in target && target.reason).toContain('slice by slice');
	});

	it('publishes alone, and says why, when the proposal file is missing', () => {
		const policy = policyWith();
		const { root, base } = setup(2);
		git(root, 'rm', '-q', '-r', 'docs');
		git(root, 'commit', '-q', '-m', 'no proposals');
		commitWork(
			root,
			workRefFor(policy, 'S1'),
			git(root, 'rev-parse', 'HEAD'),
			5,
		);
		const target = choose(root, base, policy, 'S1');
		expect(target).toMatchObject({ unit: 'slice' });
		expect('reason' in target && target.reason).toContain('was not found');
	});

	it('refuses a work ref outside the policy prefix', () => {
		const policy = policyWith();
		const { root, base } = setup(1);
		const target = choosePublicationTarget({
			root,
			policy,
			remote: 'origin',
			agent: 'agent-a',
			proposal: 'x00001',
			slice: 'S1',
			generation: 1,
			base,
			workRef: 'refs/heads/feature/mine',
		});
		expect(target).toHaveProperty('refusal');
	});
});

describe('what the decision reads', () => {
	it('reads a proposal that exists only in the work being published', () => {
		const policy = policyWith();
		const { root, base } = setup(1);
		const ref = workRefFor(policy, 'S1');
		commitWork(root, ref, base, 3);
		// A new proposal, written in the work itself, with two slices.
		const dir = mkdtempSync(join(tmpdir(), 'publication-target-new-'));
		roots.push(dir);
		rmSync(dir, { recursive: true, force: true });
		git(
			root,
			'worktree',
			'add',
			'-q',
			dir,
			ref.replace(/^refs\/heads\//u, ''),
		);
		mkdirSync(join(dir, 'docs/delendai/proposals/review'), {
			recursive: true,
		});
		writeFileSync(
			join(dir, 'docs/delendai/proposals/review/x00002-new.md'),
			'### S1 — one\n### S2 — two\n',
		);
		git(dir, 'add', '-A');
		git(dir, 'commit', '-q', '-m', 'new proposal');
		git(root, 'worktree', 'remove', '--force', dir);

		expect(proposalSliceCount(root, 'x00002')).toBeUndefined();
		expect(proposalSliceCount(root, 'x00002', ref)).toBe(2);
	});

	it('counts the slices the proposal file declares', () => {
		const { root } = setup(4);
		expect(proposalSliceCount(root, 'x00001')).toBe(4);
		expect(proposalSliceCount(root, 'x09999')).toBeUndefined();
	});

	it('counts added and removed lines against the base', () => {
		const policy = policyWith();
		const { root, base } = setup(1);
		commitWork(root, workRefFor(policy, 'S1'), base, 7);
		expect(changedLines(root, base, workRefFor(policy, 'S1'))).toBe(7);
	});

	it('matches the publication refs of one proposal, any topic and slice', () => {
		const policy = policyWith();
		const pattern = publicationPattern(policy, {
			agent: 'agent-a',
			proposal: 'x00001',
			generation: 1,
		});
		const published = workRefFor(policy, 'S3', 'any-topic').replace(
			'/wip/',
			'/pr/',
		);
		expect(pattern?.exec(published)?.[1]).toBe('S3');
		expect(pattern?.test(published.replace('x00001', 'x00002'))).toBe(
			false,
		);
	});
});
