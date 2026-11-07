/**
 * stale-verdict-conflicts.spec.ts — an orphaned pack of verdicts in
 * conflict is rescued with its verdicts byte-identical, and gives up only
 * the verdicts that no longer apply, on a real repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { refreshCandidate } from './refresh-candidate-artifacts.script';
import { keepPackVerdicts, proposalOfPath } from './stale-verdict-conflicts';

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const PROPOSALS = 'docs/delendai/proposals';
const PACK = 'delendai/pr/reviewer/review/batch-all-g1/verdicts';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/** A document's text, by its path under the proposals folder. */
type IFiles = Readonly<Record<string, string>>;

/** Each side's edits: files to write, and moves `from → to`. */
interface ISide {
	readonly write?: IFiles;
	readonly move?: Readonly<Record<string, string>>;
}

/**
 * A forge with `base` on its integration branch, a pack branch from it
 * with the pack's edits, and the integration branch moved on with its own.
 */
const repoWith = (
	branch: string,
	base: IFiles,
	pack: ISide,
	integration: ISide,
): string => {
	const dir = mkdtempSync(join(tmpdir(), 'stale-verdict-'));
	roots.push(dir);
	const remote = join(dir, 'origin.git');
	const root = join(dir, 'work');
	mkdirSync(remote);
	mkdirSync(root);
	git(remote, 'init', '-q', '--bare', '--initial-branch', 'develop');
	git(root, 'init', '-q', '--initial-branch', 'develop');
	git(root, 'config', 'user.email', 'c@example.com');
	git(root, 'config', 'user.name', 'C');
	git(root, 'config', 'commit.gpgsign', 'false');
	const apply = (side: ISide, message: string): void => {
		for (const [from, to] of Object.entries(side.move ?? {})) {
			mkdirSync(dirname(join(root, PROPOSALS, to)), { recursive: true });
			git(root, 'mv', join(PROPOSALS, from), join(PROPOSALS, to));
		}
		for (const [path, text] of Object.entries(side.write ?? {})) {
			mkdirSync(dirname(join(root, PROPOSALS, path)), {
				recursive: true,
			});
			writeFileSync(join(root, PROPOSALS, path), text);
		}
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', message);
	};
	apply({ write: base }, 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');
	git(root, 'checkout', '-q', '-b', branch);
	apply(pack, 'verdicts');
	git(root, 'push', '-q', 'origin', branch);
	git(root, 'checkout', '-q', 'develop');
	apply(integration, 'the integration branch moves');
	git(root, 'push', '-q', 'origin', 'develop');
	git(root, 'fetch', '-q', 'origin');
	return root;
};

const refresh = (root: string, candidate = PACK) =>
	refreshCandidate({
		root,
		policy,
		remote: 'origin',
		candidate,
		run: () => true,
	});

const tipOf = (root: string, path: string): string => {
	git(root, 'fetch', '-q', 'origin');
	return git(root, 'show', `origin/${PACK}:${PROPOSALS}/${path}`);
};

const verdictLines = (text: string): string =>
	text
		.split('\n')
		.filter((line) => /^- (\*\*Status\*\*|review-)/u.test(line))
		.join('\n');

/** A proposal with one slice, as each side writes it. */
const doc = (input: {
	readonly status: string;
	readonly goal?: string;
	readonly shipped?: string;
	readonly verdict: string;
}): string => {
	const verdict = input.verdict.split('\n');
	return [
		'---',
		'id: x00003',
		`status: ${input.status}`,
		'---',
		'',
		'# x00003 — third',
		'',
		'## goal',
		'',
		input.goal ?? 'The goal.',
		'',
		'## slices',
		'',
		'### S1 — work',
		// Where a document keeps them: the status first, the review lines last.
		...verdict.filter((line) => line.startsWith('- **Status**')),
		'- **Files**: `a.ts`',
		`- shipped-in: \`${input.shipped ?? 'abc1234'}\``,
		...verdict.filter((line) => !line.startsWith('- **Status**')),
		'',
		'## acceptance',
		'',
		'- It works.',
		'',
	].join('\n');
};

const IN_REVIEW = '- **Status**: review\n- review-state: in_review';
const PACK_VERDICT =
	'- **Status**: pending\n- review-state: changes_requested\n- review-reviewer: reviewer\n- review-log: requested_changes by reviewer — the evidence is missing.';
const OTHER_ROUND =
	'- **Status**: pending\n- review-state: changes_requested\n- review-reviewer: reviewer\n- review-log: requested_changes by reviewer — an earlier round.';

describe('an orphaned review pack in conflict', () => {
	it('is rescued with its verdicts byte-identical and the integration text elsewhere', () => {
		const root = repoWith(
			PACK,
			{
				'review/x00003-third.md': doc({
					status: 'review',
					verdict: IN_REVIEW,
				}),
			},
			{
				move: { 'review/x00003-third.md': 'ready/x00003-third.md' },
				write: {
					'ready/x00003-third.md': doc({
						status: 'ready',
						verdict: PACK_VERDICT,
					}),
				},
			},
			{
				write: {
					'review/x00003-third.md': doc({
						status: 'review',
						goal: 'The goal, reworded on the integration branch.',
						verdict: OTHER_ROUND,
					}),
				},
			},
		);

		const outcome = refresh(root);

		expect(outcome.state).toBe('refreshed');
		const rescued = tipOf(root, 'ready/x00003-third.md');
		expect(verdictLines(rescued)).toBe(verdictLines(PACK_VERDICT));
		// Exactly the integration branch's document with the pack's verdict.
		expect(`${rescued}\n`).toBe(
			doc({
				status: 'ready',
				goal: 'The goal, reworded on the integration branch.',
				verdict: PACK_VERDICT,
			}),
		);
		expect(
			git(root, 'ls-tree', '-r', '--name-only', `origin/${PACK}`),
		).not.toContain('review/x00003-third.md');
		// The pack's verdict commit is still its own, under the rescue.
		expect(
			git(root, 'log', '--format=%s', `origin/develop..origin/${PACK}`),
		).toContain('verdicts');
		expect(
			git(root, 'log', '-1', '--format=%B', `origin/${PACK}`),
		).toContain("Kept the pack's verdicts on x00003");
	});

	it('drops a verdict on a proposal closed on the integration branch, with a note', () => {
		const root = repoWith(
			PACK,
			{
				'review/x00003-third.md': doc({
					status: 'review',
					verdict: IN_REVIEW,
				}),
			},
			{
				write: {
					'review/x00003-third.md': doc({
						status: 'review',
						verdict: PACK_VERDICT,
					}),
				},
			},
			{
				move: { 'review/x00003-third.md': 'done/x00003-third.md' },
				write: {
					'done/x00003-third.md': doc({
						status: 'done',
						verdict: '- **Status**: done\n- review-state: approved',
					}),
				},
			},
		);

		const outcome = refresh(root);

		expect(outcome.state).toBe('refreshed');
		expect(outcome.detail).toContain('x00003');
		expect(tipOf(root, 'done/x00003-third.md')).toBe(
			git(
				root,
				'show',
				`origin/develop:${PROPOSALS}/done/x00003-third.md`,
			),
		);
		expect(
			git(root, 'log', '-1', '--format=%B', `origin/${PACK}`),
		).toContain(
			'Dropped the verdicts on x00003: the proposal closed on the integration branch',
		);
	});

	it('drops a verdict on a slice whose revision changed under it, and keeps the others', () => {
		const second = '# second\n\n### S1 — work\n- **Status**: review\n';
		const root = repoWith(
			PACK,
			{
				'review/x00003-third.md': doc({
					status: 'review',
					verdict: IN_REVIEW,
				}),
				'review/x00002-second.md': second,
			},
			{
				write: {
					'review/x00003-third.md': doc({
						status: 'review',
						verdict: PACK_VERDICT,
					}),
					'review/x00002-second.md':
						'# second\n\n### S1 — work\n- **Status**: done\n- review-log: approved by reviewer — fine\n',
				},
			},
			{
				write: {
					'review/x00003-third.md': doc({
						status: 'review',
						shipped: 'def5678',
						verdict: IN_REVIEW,
					}),
				},
			},
		);

		const outcome = refresh(root);

		expect(outcome.state).toBe('refreshed');
		expect(outcome.detail).toContain('dropped the verdicts on x00003');
		expect(tipOf(root, 'review/x00003-third.md')).toBe(
			git(
				root,
				'show',
				`origin/develop:${PROPOSALS}/review/x00003-third.md`,
			),
		);
		expect(tipOf(root, 'review/x00002-second.md')).toContain(
			'approved by reviewer',
		);
	});

	it('is left to its author when the unit is not one that records verdicts', () => {
		const implement = 'delendai/pr/author/implement/x00003-S1-g1/the-work';
		const root = repoWith(
			implement,
			{
				'review/x00003-third.md': doc({
					status: 'review',
					verdict: IN_REVIEW,
				}),
			},
			{
				write: {
					'review/x00003-third.md': doc({
						status: 'review',
						verdict: PACK_VERDICT,
					}),
				},
			},
			{
				write: {
					'review/x00003-third.md': doc({
						status: 'review',
						verdict: OTHER_ROUND,
					}),
				},
			},
		);

		expect(refresh(root, implement).state).toBe('conflicted');
	});
});

describe('keepPackVerdicts', () => {
	it('puts the verdict lines where the integration branch had none', () => {
		const base = doc({ status: 'review', verdict: '- **Status**: review' });
		const resolved = keepPackVerdicts({
			base,
			ours: doc({ status: 'review', verdict: PACK_VERDICT }),
			theirs: base.replace('The goal.', 'Another goal.'),
		});
		expect(resolved).toBe(
			doc({
				status: 'review',
				goal: 'Another goal.',
				verdict: PACK_VERDICT,
			}),
		);
	});
});

describe('a slice that names its own document', () => {
	it('is the same revision after a transition moved the document', () => {
		const at = (folder: string, verdict: string) =>
			doc({ status: 'review', verdict }).replace(
				'`a.ts`',
				`\`a.ts\`, \`${PROPOSALS}/${folder}/x00003-third.md\``,
			);
		expect(
			keepPackVerdicts({
				base: at('review', IN_REVIEW),
				ours: at('review', PACK_VERDICT),
				theirs: at('ready', IN_REVIEW),
			}),
		).toBe(at('ready', PACK_VERDICT));
	});
});

describe('proposalOfPath', () => {
	it('names the proposal of a document under the proposals folder, and nothing else', () => {
		expect(
			proposalOfPath(`${PROPOSALS}/done/fixes/x00001-a.md`, PROPOSALS),
		).toBe('x00001');
		expect(proposalOfPath('docs/x00001-a.md', PROPOSALS)).toBeUndefined();
		expect(
			proposalOfPath(`${PROPOSALS}/README.md`, PROPOSALS),
		).toBeUndefined();
	});
});
