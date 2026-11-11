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
	/** The proposals the commit leaves, by path: tells which slice a line is in. */
	readonly documents?: ReadonlyMap<string, string>;
}

/** The commit the startup reconciler makes of work it found uncommitted. */
const KEEP_SUBJECT =
	/^chore\(wip\): keep the uncommitted work found at start$/u;

/** The id a transition stamps on the document it moves. */
const TRANSITION_ID_LINE = /^\+last-transition-id: [0-9a-f-]{36}$/mu;

/**
 * The review lines a transition to review writes, and nothing else: a
 * verdict (`review-log`, `review-reviewer`, `done`) is not among them.
 */
const TRANSITION_REVIEW_LINE =
	/^[-*]\s*(?:review-state: in_review|review-implementer: \S+)$/u;

const SLICE_HEADING = /^#{2,4}\s+(S\d+)\b/u;
const KEY_SEPARATOR = '\u0000';

const keyOf = (file: string, slice: string, line: string): string =>
	[file, slice, line].join(KEY_SEPARATOR);

/** The slice each line of a proposal belongs to; none before the first. */
const slicesByLine = (text: string): readonly string[] => {
	let slice = '';
	return text.split('\n').map((line) => {
		slice = SLICE_HEADING.exec(line)?.[1] ?? slice;
		return slice;
	});
};

/** Every review line of a document, keyed by file, slice and exact text. */
export const reviewLineKeys = (
	file: string,
	text: string,
): readonly string[] => {
	const slices = slicesByLine(text);
	return text
		.split('\n')
		.flatMap((line, index) =>
			REVIEW_LINE.test(`+${line}`)
				? [keyOf(file, slices[index] ?? '', line.trim())]
				: [],
		);
};

interface IAddedLine {
	readonly text: string;
	/** Its key, when the commit's documents say which slice it is in. */
	readonly key?: string;
}

const HUNK = /^@@ -\S+ \+(\d+)(?:,\d+)? @@/u;

/** The review lines a diff adds, with the slice each landed in. */
const addedReviewLines = (commit: ICommitChange): readonly IAddedLine[] => {
	const found: IAddedLine[] = [];
	let file = '';
	let lineNumber = 0;
	for (const row of commit.diff.split('\n')) {
		if (row.startsWith('+++ ')) {
			file = row.slice(4).replace(/^b\//u, '');
			continue;
		}
		const hunk = HUNK.exec(row);
		if (hunk !== null) {
			lineNumber = Number(hunk[1]);
			continue;
		}
		if (!row.startsWith('+')) continue;
		if (REVIEW_LINE.test(row)) {
			const document = commit.documents?.get(file);
			const slice =
				document === undefined
					? undefined
					: slicesByLine(document)[lineNumber - 1];
			const text = row.slice(1).trim();
			found.push(
				slice === undefined
					? { text }
					: { text, key: keyOf(file, slice, text) },
			);
		}
		lineNumber += 1;
	}
	return found;
};

/**
 * The commits that add a review line without being the tool's, oldest
 * first. A line passes when it is:
 *  - byte-identical to one a tool commit wrote earlier in the range or
 *    the range base carries (`known`), in the same proposal and slice:
 *    a revert or a restore of a tool verdict;
 *  - or the transition-to-review shape in the reconciler's keep commit
 *    that also stamps a `last-transition-id`: the swallowed write of a
 *    transition, which writes those lines and no others.
 */
export const handWrittenVerdicts = (
	commits: readonly ICommitChange[],
	known: ReadonlySet<string> = new Set(),
): readonly {
	readonly sha: string;
	readonly subject: string;
	readonly lines: readonly string[];
}[] => {
	const written = new Set(known);
	return commits.flatMap((commit) => {
		if (TOOL_SUBJECT.test(commit.subject)) {
			for (const [file, text] of commit.documents ?? [])
				for (const key of reviewLineKeys(file, text)) written.add(key);
			return [];
		}
		const keptTransition =
			KEEP_SUBJECT.test(commit.subject) &&
			TRANSITION_ID_LINE.test(commit.diff);
		const lines = addedReviewLines(commit)
			.filter(
				(added) =>
					!(added.key !== undefined && written.has(added.key)) &&
					!(
						keptTransition &&
						TRANSITION_REVIEW_LINE.test(added.text)
					),
			)
			.map((added) => added.text);
		return lines.length === 0
			? []
			: [{ sha: commit.sha, subject: commit.subject, lines }];
	});
};

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
		'--reverse',
		'--no-merges',
		'--format=%H%x09%s',
		`${base}..HEAD`,
		'--',
		PROPOSALS_DIR,
	]);
	const documentsAt = (sha: string): ReadonlyMap<string, string> =>
		new Map(
			git(root, [
				'show',
				'--name-only',
				'--format=',
				sha,
				'--',
				PROPOSALS_DIR,
			])
				.split('\n')
				.filter((file) => file.length > 0)
				.flatMap((file) => {
					try {
						return [
							[
								file,
								git(root, ['show', `${sha}:${file}`]),
							] as const,
						];
					} catch {
						return [];
					}
				}),
		);
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
				documents: documentsAt(sha),
			};
		});
	const known = new Set<string>();
	for (const file of new Set(
		commits.flatMap((c) => [...c.documents.keys()]),
	)) {
		try {
			for (const key of reviewLineKeys(
				file,
				git(root, ['show', `${base}:${file}`]),
			))
				known.add(key);
		} catch {
			// the file did not exist at the base
		}
	}
	const offenders = handWrittenVerdicts(commits, known);
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
