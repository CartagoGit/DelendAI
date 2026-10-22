/**
 * swarm-storm.e2e.spec.ts — the mistakes of one review swarm, replayed
 * against the tools in one repository.
 *
 * On 2026-10-03 fourteen reviewers of five models worked a backlog at
 * once. Each step below is something one of them did, in the order a run
 * meets them; each is refused, or repaired by the tool it reaches. The run
 * ends the way a run must: `work doctor` finds nothing hanging.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { checkWorkflowInvariants } from '@delendai/core/lib/work-units/workflow-invariants.service';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const CONFIG = {
	docsDir: 'docs',
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
};

const REVIEWED = 'docs/proposals/review/x00001-a-thing.md';
const CLOSED = 'docs/proposals/done/x00002-closed.md';

/** A forge and the shared checkout of it, with one proposal in review. */
const project = () => {
	const base = mkdtempSync(join(tmpdir(), 'swarm-storm-'));
	roots.push(base);
	const forge = join(base, 'origin.git');
	const root = join(base, 'work');
	mkdirSync(forge);
	mkdirSync(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', forge]);
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'owner@example.com');
	git('config', 'user.name', 'Owner');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'delendai.config.json'), JSON.stringify(CONFIG));
	writeFileSync(join(root, '.gitignore'), '.cache/\n');
	mkdirSync(join(root, 'docs/proposals/review'), { recursive: true });
	mkdirSync(join(root, 'docs/proposals/done'), { recursive: true });
	writeFileSync(
		join(root, REVIEWED),
		[
			'### S1 — the work',
			'- **Status**: review',
			'- review-implementer: claude-opus-5-5',
			'- review-reviewer: gpt-5.4',
			'',
		].join('\n'),
	);
	writeFileSync(join(root, CLOSED), 'closed\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	git('remote', 'add', 'origin', forge);
	git('push', '-q', 'origin', 'develop');
	git('fetch', '-q', 'origin');
	return { root, git };
};

const work = (root: string, ...args: string[]) =>
	runWorkUnit(
		args,
		fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
			cwd: root,
			globals: fakePartial<
				IWorkUnitContext['globals'],
				'workspace' | 'json'
			>({ workspace: root, json: true }),
		}),
	);

const REVIEW = ['--kind=review', '--proposal=batch', '--slice=all'];

/** Enter a unit and get a way to work in it. */
const unit = async (root: string, ...args: string[]) => {
	const entered = await work(root, 'enter', ...args);
	const data = entered.data as { path: string; branch: string };
	return {
		entered,
		branch: data?.branch,
		git: (...gitArgs: string[]) =>
			execFileSync('git', gitArgs, {
				cwd: data.path,
				encoding: 'utf8',
			}).trim(),
		write: (path: string, text: string) =>
			writeFileSync(join(data.path, path), text),
	};
};

describe('the storm of 2026-10-03, replayed', () => {
	it('refuses each mistake where it is made, and ends with nothing hanging', async () => {
		const { root, git } = project();
		const policy = resolveDevelopmentPolicy(CONFIG);

		// A commit made straight in the shared checkout: every unit entered
		// afterwards used to start from it.
		writeFileSync(
			join(root, 'stray.txt'),
			'committed in the wrong place\n',
		);
		git('add', '-A');
		git(
			'commit',
			'-q',
			'-m',
			'chore(review): a verdict, in the wrong tree',
		);
		expect(
			checkWorkflowInvariants({ root, policy }).results.find(
				(result) => result.id === 'integration-follows-forge',
			)?.holds,
		).toBe(false);

		// A reviewer enters: its unit starts from what the forge has.
		const first = await unit(root, ...REVIEW, '--agent=gpt-5.4');
		expect(first.entered.code).toBe(0);
		expect(first.branch).toContain('/verdicts');
		expect(first.git('rev-parse', 'HEAD')).toBe(
			git('rev-parse', 'origin/develop'),
		);
		git('reset', '-q', '--hard', 'origin/develop');

		// The same model under another spelling.
		const respelled = await work(
			root,
			'enter',
			...REVIEW,
			'--agent=Gpt_5.4',
		);
		expect(respelled.error).toContain('--agent=gpt-5.4');

		// The reviewer of a proposal starts implementing it.
		const implementing = await work(
			root,
			'enter',
			'--proposal=x00001',
			'--slice=S1',
			'--agent=gpt-5.4',
		);
		expect(implementing.error).toContain(
			'does not implement what it reviews',
		);

		// It records a verdict; a second reviewer builds its pack on that one.
		first.write(REVIEWED, 'verdict of gpt-5.4\n');
		first.git('commit', '-qam', 'docs(review): verdict of a');
		const second = await unit(root, ...REVIEW, '--agent=gemini-3.8-flash');
		second.git('merge', '-q', '--no-edit', first.branch);
		second.write('docs/proposals/review/note.md', 'verdict of b\n');
		second.git('add', '-A');
		second.git('commit', '-qm', 'docs(review): verdict of b');
		const carrying = await work(
			root,
			'publish',
			...REVIEW,
			'--agent=gemini-3.8-flash',
		);
		expect(carrying.error).toContain("carries another reviewer's pack");

		// A third reviewer's pack drops a closed document.
		const third = await unit(
			root,
			...REVIEW,
			'--agent=minimax-m3.1-flash-preview',
		);
		third.git('rm', '-q', CLOSED);
		third.git('commit', '-qm', 'docs(review): drop a stale copy');
		const deleting = await work(
			root,
			'publish',
			...REVIEW,
			'--agent=minimax-m3.1-flash-preview',
		);
		expect(deleting.error).toContain('never removes one');

		// Two agents on one slice.
		const implementer = await unit(
			root,
			'--proposal=x00003',
			'--slice=S1',
			'--agent=claude-opus-5-5',
		);
		expect(implementer.entered.code).toBe(0);
		const duplicate = await work(
			root,
			'enter',
			'--proposal=x00003',
			'--slice=S1',
			'--agent=glm-5.3-flash',
		);
		expect(duplicate.error).toContain('already being worked on');

		// Nobody may retire a colleague's live unit.
		const foreign = await work(
			root,
			'retire',
			`--ref=${implementer.branch}`,
			'--reason=tidying',
			'--agent=glm-5.3-flash',
			'--unowned',
		);
		expect(foreign.error).toContain("claude-opus-5-5's to retire");

		// The run ends: what cannot land is retired by its owner, with its
		// work kept on the forge, and what is empty goes too.
		for (const [agent, each] of [
			['gpt-5.4', first],
			['gemini-3.8-flash', second],
			['minimax-m3.1-flash-preview', third],
			['claude-opus-5-5', implementer],
		] as const) {
			const retired = await work(
				root,
				'retire',
				`--ref=${each.branch}`,
				'--reason=the run is over and this cannot land',
				`--agent=${agent}`,
			);
			expect(retired.code, `${agent}: ${retired.error ?? ''}`).toBe(0);
		}
		expect(
			git('ls-remote', 'origin', 'refs/delendai/retired/*').split('\n'),
		).toHaveLength(3);

		git('fetch', '-q', '--prune', 'origin');
		const report = checkWorkflowInvariants({ root, policy });
		expect(
			report.results.filter((result) => !result.holds).map((r) => r.id),
		).toEqual([]);
	});
});
