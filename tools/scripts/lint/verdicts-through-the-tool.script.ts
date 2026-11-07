#!/usr/bin/env bun
/**
 * verdicts-through-the-tool.script.ts — a review line reaches a proposal
 * through the review tool, never by hand.
 *
 * The review tool checks a verdict before it writes it: who may judge the
 * slice, what it delivered, the evidence. A line typed into the document
 * says the same words and was checked by nothing. A review swarm wrote
 * them by hand (`chore(review): approve …`, `docs(review): record batch
 * verdicts …`), and nothing told those lines from the tool's.
 *
 * The tool's writes are committed by the tool, under its own subject
 * (`chore(delendai): <namespace>_<tool> …`). A commit of the branch that
 * adds a `review-*` line under any other subject fails here. Merges are
 * left out: what they carry is judged in the commits they carry.
 *
 *   bun tools/scripts/lint/verdicts-through-the-tool.script.ts [--base=<ref>]
 */
import { execFileSync } from 'node:child_process';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';

const PROPOSALS_DIR = 'docs/delendai/proposals/';

/** A review line, as the review tool writes it. */
const REVIEW_LINE =
	/^\+[-*]\s*review-(state|log|reviewer|implementer|attribution):/u;

/** The subject a tool's own commit carries. */
const TOOL_SUBJECT = /^chore\(delendai\): [a-z0-9]+_[a-z0-9_]+(\s|$)/u;

export interface ICommitChange {
	readonly sha: string;
	readonly subject: string;
	/** The unified diff the commit makes to the proposals directory. */
	readonly diff: string;
}

/** The commits that add a review line without being the tool's. */
export const handWrittenVerdicts = (
	commits: readonly ICommitChange[],
): readonly {
	readonly sha: string;
	readonly subject: string;
	readonly lines: readonly string[];
}[] =>
	commits.flatMap((commit) => {
		if (TOOL_SUBJECT.test(commit.subject)) return [];
		const lines = commit.diff
			.split('\n')
			.filter((line) => REVIEW_LINE.test(line))
			.map((line) => line.slice(1).trim());
		return lines.length === 0
			? []
			: [{ sha: commit.sha, subject: commit.subject, lines }];
	});

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	}).trim();

const main = (): number => {
	const root = repoRoot();
	const base =
		process.argv
			.find((arg) => arg.startsWith('--base='))
			?.slice('--base='.length) ??
		git(root, [
			'merge-base',
			'HEAD',
			`refs/remotes/origin/${declaredBranches(root).integration}`,
		]);
	const listed = git(root, [
		'log',
		'--no-merges',
		'--format=%H%x09%s',
		`${base}..HEAD`,
		'--',
		PROPOSALS_DIR,
	]);
	const commits = listed
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => {
			const [sha = '', ...subject] = line.split('\t');
			return {
				sha,
				subject: subject.join('\t'),
				diff: git(root, [
					'show',
					'--format=',
					'--unified=0',
					sha,
					'--',
					PROPOSALS_DIR,
				]),
			};
		});
	const offenders = handWrittenVerdicts(commits);
	if (offenders.length === 0) {
		console.log(
			`✓ verdicts-through-the-tool: ${String(commits.length)} commit(s) touch proposals; every review line among them came from the review tool.`,
		);
		return 0;
	}
	for (const offender of offenders) {
		console.error(
			`✖ verdicts-through-the-tool: ${offender.sha.slice(0, 12)} "${offender.subject}" writes ${offender.lines.join(' | ')} by hand.`,
		);
	}
	console.error(
		'\nA review line is written by the review tool, which checks it first: record the verdict with `delendai review approve|changes` (or the proposal_review tool) in your review unit, and drop the hand-written line.',
	);
	return 1;
};

if (import.meta.main) process.exit(main());
