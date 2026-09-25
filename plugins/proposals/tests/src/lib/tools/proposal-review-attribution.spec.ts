/**
 * proposal-review-attribution.spec.ts — a proposal in review can be
 * reviewed by someone who did not write it (x00643). Real repository:
 * work reaches `develop` through `delendai/pr/<agent>/<unit>/<topic>`
 * pull requests, and the proposal reached `review/` with no round open.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	resolveDevelopmentPolicy,
	type IToolRegistration,
} from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';
import {
	buildReviewRegistration,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';

type IHandler = (args: unknown) => Promise<{
	readonly content: readonly { readonly text: string }[];
	readonly isError?: boolean;
}>;

const capture = async (registration: IToolRegistration): Promise<IHandler> => {
	let handler: IHandler | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as IHandler;
			},
		}),
	);
	if (handler === undefined) throw new Error('no handler registered');
	return handler;
};

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const EVIDENCE = {
	validateExitCode: 0,
	testsPassing: 3,
	testsTotal: 3,
} as const;

let root = '';

/** Commit `file` on a branch and merge it into develop as a pull request. */
const deliverThroughPullRequest = (
	file: string,
	ref: string,
	message = 'feat: the work',
): string => {
	git(root, 'switch', '-q', '-c', 'feature');
	writeFileSync(join(root, file), `export const x = ${Date.now()};\n`);
	git(root, 'add', file);
	git(root, 'commit', '-q', '--no-verify', '-m', message);
	const delivered = git(root, 'rev-parse', 'HEAD');
	git(root, 'switch', '-q', 'develop');
	git(
		root,
		'merge',
		'-q',
		'--no-ff',
		'--no-verify',
		'-m',
		`Merge pull request #7 from Owner/${ref}`,
		'feature',
	);
	git(root, 'branch', '-q', '-D', 'feature');
	return delivered;
};

/** A proposal already in review, with slices and no review rounds. */
const proposalInReview = (slices: string): string => {
	const path = join(root, 'docs/delendai/proposals/review/x00001-work.md');
	writeFileSync(
		path,
		`---
id: x00001
title: Work
kind: fix
status: review
type: proposal
---

# x00001 — Work

## Slices

${slices}`,
	);
	writeFileSync(
		join(root, '.cache/delendai/proposals/index.json'),
		`${JSON.stringify({
			proposals: [{ id: 'x00001', file: 'review/x00001-work.md' }],
		})}\n`,
	);
	return path;
};

const SLICE_S1 = (status: string): string => `### S1 — the work
- **Status**: ${status}
- **Files**: \`src/a.ts\`
`;

const options = (
	overrides: Partial<IAuthoringToolOptions> = {},
): IAuthoringToolOptions => ({
	namespacePrefix: 'proposals',
	workspaceRoot: root,
	proposalsDirAbs: join(root, 'docs/delendai/proposals'),
	indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
	lockPathAbs: join(root, '.cache/agents.lock.json'),
	peerReviewLogPathAbs: join(
		root,
		'.cache/delendai/proposals/peer-review.jsonl',
	),
	counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
	developmentPolicy: resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	}),
	requireValidateEvidence: false,
	...overrides,
});

const review = async (
	args: Record<string, unknown>,
	overrides: Partial<IAuthoringToolOptions> = {},
): Promise<{
	readonly isError: boolean;
	readonly body: Record<string, unknown>;
	readonly text: string;
}> => {
	const handler = await capture(buildReviewRegistration(options(overrides)));
	const result = await handler({
		proposalId: 'x00001',
		sliceId: 'S1',
		...args,
	});
	// Every answer, refusals included, is a JSON envelope.
	const text = result.content[0]?.text ?? '{}';
	const body = JSON.parse(text) as Record<string, unknown>;
	return { isError: result.isError === true, body, text };
};

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'review-attribution-'));
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'owner@example.com');
	git(root, 'config', 'user.name', 'Owner');
	git(root, 'config', 'commit.gpgsign', 'false');
	mkdirSync(join(root, 'src'));
	writeFileSync(join(root, 'README.md'), '# project\n');
	git(root, 'add', '.');
	git(root, 'commit', '-q', '--no-verify', '-m', 'base');
	mkdirSync(join(root, 'docs/delendai/proposals/review'), {
		recursive: true,
	});
	mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('a verdict on a slice no round was opened for', () => {
	it('opens the round under the agent the pull request names, then approves and closes', async () => {
		const commit = deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		proposalInReview(SLICE_S1('review'));

		const approved = await review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit.slice(0, 9) },
		});

		expect(approved.isError).toBe(false);
		expect(approved.body).toMatchObject({
			status: 'done',
			implementer: 'agent-a',
			reviewer: 'agent-b',
			attributedTo: 'agent-a',
			proposalClosed: true,
		});
		const closed = join(
			root,
			'docs/delendai/proposals/done/fixes/x00001-work.md',
		);
		expect(existsSync(closed)).toBe(true);
		const markdown = readFileSync(closed, 'utf8');
		expect(markdown).toMatch(/^status: done$/mu);
		expect(markdown).toContain(`- ${commit.slice(0, 9)}`);
		expect(markdown).toContain(
			`- review-attribution: agent-a from Merge pull request #7 from Owner/delendai/pr/agent-a/x00001-S1-g1/the-work (${commit}), opened by agent-b`,
		);
		expect(markdown).toContain('- **Status**: done');
	});

	it('falls back to the Co-Authored-By trailer when no pull request names an agent', async () => {
		const commit = deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/x00001-the-work',
			'feat: the work\n\nCo-Authored-By: Agent Model 7.1 <noreply@example.com>',
		);
		proposalInReview(SLICE_S1('review'));

		const approved = await review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(approved.body).toMatchObject({
			attributedTo: 'agent-model-7-1',
		});
	});

	it('refuses, naming the missing datum, when nothing in Git names the implementer', async () => {
		const commit = deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/x00001-the-work',
		);
		const path = proposalInReview(SLICE_S1('review'));
		const before = readFileSync(path, 'utf8');

		const refused = await review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain('nothing in Git names who delivered');
		expect(refused.text).toContain('Co-Authored-By trailer');
		expect(readFileSync(path, 'utf8')).toBe(before);
	});

	it('refuses a verdict without a commit, and never submits for the implementer', async () => {
		const path = proposalInReview(SLICE_S1('review'));
		const before = readFileSync(path, 'utf8');

		const refused = await review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'broken',
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain('no delivering commit was named');
		expect(readFileSync(path, 'utf8')).toBe(before);
	});

	it('refuses a commit that neither touches the slice nor cites the proposal', async () => {
		const commit = deliverThroughPullRequest(
			'src/other.ts',
			'delendai/pr/agent-a/y00002-S1-g1/unrelated',
		);
		proposalInReview(SLICE_S1('review'));

		const refused = await review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain(
			"changes none of the slice's declared files",
		);
	});

	it('refuses the agent Git names as the implementer as its own reviewer', async () => {
		const commit = deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		proposalInReview(SLICE_S1('review'));

		const refused = await review({
			action: 'approve',
			agent: 'agent-a',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(refused.isError).toBe(true);
		expect(refused.body.error).toMatchObject({
			reason: 'self-approve',
			nextAction: expect.stringContaining(
				'Git attributes this delivery to "agent-a"',
			),
		});
	});

	it('sends a hand-marked done slice back to work, and the proposal with it', async () => {
		const commit = deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		proposalInReview(SLICE_S1('done'));

		const rejected = await review({
			action: 'request_changes',
			agent: 'agent-b',
			note: 'the guard passes when git cannot run',
			commitHash: commit,
		});

		expect(rejected.body).toMatchObject({
			status: 'changes_requested',
			attributedTo: 'agent-a',
			proposalReopened: true,
		});
		const reopened = join(
			root,
			'docs/delendai/proposals/in-progress/x00001-work.md',
		);
		const markdown = readFileSync(reopened, 'utf8');
		expect(markdown).toContain('- **Status**: in-progress');
		expect(markdown).toContain(
			'- review-log: requested_changes by agent-b — the guard passes when git cannot run',
		);
	});
});

describe('the approval that ends a proposal', () => {
	it('does not close a proposal whose other slices carry no approval', async () => {
		const commit = deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		proposalInReview(`${SLICE_S1('done')}
### S2 — more work
- **Status**: done
- **Files**: \`src/b.ts\`
`);

		const approved = await review({
			action: 'approve',
			agent: 'agent-b',
			evidence: { ...EVIDENCE, commitHash: commit },
		});

		expect(approved.body.status).toBe('done');
		expect(approved.body.proposalClosed).toBeUndefined();
		expect(
			existsSync(
				join(root, 'docs/delendai/proposals/review/x00001-work.md'),
			),
		).toBe(true);
	});

	it('keeps the approval and reports why the close was refused', async () => {
		const commit = deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/the-work',
		);
		proposalInReview(SLICE_S1('review'));

		const approved = await review(
			{
				action: 'approve',
				agent: 'agent-b',
				evidence: { ...EVIDENCE, commitHash: commit },
			},
			{ requireValidateEvidence: true },
		);

		expect(approved.isError).toBe(false);
		expect(approved.body.status).toBe('done');
		expect(approved.body.proposalClosed).toBe(false);
		expect(approved.body.proposalCloseBlocker).toEqual(expect.any(String));
		const markdown = readFileSync(
			join(root, 'docs/delendai/proposals/review/x00001-work.md'),
			'utf8',
		);
		expect(markdown).toContain('- review-state: done');
		expect(markdown).toMatch(/^status: review$/mu);
	});
});
