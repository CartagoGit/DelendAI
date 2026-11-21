/**
 * land-refresh-moved.e2e.spec.ts — the queue's conflict path refreshes a
 * publication that moved a proposal file while the integration branch edited
 * its old copy: the edit is carried and pushed without force, or the author
 * gets one comment and nothing is pushed. Real git against a local remote;
 * the pass is `landPass` over a scripted forge, never the helper alone.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
	landConfigFromPolicy,
	landPass,
	type ILandForge,
	type ILandGit,
	type ILandPullRequest,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { createGitRepoTemplate, fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { createRefreshMoved } from '../../../../src/lib/services/land-refresh-moved.helper';

const OLD = 'docs/proposals/in-progress/x1.md';
const NEW = 'docs/proposals/review/x1.md';
const BASE = Array.from({ length: 10 }, (_, i) => `line ${String(i + 1)}\n`);

const template = createGitRepoTemplate({
	trunk: 'develop',
	remote: true,
	files: { 'README.md': 'x\n' },
});

const CONFIG = landConfigFromPolicy(
	resolveDevelopmentPolicy({
		development: {
			branches: {
				integration: 'develop',
				release: 'main',
				namespacePrefix: 'delendai',
			},
			integration: { requiredChecks: ['tests: a'] },
		},
	}),
	{ sectionOfCheck: () => undefined, batches: false },
);

/** The head moved the file and rewrote most of it; the tip edited `tipLine` of the old copy. */
const world = (tipLine: number, movedLines: readonly number[]) => {
	const { root, git } = template.copy();
	for (const path of [OLD, NEW])
		mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, OLD), BASE.join(''));
	git('add', '-A');
	git('commit', '-q', '-m', 'the proposal');
	git('push', '-q', 'origin', 'develop');
	const base = git('rev-parse', 'HEAD');
	const headRef = 'delendai/pr/a/implement/x1-S1-g1/t';
	git('switch', '-q', '-c', headRef, base);
	git('mv', OLD, NEW);
	const moved = BASE.map((line, i) =>
		movedLines.includes(i) ? `head ${String(i + 1)}\n` : line,
	);
	writeFileSync(join(root, NEW), moved.join(''));
	git('add', '-A');
	git('commit', '-q', '-m', 'move the proposal');
	git('push', '-q', 'origin', headRef);
	const headSha = git('rev-parse', headRef);
	git('switch', '-q', 'develop');
	const tipText = BASE.map((line, i) =>
		i === tipLine ? `tip ${String(i + 1)}\n` : line,
	);
	writeFileSync(join(root, OLD), tipText.join(''));
	git('add', '-A');
	git('commit', '-q', '-m', 'edit the proposal');
	git('push', '-q', 'origin', 'develop');
	return { root, git, headRef, headSha, tip: git('rev-parse', 'HEAD') };
};

/** A forge with one open publication whose head is green and conflicts with the tip. */
const queue = (input: {
	readonly root: string;
	readonly headRef: string;
	readonly headSha: string;
	readonly tip: string;
}) => {
	const comments: string[] = [];
	const labels: string[] = [];
	const pr: ILandPullRequest = {
		number: 9,
		headRef: input.headRef,
		headSha: input.headSha,
		draft: false,
		state: 'open',
		merged: false,
		labels,
		body: '',
		testedBase: 'old',
	};
	const forge = fakePartial<ILandForge>({
		integrationTip: async () => input.tip,
		requiredChecks: async () => ['tests: a'],
		batchPullRequests: async () => [],
		openPullRequests: async () => [pr],
		checks: async () => [{ name: 'tests: a', conclusion: 'success' }],
		comments: async () => [...comments],
		comment: async (_number, text) => {
			comments.push(text);
		},
		addLabel: async (_number, label) => {
			labels.push(label);
		},
		removeLabel: async () => undefined,
	});
	const git = fakePartial<ILandGit>({
		conflictOf: () => 'authored',
		landedSince: () => ({
			zones: new Set<string>(),
			files: new Set([OLD]),
		}),
		footprint: () => ({
			zones: new Set<string>(),
			files: new Set([OLD, NEW]),
		}),
	});
	const pass = () =>
		landPass({
			forge,
			git,
			config: CONFIG,
			refreshMoved: createRefreshMoved({
				root: input.root,
				remote: 'origin',
				token: 'identity-token',
			}),
		});
	return { pass, comments };
};

const remoteHead = (git: (...args: string[]) => string, ref: string): string =>
	git('ls-remote', 'origin', `refs/heads/${ref}`).split(/\s/u)[0] ?? '';

describe('the queue refreshes a moved proposal', () => {
	it('[<5000ms] carries the tip edit onto the moved copy and pushes a head that merges cleanly', async () => {
		const w = world(9, [0, 1, 2, 3, 4, 5, 6, 7]);
		const { pass, comments } = queue(w);
		await pass();
		const pushed = remoteHead(w.git, w.headRef);
		expect(pushed).not.toBe(w.headSha);
		w.git('fetch', '-q', 'origin', w.headRef);
		expect(w.git('merge-base', '--is-ancestor', w.headSha, pushed)).toBe(
			'',
		);
		expect(w.git('merge-base', '--is-ancestor', w.tip, pushed)).toBe('');
		const text = w.git('show', `${pushed}:${NEW}`);
		expect(text).toContain('head 1');
		expect(text).toContain('tip 10');
		expect(w.git('ls-tree', '-r', '--name-only', pushed, '--', OLD)).toBe(
			'',
		);
		w.git('switch', '-q', '--detach', pushed);
		expect(w.git('merge', '--no-edit', w.tip)).toContain('up to date');
		expect(comments).toEqual([]);
	});

	it('[<5000ms] asks once and pushes nothing when the edit does not apply', async () => {
		const w = world(1, [0, 1, 2, 3, 4, 5, 6, 7]);
		const { pass, comments } = queue(w);
		await pass();
		await pass();
		expect(remoteHead(w.git, w.headRef)).toBe(w.headSha);
		expect(comments).toHaveLength(1);
		expect(comments[0]).toContain('work enter --generation <n>');
		expect(comments[0]).toContain('git merge');
	});
});
